const jsonschema = require('jsonschema');
const utils = require('utils');

class OpenAPI {
  constructor(title, description, serverUrl, version, dir, schemas, tags, routeCreator, middleware=[]) {
    this.doc = {
      openapi: '3.0.0',
      info: {
        title,
        description,
        version
      },
      servers: [{
        url: serverUrl,
        description
      }],
      tags,
      paths: {},
      components: {
        schemas: {}
      }
    };
    this.endpoints = [];
    this.validator = new jsonschema.Validator();
    this.middleware = middleware;
    this.routeCreator = routeCreator;
    this.responseAndErrorHandler = (data, response, error) => {
      if(error) {
        console.error(error);
      }
    };
    this.schemaObjectsToNames = new Map(Object.getOwnPropertyNames(schemas).map(n => ([schemas[n], `{${n}}`])));

    Object.getOwnPropertyNames(schemas).forEach(n => {
      utils.schemaRefObjectReplace(schemas[n], this.schemaObjectsToNames);
      this.doc.components.schemas[n] = utils.schemaRefReplace(schemas[n], utils.refNameToSwaggerRef);
      this.validator.addSchema(schemas[n], n);
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
}