/**
 * See {@link oas.Data.constructor}
 * @memberOf oas
 */
class Data {
  /**
   * Data to be supplied to an endpoint function for processing.
   * Contains query, path, and header parameters, along with an 'extra' object for attaching information via middleware
   * @param req {e.Request}
   * @param res {e.Response}
   * @param endpoint {oas.Endpoint}
   */
  constructor(req, res, endpoint) {
    /** @type {e.Request} */
    this.req = req;
    /** @type {e.Response} */
    this.res = res;
    /** @type {oas.Endpoint} */
    this.endpoint = endpoint;
    /** @type {Object} */
    this.query = {};
    /** @type {Object} */
    this.params = {};
    /** @type {Object} */
    this.headers = {};
    /** @type {*} */
    this.body = undefined;
    /** @type {oas.Response} */
    this.response = new Response(200)
  }

  asInstance() {
    return ({
      query: this.query,
      params: this.params,
      headers: this.headers,
      body: this.body,
    });
  }
}

/**
 * See {@link oas.Response.constructor}
 * @memberOf oas
 */
class Response {
  /**
   * Return a Response when sending additional information is needed.
   * @param status {int}
   * @param body {*}
   * @param args {Object?} - Additional arguments to attach to the response.
   * @param args.headers {Object?} - Headers to attach to the response.
   * @param args.ignore {boolean?} - Specifies that the response was already handled manually using Data.res
   */
  constructor(status, body=undefined, args={}) {
    /** @type {number} */
    this.status = status;
    /** @type {*} */
    this.body = body;
    /** @type {Object} */
    this.headers = args.headers || {};
    /** @type {boolean} */
    this.ignore = args.ignore || false;
  }
}

/**
 * See {@link oas.JSONValidationError.constructor}
 * @memberOf oas
 */
class JSONValidationError extends Error {
  /**
   * A jsonschema validation error.
   * @param endpoint {oas.Endpoint} - The endpoint which received the error.
   * @param loc {string} - The location of the json object which failed.
   * @param instance {*} - The value which failed validation.
   * @param errors {string[]} - The invalid jsonschema result returned by the validation.
   */
  constructor(endpoint, loc, instance, errors) {
    super();
    this.name = 'JSONValidationError';
    this.message = `${loc} json validation failed`;
    this.endpointOperationId = endpoint.doc.operationId;
    this.in = loc;
    this.errors = errors;
    this.instance = instance;
  }

  /**
   *
   * @param endpoint {oas.Endpoint} - The endpoint which is being validated
   * @param loc {string} - Is the result from validating the 'request' or the 'response'?
   * @param result {ValidatorResult} - The invalid jsonschema result returned by the validation
   * @constructor
   */
  static FromValidatorResult(endpoint, loc, result) {
    return new JSONValidationError(endpoint, loc, result.instance, result.errors.map(e => e.toString()));
  }

  /**
   * @param endpoint {oas.Endpoint} - The endpoint which is being validated
   * @param param {{type:string,doc:{in:string,name:string}}} - The parameter in which an error occurred
   * @param value {string} - The value given for the parameter
   * @returns {oas.JSONValidationError}
   * @constructor
   */
  static FromParameterType(endpoint, param, value) {
    return new JSONValidationError(endpoint, 'request', {[param.doc.in]: {[param.doc.name]: value}},
      [`instance.${param.doc.in}.${param.doc.name} could not be converted to type ${param.type}`]);
  }
}

/**
 * Call func on every single key in every nexted object inside and including 'o'.
 * @param o {Object}
 * @param func {function(o:Object, k:string):boolean} - Returns true if the current key should be entered into.
 */
function forAllRecursiveKeys(o, func) {
  if(o instanceof Array) {
    o.forEach(i => {
      forAllRecursiveKeys(i, func);
    });
  } else if(typeof o === 'object') {
    Object.getOwnPropertyNames(o).forEach(k => {
      const next = o[k]
      if(func(o, k)) {
        forAllRecursiveKeys(next, func);
      }
    });
  }
}

