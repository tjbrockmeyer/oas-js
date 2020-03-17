const jsonschema = require('jsonschema');
const utils = require('./utils');
const Endpoint = require('./endpoint');
const express = require('express');
const swaggerUiExpress = require('swagger-ui-express');

/**
 * See {@link oas.OpenAPI.constructor}
 * @memberOf oas
 */
class OpenAPI {
  /**
   * Create an Open API Specification.
   * @param title {string}
   * @param description {string}
   * @param serverUrl {string}
   * @param version {string} - A version in the following format: major.minor.patch
   * @param schemas {Object<string,Object>}
   * @param tags {{name:string,description:string}[]}
   * @param routeCreator {function(oas.Endpoint, function(e.Request, e.Response))}
   */
  constructor(title, description, serverUrl, version, schemas, tags, routeCreator) {
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
    /** @type {Object.<string,oas.Endpoint>} */
    this.endpoints = {};
    /** @type {function(oas.Endpoint, function(e.Request, e.Response))} */
    this.routeCreator = routeCreator

    /** @private */
    this._validator = new jsonschema.Validator();
    /** @private */
    this._schemaObjectsToNames = new Map(Object.getOwnPropertyNames(schemas).map(n => ([schemas[n], `{${n}}`])));

    Object.getOwnPropertyNames(schemas).forEach(n => {
      utils.schemaReplaceObjectRefsInPlace(schemas[n], this._schemaObjectsToNames);
      this.doc.components.schemas[n] = utils.schemaRefReplace(schemas[n], utils.refNameToSwaggerRef);
      this._validator.addSchema(schemas[n], `/${n}`);
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
   * @returns {oas.Endpoint}
   */
  newEndpoint(operationId, method, path, summary, description, tags) {
    return new Endpoint(this, operationId, method, path, summary, description, tags);
  }

  /**
   * Mount the Swagger UI to the given router.
   * @param router {e.Router}
   * @param path {string?}
   */
  swaggerUi(router, path='/docs') {
    router.use(swaggerUiExpress.serve)
    router.get(path, (req, res) => swaggerUiExpress.setup(
      this.doc, undefined, undefined, undefined, undefined, undefined, this.doc.info.title)(req, res))
  }

  /**
   * Handle the sent response and any error that may have occurred.
   * @param data {oas.Data}
   * @param response {oas.Response}
   * @param error {Error?}
   */
  responseAndErrorHandler(data, response, error) {
    if(error) {
      console.error(error);
    }
  }

  /**
   * @private
   */
  validate() {
    const result = jsonschema.validate(this.doc, require('./openapi-3_0_0-schema'));
    if(!result.valid) {
      result.errors.forEach(e => console.error('  ' + e.toString()));
      throw new Error('Specification failed OpenAPI 3.0.0 validation. See logs for errors.');
    }
  }
}

module.exports = OpenAPI;