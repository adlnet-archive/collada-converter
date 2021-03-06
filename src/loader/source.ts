/// <reference path="context.ts" />
/// <reference path="element.ts" />
/// <reference path="utils.ts" />

module COLLADA.Loader {

    export interface SourceData {
        length: number;
        [index: number]: any;
    }

    export class Source extends COLLADA.Loader.Element {
        sourceId: string;
        count: number;
        stride: number;
        offset: number;
        /** Can be one of: Float32Array, Int32Array, Uint8Array, Array<string> */
        data: COLLADA.Loader.SourceData;
        params: { [s: string]: string; }

        constructor() {
            super();
            this._className += "Source|";
            this.sourceId = null;
            this.count = null;
            this.stride = null;
            this.offset = null;
            this.data = null;
            this.params = {};
        }

        static fromLink(link: Link, context: COLLADA.Context): COLLADA.Loader.Source {
            return COLLADA.Loader.Element._fromLink<COLLADA.Loader.Source>(link, "Source", context);
        }

        /**
        *   Parses a <source> element
        */
        static parse(node: Node, context: COLLADA.Loader.Context): COLLADA.Loader.Source {
            var result: COLLADA.Loader.Source = new COLLADA.Loader.Source();

            result.id = context.getAttributeAsString(node, "id", null, true);
            result.name = context.getAttributeAsString(node, "name", null, false);
            context.registerUrlTarget(result, true);

            Utils.forEachChild(node, function (child: Node) {
                switch (child.nodeName) {
                    case "bool_array":
                        result.sourceId = context.getAttributeAsString(child, "id", null, false);
                        result.data = context.getBoolsContent(child);
                        break;
                    case "float_array":
                        result.sourceId = context.getAttributeAsString(child, "id", null, false);
                        result.data = context.getFloatsContent(child);
                        break;
                    case "int_array":
                        result.sourceId = context.getAttributeAsString(child, "id", null, false);
                        result.data = context.getIntsContent(child);
                        break;
                    case "IDREF_array":
                    case "Name_array":
                        result.sourceId = context.getAttributeAsString(child, "id", null, false);
                        result.data = context.getStringsContent(child);
                        break;
                    case "technique_common":
                        COLLADA.Loader.Source.parseSourceTechniqueCommon(child, result, context);
                        break;
                    case "technique":
                        context.reportUnhandledChild(child);
                        break;
                    default:
                        context.reportUnexpectedChild(child);
                }
            });

            return result;
        }

        /**
        *   Parses a <source>/<technique_common> element
        */
        static parseSourceTechniqueCommon(node: Node, source: COLLADA.Loader.Source, context: COLLADA.Loader.Context) {
            Utils.forEachChild(node, function (child: Node) {
                switch (child.nodeName) {
                    case "accessor":
                        COLLADA.Loader.Source.parseAccessor(child, source, context);
                        break;
                    default:
                        context.reportUnexpectedChild(child);
                }
            });
        }

        /**
        *   Parses a <source>/<technique_common>/<accessor> element
        */
        static parseAccessor(node: Node, source: COLLADA.Loader.Source, context: COLLADA.Loader.Context) {

            var sourceId: string = context.getAttributeAsString(node, "source", null, true);
            source.count = context.getAttributeAsInt(node, "count", 0, true);
            source.stride = context.getAttributeAsInt(node, "stride", 1, false);
            source.offset = context.getAttributeAsInt(node, "offset", 0, false);
            if (sourceId !== "#" + source.sourceId) {
                context.log.write("Source " + source.id + " uses a non-local data source, this is not supported", LogLevel.Error);
            }

            Utils.forEachChild(node, function (child: Node) {
                switch (child.nodeName) {
                    case "param":
                        COLLADA.Loader.Source.parseAccessorParam(child, source, context);
                        break;
                    default:
                        context.reportUnexpectedChild(child);
                }
            });
        }

        /**
        *   Parses a <source>/<technique_common>/<accessor>/<param> element
        */
        static parseAccessorParam(node: Node, source: COLLADA.Loader.Source, context: COLLADA.Loader.Context) {

            var name: string = context.getAttributeAsString(node, "name", null, false);
            var semantic: string = context.getAttributeAsString(node, "semantic", null, false);
            var type: string = context.getAttributeAsString(node, "type", null, true);
            var sid: string = context.getAttributeAsString(node, "sid", null, false);

            if ((name != null) && (type != null)) {
                source.params[name] = type;
            } else if ((semantic != null) && (type != null)) {
                source.params[semantic] = type;
            } else if (type != null) {
                // Both name and semantic are optional
                source.params["unnamed param #" + Object.keys(source.params).length] = type
            } else {
                // Type is required
                context.log.write("Accessor param for source " + source.id + " ignored due to missing type", LogLevel.Warning);
            }
        }
    }
}