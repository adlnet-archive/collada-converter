/// <reference path="../math.ts" />
/// <reference path="context.ts" />
/// <reference path="geometry.ts" />
/// <reference path="transform.ts" />

module COLLADA.Converter {

    export class Node {
        name: string;
        parent: COLLADA.Converter.Node;
        children: COLLADA.Converter.Node[];
        geometries: COLLADA.Converter.Geometry[];
        transformations: COLLADA.Converter.Transform[];
        transformation_pre: Mat4;
        transformation_post: Mat4;
        matrix: Mat4;
        worldMatrix: Mat4;
        initialLocalMatrix: Mat4;
        initialWorldMatrix: Mat4;

        constructor() {
            this.name = "";
            this.parent = null;
            this.children = [];
            this.geometries = [];
            this.transformations = [];
            this.matrix = mat4.create();
            this.worldMatrix = mat4.create();
            this.initialLocalMatrix = mat4.create();
            this.initialWorldMatrix = mat4.create();
            this.transformation_pre = mat4.create();
            mat4.identity(this.transformation_pre);
            this.transformation_post = mat4.create();
            mat4.identity(this.transformation_post);
        }

        addTransform(mat: Mat4) {
            var loader_transform = new COLLADA.Loader.NodeTransform();
            loader_transform.data = <Float32Array>mat;
            loader_transform.type = "matrix";
            loader_transform.name = "virtual static transform";
            var transform = new TransformMatrix(loader_transform);
            this.transformations.unshift(transform);
        }

        /**
        * Returns the world transformation matrix of this node
        */
        getWorldMatrix(context: COLLADA.Converter.Context): Mat4 {
            if (this.parent != null) {
                mat4.multiply(this.worldMatrix, this.parent.getWorldMatrix(context), this.getLocalMatrix(context));
            } else {
                mat4.copy(this.worldMatrix, this.getLocalMatrix(context));
            }
            return this.worldMatrix;
        }

        /**
        * Returns the local transformation matrix of this node
        */
        getLocalMatrix(context: COLLADA.Converter.Context) {
            
            // Static pre-transform
            mat4.copy(this.matrix, this.transformation_pre);

            // Original transformations
            for (var i: number = 0; i < this.transformations.length; i++) {
                var transform: COLLADA.Converter.Transform = this.transformations[i];
                transform.applyTransformation(this.matrix);
            }

            // Static post-transform
            mat4.multiply(this.matrix, this.matrix, this.transformation_post);

            return this.matrix;
        }

        /**
        * Returns true if this node contains any scene graph items (geometry, lights, cameras, ...)
        */
        containsSceneGraphItems(): boolean {
            if (this.geometries.length > 0) {
                return true;
            } else {
                return false;
            }
        }

        /**
        * Returns whether there exists any animation that targets the transformation of this node
        */
        isAnimated(recursive: boolean): boolean {
            return this.isAnimatedBy(null, recursive);
        }

        /**
        * Returns whether there the given animation targets the transformation of this node
        */
        isAnimatedBy(animation: COLLADA.Converter.Animation, recursive: boolean): boolean {

            for (var i: number = 0; i < this.transformations.length; i++) {
                var transform: COLLADA.Converter.Transform = this.transformations[i];
                if (transform.isAnimatedBy(animation)) return true;
            }
            if (recursive && this.parent !== null) {
                return this.parent.isAnimatedBy(animation, recursive);
            }
            return false;
        }

        resetAnimation(): void {
            for (var i: number = 0; i < this.transformations.length; i++) {
                var transform: COLLADA.Converter.Transform = this.transformations[i];
                transform.resetAnimation();
            }
        }

        /**
        * Removes all nodes from that list that are not relevant for the scene graph
        */
        static pruneNodes(nodes: COLLADA.Converter.Node[], context: COLLADA.Context) {
            // Prune all children recursively
            for (var n: number = 0; n < nodes.length; ++n) {
                var node: COLLADA.Converter.Node = nodes[n];
                COLLADA.Converter.Node.pruneNodes(node.children, context);
            }

            // Remove all nodes from the list that are not relevant
            nodes = nodes.filter((value: COLLADA.Converter.Node, index: number, array: COLLADA.Converter.Node[]) =>
                (value.containsSceneGraphItems() || value.children.length > 0));
        }

