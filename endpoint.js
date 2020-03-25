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

    /**
     * The documentation for this Operation, in Open API 3 formats
     */
    this.doc = {
      operationId,
      tags,
      summary,
      description,
      parameters: [],
      responses: {},
      security: [],
    };

    /**
     * The spec where this endpoint was defined
     * @type {oas.OpenAPI}
     */
    this.spec = spec;

    /**
     * The url path to reach this endpoint
     * @type {string}
     */
    this.path = path;

    /**
     * The http method of this endpoint
     * @type {string}
     */
    this.method = method.toLowerCase();

    /**
     * User storage for arbitrary options.
     * @type {Object.<string,*>}
     */
    this.options = {}

    /**
     * The function which was added when calling endpoint.define(func)
     * @type {function(data:oas.Data):*}
     */
    this.func = data => {
      throw new Error(`endpoint function is not defined for ${data.endpoint.doc.operationId}`);
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
   * Set an arbitrary option for this endpoint which will be stored in the options object.
   * @param name {string}
   * @param value {*}
   * @returns {oas.Endpoint}
   */
  set(name, value) {
    this.options[name] = value
    return this
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
    const typedDoc = {
      doc: {
        name,
        description,
        in: loc,
        required,
        schema: utils.toOasSchema(schema, this.spec)
      },
      type,
      jsonschema: utils.toJsonschema(schema, this.spec)
    };

    this.doc.parameters.push(typedDoc.doc);
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
    this._bodyJsonschema = utils.toJsonschema(schema, this.spec);
    this.doc.requestBody = {
      description, required,
      content: {
        'application/json': {
          schema: utils.toOasSchema(schema, this.spec)
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
      this._responseSchemas[key] = utils.toJsonschema(schema, this.spec);
      doc.content = {
        'application/json': {
          schema: utils.toOasSchema(schema, this.spec)
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

    this.func = func;
    this.spec.routeCreator(this)
    return this;
  }

  /**
   * Middleware to attach the data object to the request.
   * After this middleware is activated, two new request keys will be available:
   *   req.oasData - The data object for the endpoint call
   *   req.oasResponse - Records the response by observing the actual response object
   * This should be called before any middleware which needs to use the endpoint.
   * @param req {e.Request}
   * @param res {e.Response}
   * @param next {e.NextFunction}
   */
  attachDataMW = (req, res, next) => {
    const data = new utils.Data(req, res, this)
    req['oasData'] = data

    const _status = res.status.bind(res)
    const _set = res.set.bind(res)
    const _json = res.json.bind(res)
    res.status = status => {
      if(res.writableEnded) {
        return res
      }
      data.response.status = status
      return _status(status)
    }
    res.set = (keyOrObj, ...values) => {
      if(res.writableEnded) {
        return res
      }
      if(typeof keyOrObj === 'object') {
        data.response.headers = keyOrObj
      } else {
        data.response.headers[keyOrObj] = values
      }
      return _set.call(res, keyOrObj, ...values)
    }
    res.json = json => {
      if(res.writableEnded) {
        return res
      }
      data.response.body = json
      return _json(json)
    }

    try {
      this._query.forEach(p => data.query[p.doc.name] = utils.convertParamType(p, data.req.query[p.doc.name]));
      this._params.forEach(p => data.params[p.doc.name] = utils.convertParamType(p, data.req.params[p.doc.name]));
      this._headers.forEach(p => data.headers[p.doc.name] = utils.convertParamType(p, data.req.get(p.doc.name)));
      if(this.doc.requestBody !== null) {
        data.body = data.req.body;
      }
    } catch({param, item}) {
      throw utils.JSONValidationError.FromParameterType(this, param, item);
    }
    next()
  }

  /**
   * Middleware to validate the request based on documentation.
   * This should be called after the attachDataMW function.
   * @param req {e.Request}
   * @param res {e.Response}
   * @param next {e.NextFunction}
   * @returns {Promise<void>}
   */
  requestValidationMW = async(req, res, next) => {
    const data = req['oasData']
    try {
      const result = await this.spec.validate(data.asInstance(), this._dataSchema, await this.spec.validatorOptions(this));
      if(!result.valid) {
        next(utils.JSONValidationError.FromValidatorResult(this, 'request', result))
      }
    } catch(error) {
      next(error)
    }
    next()
  }

  /**
   * Call the endpoint as if using a network call.
   * This should be called after the attachDataMW function.
   * After calling, the response will have been sent.
   * @param req {e.Request}
   * @param res {e.Response}
   * @param next {e.NextFunction}
   */
  call = async(req, res, next) => {
    const data = req['oasData']
    try {
      const output = await this.func(data);
      if(output instanceof utils.Response) {
        Object.assign(data.response, output);
      } else if(output !== undefined) {
        data.response.body = output;
      }
    } catch(error) {
      next(error)
    }

    const {response: {ignore, status, headers, body}} = data
    if(!res.writableEnded && !ignore) {
      try {
        res.status(status).set(headers).send(body).end()
      } catch(error) {
        next(error)
      }
    }
    next()
  }

  /**
   * Validate the response body.
   * This should be called after endpoint.call
   * @param req {e.Request}
   * @param res {e.Response}
   * @param next {e.NextFunction}
   * @returns {Promise<void>}
   */
  responseValidationMW = async(req, res, next) => {
    const response = req['oasData'].response
    const responseSchema = this._responseSchemas[response.status];
    if(responseSchema !== undefined) {
      try {
        const result = await this.spec.validate(response.body, responseSchema, await this.spec.validatorOptions(this));
        if(!result.valid) {
          next(utils.JSONValidationError.FromValidatorResult(this, 'response', result))
        }
      } catch(error) {
        next(error)
      }
    }
    next()
  }
}

module.exports = Endpoint;
