const utils = require('./utils');

/**
 * See {@link oas.Endpoint.constructor}
 * @memberOf oas
 */
class Endpoint {
  /**
   * @param spec {oas.OpenAPI}
   * @param operationId {string}
   * @param method {string}
   * @param path {string}
   * @param summary {string}
   * @param description {string}
   * @param tags {string[]}
   */
  constructor(spec, operationId, method, path, summary, description, tags) {
    this.doc = {
      operationId,
      tags,
      summary,
      description,
      parameters: [],
      responses: {},
      security: [],
    };
    /** @type {oas.OpenAPI} */
    this.spec = spec;
    /** @type {string} */
    this.path = path;
    /** @type {string} */
    this.method = method.toLowerCase();
    /** @type {function(data:Data):*} */
    this.userDefinedFunc = data => {
      throw new Error(`endpoint function is not defined for ${this.doc.operationId}`);
    };

    /** @private */
    this._endpointVersion = 0;
    /** @private */
    this._bodyJsonschema = null;
    /** @private */
    this._dataSchema = {};
    /** @private */
    this._responseSchemas = {};
    /** @private */
    this._query = [];
    /** @private */
    this._params = [];
    /** @private */
    this._headers = [];
    /** @private */
    this._fullyWrappedFunc = data => this.userDefinedFunc(data);

    if(spec.endpoints[operationId] !== undefined) {
      throw new Error(`duplicate endpoint definition for operationId: ${operationId}`);
    }
    spec.endpoints[operationId] = this;
  }

  /**
   * Set the version. This will modify the operationId and the path.
   * @param v {int}
   * @returns {oas.Endpoint}
   */
  version(v) {
    if(v <= 0 || this._endpointVersion) {
      return this;
    }
    this._endpointVersion = v;
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
   * @param type {string} - One of {string, number, bool}, the type to convert the parameter to when received.
   * @returns {oas.Endpoint}
   */
  parameter(loc, name, description, required, schema, type) {
    if(type !== 'string' && type !== 'number' && type !== 'bool') {
      throw new Error(`invalid type for parameter ${name} in ${loc} of ${this.doc.operationId} (must be one of {string,number,bool})`);
    }
    utils.schemaReplaceObjectRefsInPlace(schema, this.spec._schemaObjectsToNames);
    const doc = {
      name,
      description,
      in: loc,
      required,
      schema: utils.schemaRefReplace(schema, utils.refNameToSwaggerRef)
    };
    const typedDoc = {doc, type, jsonschema: utils.schemaRefReplace(schema, utils.refNameToJsonschemaRef)};

    this.doc.parameters.push(doc);
    switch(loc) {
      case 'query':
        this._query.push(typedDoc);
        break;
      case 'path':
        this._params.push(typedDoc);
        break;
      case 'header':
        this._headers.push(typedDoc);
        break;
      default:
        throw new Error(`value for 'loc' should be one of {query, path, header} for parameter ${name} in ${this.doc.operationId}`);
    }
    return this;
  }

  /**
   * Add a request body.
   * @param description {string}
   * @param required {boolean}
   * @param schema {Object}
   * @returns {oas.Endpoint}
   */
  requestBody(description, required, schema) {
    utils.schemaReplaceObjectRefsInPlace(schema, this.spec._schemaObjectsToNames);
    this._bodyJsonschema = utils.schemaRefReplace(schema, utils.refNameToJsonschemaRef);
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
   * @param schema {Object?} - A valid jsonschema object
   * @returns {oas.Endpoint}
   */
  response(code, description, schema) {
    const key = String(code);
    const doc = {description};
    if(schema !== undefined) {
      utils.schemaReplaceObjectRefsInPlace(schema, this.spec._schemaObjectsToNames);
      this._responseSchemas[key] = utils.schemaRefReplace(schema, utils.refNameToJsonschemaRef);
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
   * @returns {oas.Endpoint}
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
   * @returns {oas.Endpoint}
   */
  security(requirements) {
    this.doc.security.push(requirements);
    return this;
  }

  /**
   * Define a function to run when calling this endpoint.
   * @param func {function(data:oas.Data):*}
   * @returns {oas.Endpoint}
   */
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
      dataSchema.properties.body = this._bodyJsonschema;
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
    this._query.forEach(p => addToSchema(dataSchema.properties.query, p));
    this._params.forEach(p => addToSchema(dataSchema.properties.params, p));
    this._headers.forEach(p => addToSchema(dataSchema.properties.headers, p));

    this._dataSchema = dataSchema;

    let pathItem = this.spec.doc.paths[this.path];
    if(pathItem === undefined) {
      pathItem = {};
      this.spec.doc.paths[this.path] = pathItem;
    }
    pathItem[this.method] = this.doc;
    this.spec.validate();

    this.userDefinedFunc = func;
    this.spec.routeCreator(this, this.call.bind(this))
    return this;
  }

  /**
   * Call the endpoint as if using a network call.
   * @param req {e.Request}
   * @param res {e.Response}
   */
  async call(req, res) {
    const data = new utils.Data(req, res, this);
    let err;
    let response;

    try {
      this.parseRequest(data);
      const output = await this._fullyWrappedFunc(data);
      if(output instanceof utils.Response) {
        response = output;
      } else {
        response = new utils.Response(200, output);
      }
    } catch(error) {
      if(error instanceof utils.JSONValidationError) {
        response = new utils.Response(400, error);
      } else {
        response = new utils.Response(500, error);
        err = error;
      }
    }

    if(!response.ignore) {
      try {
        res.status(response.status).set(response.headers).json(response.body)
      } catch(error) {
        console.error('error while sending response:', error)
        res.status(500).json({error: 'internal server error', message: 'error while sending response'})
      }
    }

    if(!err) {
      const responseSchema = this._responseSchemas[response.status];
      if(responseSchema !== undefined) {
        const result = this.spec._validator.validate(response.body, responseSchema);
        if(!result.valid) {
          err = new utils.JSONValidationError(this, 'response', result)
        }
      }
    }

    this.spec.responseAndErrorHandler(data, response, err);
  }

  /**
   * Parse the request into the data object.
   * @private
   * @param data {oas.Data}
   */
  parseRequest(data) {
    try {
      this._query.forEach(p => data.query[p.doc.name] = utils.convertParamType(p, data.req.query[p.doc.name]));
      this._params.forEach(p => data.params[p.doc.name] = utils.convertParamType(p, data.req.params[p.doc.name]));
      this._headers.forEach(p => data.headers[p.doc.name] = utils.convertParamType(p, data.req.get(p.doc.name)));
      if(this._bodyJsonschema !== null) {
        data.body = data.req.body;
      }
    } catch({param, item}) {
      throw utils.JSONValidationError.FromParameterType(this, param, item);
    }

    const result = this.spec._validator.validate(data.asInstance(), this._dataSchema);
    if(!result.valid) {
      throw utils.JSONValidationError.FromValidatorResult(this, 'request', result);
    }
  }
}

module.exports = Endpoint;
