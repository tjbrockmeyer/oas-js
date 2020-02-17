const jsonschema = require('jsonschema');
const utils = require('./utils');
const Endpoint = require('./endpoint');
const express = require('express');
const swaggerUi = require('swagger-ui-express');

class OpenAPI {
  /**
   * Create an Open API Specification.
   * @param title {string}
   * @param description {string}
   * @param serverUrl {string}
   * @param version {string} - A version in the following format: major.minor.patch
   * @param schemas {Object<string,Object>}
   * @param tags {{name:string,description:string}[]}
   * @param middleware {[function(next:function(Data):*):function(Data):*]?}
   */
  constructor(title, description, serverUrl, version, schemas, tags, middleware=[]) {
    this.doc = {
      openapi: '3.0.0',
      info: {
        title,
        description,
        version
      },
      servers: [{
        url: serverUrl,
        description: title
      }],
      tags,
      paths: {},
      components: {
        schemas: {}
      }
    };
    /** @type {e.Router} */
    this.router = express.Router();
    /** @type {Object.<string,Endpoint>} */
    this.endpoints = {};
    /** @type {function(Data, Response, Error)} */
    this.responseAndErrorHandler = (data, response, error) => {
      if(error) {
        console.error(error);
      }
    };

    /** @private */
    this._validator = new jsonschema.Validator();
    /** @private */
    this._middleware = [...middleware].reverse();
    /** @private */
    this._schemaObjectsToNames = new Map(Object.getOwnPropertyNames(schemas).map(n => ([schemas[n], `{${n}}`])));

    Object.getOwnPropertyNames(schemas).forEach(n => {
      utils.schemaReplaceObjectRefsInPlace(schemas[n], this._schemaObjectsToNames);
      this.doc.components.schemas[n] = utils.schemaRefReplace(schemas[n], utils.refNameToSwaggerRef);
      this._validator.addSchema(schemas[n], n);
    });
  }

  /**
   * Create a new endpoint in this specification.
   * @param operationId {string}
   * @param method {string}
   * @param path {string}
   * @param summary {string}
   * @param description {string}
   * @param tags {string[]}
   * @returns {Endpoint}
   */
  newEndpoint(operationId, method, path, summary, description, tags) {
    return new Endpoint(this, operationId, method, path, summary, description, tags);
  }

  save() {
    const result = jsonschema.validate(this.doc, require('./openapi-3_0_0-schema'));
    if(!result.valid) {
      result.errors.forEach(e => console.error('  ' + e.toString()));
      throw new Error('Specification failed OpenAPI 3.0.0 validation. See logs for errors.');
    }
    this.router.use('/api/docs', swaggerUi.serve);
    this.router.get('/api/docs', swaggerUi.setup(
      this.doc, undefined, undefined, undefined, undefined, undefined, this.doc.info.title));
  }
}

module.exports = OpenAPI;