/**
 * Transform all $ref objects in a schema into reference strings using replaceFunc.
 * Retain all functions which are present in the input.
 * @this {oas.OpenAPI}
 * @param schema {Object}
 * @param replaceFunc {function(ref:string):string}
 * @returns {Object}
 */
function schemaRefReplace(schema, replaceFunc) {
  const funcs = []
  const replacer = (key, value) => {
    if(key === '$ref') {
      if(typeof value === 'object') {
        if(!this._schemaObjectsToNames.has(value)) {
          throw new Error(`missing required reference to this object: ${JSON.stringify(value)}`);
        }
        const v = this._schemaObjectsToNames.get(value)
        return replaceFunc(v.slice(1, v.length - 1))
      }
      if(typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        return replaceFunc(value.slice(1, value.length - 1))
      }
    }
    if(typeof value === 'function') {
      const id = funcs.length
      funcs.push(value)
      return `x-oas-function: ${id}`
    }
    return value
  }
  const reviver = (key, value) => {
    if(typeof value === 'string' && value.startsWith('x-oas-function: ')) {
      return funcs[parseInt(value.substring(16))]
    }
    return value
  }
  return JSON.parse(JSON.stringify(schema, replacer), reviver);
}

module.exports = {
  Data,
  Response,
  JSONValidationError,

  /**
   * Convert a path to an express-compatible path.
   * @param path {string}
   * @returns {string}
   */
  toExpressPath(path) {
    return path.replace(/{.*?[^\\]}/g, s => `:${s.slice(1, s.length - 1)}`)
  },

  /**
   * Get a reference to a defined schema with the name 'to'
   * @param to {string}
   * @returns {{$ref: string}}
   */
  ref(to) {
    return {$ref: `{${to}}`}
  },

  /**
   * Get a schema which is an array of the given schema.
   * @param schema {Object}
   * @returns {{type: string, items: *}}
   */
  arrayOf(schema) {
    return {type: 'array', items: schema}
  },

  /**
   * Convert a string item into the given type. Empty strings return as undefined.
   * @param param {{type:string}}
   * @param item {string}
   * @returns {number|boolean|string|undefined}
   */
  convertParamType: (param, item) => {
    if(!item) {
      return;
    }
    switch(param.type) {
      case 'number':
        const n = item * 1;
        if(isNaN(n)) {
          throw {param, item};
        }
        return n;
      case 'bool':
        const b = item.toLowerCase();
        if(b !== 'true' && b !== 'false') {
          throw {param, item}
        }
        return b === 'true';
      case 'string':
        return item;
    }
    throw {param, item};
  },

  /**
   * Modify 'schema' to be compliant with Open API
   * @param schema {Object}
   * @param spec {oas.OpenAPI}
   * @returns {Object}
   */
  toOasSchema: (schema, spec) => {
    const s = schemaRefReplace.call(spec, schema, n => `#/components/schemas/${n}`)
    forAllRecursiveKeys(s, (o, k) => {
      switch(k) {
        case 'dependencies':
          delete o[k]
          return false
        case 'patternProperties':
          o.properties = Object.assign(o.properties || {}, o[k])
          delete o[k]
          break;
        case 'const':
          o.enum = [o[k]]
          delete o[k]
          break;
        case 'x-nullable':
          o.description = (o.description ? o.description + ' - ' : '') + '(nullable)'
          o.allOf = [
            o[k],
            {nullable: true}
          ]
          delete o[k]
          break;
        case 'x-validator':
          delete o[k]
          break;
      }
      return true
    })
    return s
  },

  /**
   * Modify 'schema' to be compliant with Jsonschema
   * @param schema {Object}
   * @param spec {oas.OpenAPI}
   * @returns {Object}
   */
  toJsonschema: (schema, spec) => {
    const s = schemaRefReplace.call(spec, schema, n => `/${n}`)
    forAllRecursiveKeys(s, (o, k) => {
      if(k === 'x-nullable') {
        o.oneOf = [
          o[k],
          {title: 'Null', type: 'null'}
        ]
        delete o[k]
      }
      return true
    })
    return s
  },

};