        /**
        * Recursively creates a converter node tree from the given collada node root node
        */
        static createNode(node: COLLADA.Loader.VisualSceneNode, parent: COLLADA.Converter.Node, context: COLLADA.Converter.Context): COLLADA.Converter.Node {
            // Create new node
            var converterNode: COLLADA.Converter.Node = new COLLADA.Converter.Node();
            converterNode.parent = parent;
            if (parent) {
                parent.children.push(converterNode);
            }
            context.nodes.register(node, converterNode);

            converterNode.name = node.name || node.id || node.sid || "Unnamed node";

            // Node transform
            for (var i = 0; i < node.transformations.length; ++i) {
                var transform: COLLADA.Loader.NodeTransform = node.transformations[i];
                var converterTransform: COLLADA.Converter.Transform = null;
                switch (transform.type) {
                    case "matrix":
                        converterTransform = new COLLADA.Converter.TransformMatrix(transform);
                        break;
                    case "rotate":
                        converterTransform = new COLLADA.Converter.TransformRotate(transform);
                        break;
                    case "translate":
                        converterTransform = new COLLADA.Converter.TransformTranslate(transform);
                        break;
                    case "scale":
                        converterTransform = new COLLADA.Converter.TransformScale(transform);
                        break;
                    default:
                        context.log.write("Transformation type " + transform.type + " not supported, transform ignored", LogLevel.Warning);
                }
                if (converterTransform !== null) {
                    context.animationTargets.register(transform, converterTransform);
                    converterNode.transformations.push(converterTransform);
                }
            }

            Node.updateInitialMatrices(converterNode, context);
            
            // Create children
            for (var i: number = 0; i < node.children.length; i++) {
                var colladaChild: COLLADA.Loader.VisualSceneNode = node.children[i];
                var converterChild: COLLADA.Converter.Node = COLLADA.Converter.Node.createNode(colladaChild, converterNode, context);
            }

            return converterNode;
        }

        static updateInitialMatrices(node: COLLADA.Converter.Node, context: COLLADA.Converter.Context) {
            node.getLocalMatrix(context);
            mat4.copy(node.initialLocalMatrix, node.matrix);

            node.getWorldMatrix(context);
            mat4.copy(node.initialWorldMatrix, node.worldMatrix);
        }

        static createNodeData(converter_node: COLLADA.Converter.Node, context: COLLADA.Converter.Context) {

            var collada_node: COLLADA.Loader.VisualSceneNode = context.nodes.findCollada(converter_node);

            // Static geometries (<instance_geometry>)
            for (var i: number = 0; i < collada_node.geometries.length; i++) {
                var loaderGeometry: COLLADA.Loader.InstanceGeometry = collada_node.geometries[i];
                var converterGeometry: COLLADA.Converter.Geometry = COLLADA.Converter.Geometry.createStatic(loaderGeometry, converter_node, context);
                converter_node.geometries.push(converterGeometry);
            }

            // Animated geometries (<instance_controller>)
            for (var i: number = 0; i < collada_node.controllers.length; i++) {
                var loaderController: COLLADA.Loader.InstanceController = collada_node.controllers[i];
                var converterGeometry: COLLADA.Converter.Geometry = COLLADA.Converter.Geometry.createAnimated(loaderController, converter_node, context);
                converter_node.geometries.push(converterGeometry);
            }

            // Lights, cameras
            if (collada_node.lights.length > 0) {
                context.log.write("Node " + collada_node.id + " contains lights, lights are ignored", LogLevel.Warning);
            }
            if (collada_node.cameras.length > 0) {
                context.log.write("Node " + collada_node.id + " contains cameras, cameras are ignored", LogLevel.Warning);
            }

            // Children
            for (var i: number = 0; i < converter_node.children.length; i++) {
                var child: COLLADA.Converter.Node = converter_node.children[i];
                COLLADA.Converter.Node.createNodeData(child, context);
            }
        }

