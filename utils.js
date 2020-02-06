/**
 * @param o {*}
 * @param func {function(object:Object,key:string):boolean}
 *   - A function to run for each key. Returns true if the key should also be processed, false if it should be skipped.
 */
function forAllRecursiveKeys(o, func) {
  if(o instanceof Array) {
    o.forEach(i => {
      forAllRecursiveKeys(i, func);
    });
  } else if(typeof o === 'object') {
    Object.getOwnPropertyNames(o).forEach(k => {
      if(func(o, k)) {
        forAllRecursiveKeys(o[k], func);
      }
    });
  }
}

function forAllRefs(schema, func) {
  forAllRecursiveKeys(schema, (object, key) => {
    if(key === '$ref') {
      func(object, key);
      return false;
    }
    return true;
  })
}

module.exports = {

  /**
   * Transform all $ref objects which are referencing another object into jsonschema string references.
   * @param schema {Object}
   * @param schemaObjectsToNames {Map<Object,string>}
   */
  schemaRefObjectReplace: (schema, schemaObjectsToNames) => {
    forAllRefs(schema, (object, key) => {
      const value = object[key];
      if(!schemaObjectsToNames.has(value)) {
        throw new Error(`missing required reference to '${key}'`);
      }
      object[key] = schemaObjectsToNames.get(value);
    });
  },

  /**
   * Transform all $ref objects in a schema into some references.
   * @param schema {Object}
   * @param replaceFunc {function(ref:string):string}
   * @returns {Object}
   */
  schemaRefReplace: (schema, replaceFunc) => {
    schema = JSON.parse(JSON.stringify(schema));
    forAllRefs(schema, (object, key) => {
      const value = object[key];
      if(value.startsWith('{') && value.endsWith('}')) {
        object[key] = replaceFunc(value.slice(1, value.length - 1));
      }
    });
  },

  /**
   * Transform a name into a swagger reference.
   * @param name {string}
   * @returns {string}
   */
  refNameToSwaggerRef: (name) => {
    return `#/components/schemas/${name}`
  },

  /**
   * Transform a name into a jsonschema reference.
   * @param name {string}
   * @returns {string}
   */
  refNameToJsonschemaRef: (name) => {
    return `/${name}`
  }

};