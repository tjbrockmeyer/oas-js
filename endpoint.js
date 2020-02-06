const utils = require('utils');

class Endpoint {
  /**
   * @param spec {OpenAPI}
   * @param operationId {string}
   * @param method {string}
   * @param path {string}
   * @param summary {string}
   * @param description {string}
   * @param tags {string[]}
   */
  constructor(spec, operationId, method, path, summary, description, tags) {
    this.spec = spec;
    this.doc = {
      operationId,
      tags,
      summary,
      description,
      parameters: [],
      responses: {},
      security: [],
    };
    this.error = null;
    this.path = path;
    this.method = method;
    this.options = {};
    this.endpointVersion = 0;
    this.bodyJsonschema = null;
    this.responseSchemas = {};
    this.query = [];
    this.params = [];
    this.headers = [];
    this.userDefinedFunc = () => {
      throw new Error(`endpoint function is not defined for ${this.doc.operationId}`);
    };
    this.fullyWrappedFunc = null;
    spec.endpoints.push(this);
  }

  /**
   * Add an option that may be consumed by middleware.
   * @param key {string}
   * @param value {*}
   * @returns {Endpoint}
   */
  option(key, value) {
    this.options[key] = value;
    return this;
  }

  /**
   * Set the version. This will modify the operationId and the path.
   * @param v {int}
   * @returns {Endpoint}
   */
  version(v) {
    if(v <= 0 || this.endpointVersion) {
      return this;
    }
    this.endpointVersion = v;
    this.doc.operationId += `_v${v}`;
    this.path = `/v${v}${this.path}`;
    return this;
  }

  /**
   * Add a parameter.
   * @param loc {string} - One of {query, path, header}
   * @param name {string}
   * @param description {string}
   * @param required {boolean}
   * @param schema {Object} - A valid jsonschema object.
   * @param type {string} - One of {string, number, bool}, the type to convert the parameter to when recieved.
   * @returns {Endpoint}
   */
  parameter(loc, name, description, required, schema, type) {
    if(type !== 'string' && type !== 'number' && type !== 'bool') {
      this.error = new Error(`invalid type for parameter ${name} in ${loc} of ${this.doc.operationId}`);
      return this;
    }
    utils.schemaRefObjectReplace(schema, this.spec.schemaObjectsToNames);
    const doc = {name, description, in: loc, required, schema};
    const typedDoc = {doc, type, jsonschema: utils.schemaRefReplace(schema, utils.refNameToJsonschemaRef)};

    this.doc.parameters.push(utils.schemaRefReplace(schema, utils.refNameToSwaggerRef));
    switch(loc) {
      case 'query':
        this.query.push(typedDoc);
        break;
      case 'path':
        this.params.push(typedDoc);
        break;
      case 'header':
        this.headers.push(typedDoc);
        break;
      default:
        this.error = new Error(
          `value for 'loc' should be one of {query, path, header} for parameter ${name} in ${this.doc.operationId}`);
        break;
    }
    return this;
  }

  /**
   * Add a request body.
   * @param description {string}
   * @param required {boolean}
   * @param schema {Object}
   * @returns {Endpoint}
   */
  requestBody(description, required, schema) {
    utils.schemaRefObjectReplace(schema, this.spec.schemaObjectsToNames);
    this.bodyJsonschema = utils.schemaRefReplace(schema, utils.refNameToJsonschemaRef);
    this.doc.requestBody = {
      description, required,
      content: {
        'application/json': {
          schema: utils.schemaRefReplace(schema, utils.refNameToSwaggerRef)
        }
      }
    };
    return this;
  }

  /**
   * Add a response.
   * @param code {int} - Status code of the response
   * @param description {string}
   * @param schema {Object} - A valid jsonschema object
   * @returns {Endpoint}
   */
  response(code, description, schema) {
    const key = String(code);
    const doc = {description};
    if(schema !== undefined) {
      utils.schemaRefObjectReplace(schema, this.spec.schemaObjectsToNames);
      this.responseSchemas[key] = utils.schemaRefReplace(schema, utils.refNameToJsonschemaRef);
      doc.content = {
        'application/json': {
          schema: utils.schemaRefReplace(schema, utils.refNameToSwaggerRef)
        }
      }
    }
    this.doc.responses[key] = doc;
    return this;
  }

  /**
   * Deprecate the endpoint.
   * @param comment {string} - A comment about the deprecation
   * @returns {Endpoint}
   */
  deprecate(comment) {
    this.doc.deprecated = true;
    if(comment !== undefined) {
      this.doc.description += `<br/>DEPRECATED: ${comment}`
    }
    return this;
  }

  /**
   * Add a security requirement to this endpoint.
   * @param requirements {Object<string,string[]>} - A map of security requirement names to their scopes.
   *   Many entries may be created. Only one entry must be satisfied to access the endpoint.
   *   All mapped requirements in the entry must be satisfied in order to satisfy the entry.
   * @returns {Endpoint}
   */
  security(requirements) {
    this.doc.security.push(requirements);
    return this;
  }

  define(func) {
    const dataSchema = {
      type: 'object',
      required: ['query', 'params', 'headers'],
      properties: {
        query: {
          type: 'object',
          required: [],
          properties: {}
        },
        params: {
          type: 'object',
          required: [],
          properties: {}
        },
        headers: {
          type: 'object',
          required: [],
          properties: {}
        },
      }
    };

    if(this.doc.requestBody !== undefined) {
      dataSchema.properties.body = this.bodyJsonschema;
      if(this.doc.requestBody.required) {
        dataSchema.required.push('body');
      }
    }
    const addToSchema = (schema, typedParam) => {
      schema.properties[typedParam.doc.name] = typedParam.jsonschema;
      if(typedParam.doc.required) {
        schema.required.push(typedParam.doc.name);
      }
    };
    this.query.forEach(p => addToSchema(dataSchema.properties.query, p));
    this.params.forEach(p => addToSchema(dataSchema.properties.params, p));
    this.headers.forEach(p => addToSchema(dataSchema.properties.headers, p));

    this.dataSchema = dataSchema;

    let pathItem = this.spec.doc.paths[this.path];
    if(pathItem === undefined) {
      pathItem = {};
      this.spec.doc.paths[this.path] = pathItem;
    }
    pathItem[this.method] = this.doc;


    this.userDefinedFunc = func;
    if(this.spec.middleware.length) {

    }
  }
}