        /**
        * Calls the given function for all given nodes and their children (recursively)
        */
        static forEachNode(nodes: COLLADA.Converter.Node[], fn: (node: COLLADA.Converter.Node) => void) {

            for (var i: number = 0; i < nodes.length; ++i) {
                var node: COLLADA.Converter.Node = nodes[i];
                fn(node);
                COLLADA.Converter.Node.forEachNode(node.children, fn);
            }
        }

        /**
        * Extracts all geometries in the given scene and merges them into a single geometry.
        * The geometries are detached from their original nodes in the process.
        */
        static extractGeometries(scene_nodes: COLLADA.Converter.Node[], context: COLLADA.Converter.Context): COLLADA.Converter.Geometry[] {

            // Collect all geometries and the corresponding nodes
            // Detach geometries from nodes in the process
            var result: { node: COLLADA.Converter.Node; geometry: COLLADA.Converter.Geometry }[] = [];
            COLLADA.Converter.Node.forEachNode(scene_nodes, (node) => {
                for (var i: number = 0; i < node.geometries.length; ++i) {
                    result.push({ node: node, geometry: node.geometries[i] });
                }
                node.geometries = [];
            });

            if (result.length === 0) {
                context.log.write("No geometry found in the scene, returning an empty geometry", LogLevel.Warning);
                var geometry: COLLADA.Converter.Geometry = new COLLADA.Converter.Geometry();
                geometry.name = "empty_geometry";
                return [geometry];
            }

            // Check whether the geometries need a skeleton
            var skinnedGeometries: number = 0;
            var animatedNodeGeometries: number = 0;
            result.forEach((element) => {
                if (element.geometry.getSkeleton() !== null) skinnedGeometries++; 
                if (element.node.isAnimated(true)) animatedNodeGeometries++;
            });

            if (!context.options.createSkeleton.value) {
                if (skinnedGeometries > 0) {
                    context.log.write("Scene contains " + skinnedGeometries + " skinned geometries, but skeleton creation is disabled. Static geometry was generated.", LogLevel.Warning);
                }
                if (animatedNodeGeometries > 0) {
                    context.log.write("Scene contains " + animatedNodeGeometries + " static geometries attached to animated nodes, but skeleton creation is disabled. Static geometry was generated.", LogLevel.Warning);
                }
                // Apply the node transformation to static geometries
                result.forEach((element) => {
                    var world_matrix = element.node.getWorldMatrix(context);
                    if (context.options.worldTransformUnitScale) {
                        var mat: Mat4 = mat4.create();
                        mat4.invert(mat, element.node.transformation_post);
                        mat4.multiply(world_matrix, world_matrix, mat);
                    }
                    COLLADA.Converter.Geometry.transformGeometry(element.geometry, world_matrix, context);
                });
            }

            // Merge all geometries
            if (context.options.singleGeometry) {
                var geometries = result.map((element) => { return element.geometry });
                var geometry: COLLADA.Converter.Geometry = COLLADA.Converter.Geometry.mergeGeometries(geometries, context);
                return [geometry];
            } else {
                return result.map((element) => { return element.geometry });
            }
        }

        static setupWorldTransform(node: COLLADA.Converter.Node, context: COLLADA.Converter.Context) {
            var worldScale: Vec3 = Utils.getWorldScale(context);
            var worldInvScale: Vec3 = Utils.getWorldInvScale(context);
            var worldRotation: Mat4 = Utils.getWorldRotation(context);
            var worldTransform: Mat4 = Utils.getWorldTransform(context);

            var uniform_scale: boolean = context.options.worldTransformUnitScale.value;

            // Pre-transformation
            // Root nodes: the world transformation
            // All other nodes: undo whatever post-transformation the parent has added
            if (node.parent == null) {  
                mat4.copy(node.transformation_pre, worldTransform);
            } else if (uniform_scale) {
                mat4.invert(node.transformation_pre, node.parent.transformation_post);
            }

            // Post-transformation
            if (uniform_scale) {
                // This way, the node transformation will not contain any scaling
                // Only the translation part will be scaled
                mat4.identity(node.transformation_post);
                mat4.scale(node.transformation_post, node.transformation_post, worldInvScale);
            }

            Node.updateInitialMatrices(node, context);

            // Recursively set up children
            for (var i = 0; i < node.children.length; ++i) {
                Node.setupWorldTransform(node.children[i], context);
            }
        }
    }
}