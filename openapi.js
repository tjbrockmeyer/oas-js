const jsonschema = require('jsonschema');
const utils = require('./utils');
const Endpoint = require('./endpoint');
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

    /**
     * The documentation for this API, in Open API 3 format.
     */
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

    /**
     * All defined endpoints, mapped from their operation IDs
     * @type {Object.<string,oas.Endpoint>}
     */
    this.endpoints = {};

    /**
     * The route creator will add new routes into the router when new endpoints are added to this api
     * @type {function(oas.Endpoint, function(e.Request, e.Response))}
     */
    this.routeCreator = routeCreator

    /**
     * User-defined validator options.
     * A function which will return the needed options for the jsonschema validator.
     * Also useful for async validator dependencies, as all validations are performed synchronously.
     * @returns {Promise<Object.<string,*>>}
     */
    this.validatorOptions = async () => ({})

    /**
     * User defined validator functions.
     * Mapping of names to functions which are available for use in schemas which define string values for the 'x-validator' key.
     * @type {
     *  Object.<string,function(
     *    this:ValidatorResult,
     *    instance:*,
     *    schema:Schema,
     *    options:Options,
     *    ctx:SchemaContext)
     *  >}
     */
    this.validatorFuncs = {}

    /** @private */
    this._validator = new jsonschema.Validator();
    this._validator.attributes['x-validator'] = (instance, schema, options, ctx) => {
      const result = new jsonschema.ValidatorResult(instance, schema, options, ctx);
      let xValidator = schema['x-validator']
      if(!(xValidator instanceof Array)) {
        xValidator = [xValidator]
      }
      xValidator.forEach(v => {
        if(typeof v === 'string') {
          if(typeof this.validatorFuncs[v] === 'function') {
            const s = this.validatorFuncs[v].call(result, instance, schema, options, ctx)
            if(s !== undefined) {
              result.addError(s)
            }
          } else {
            result.addError(
              `x-validator strings (${v}) must reference a defined customValidation function on the OpenAPI object`)
          }
        } else if(typeof v === 'function') {
          const s = v.call(result, instance, schema, options, ctx);
          if(s !== undefined) {
            result.addError(s)
          }
        } else if(typeof v !== 'undefined') {
          result.addError(
            `x-validator type (${typeof v}) must be either a function, a string, or an array of both`)
        }
      })
      return result
    };
    /** @private */
    this._schemaObjectsToNames = new Map(Object.getOwnPropertyNames(schemas).map(n => ([schemas[n], `{${n}}`])));

    Object.getOwnPropertyNames(schemas).forEach(n => {
      this.doc.components.schemas[n] = utils.toOasSchema(schemas[n], this)
      this._validator.addSchema(utils.toJsonschema(schemas[n], this), `/${n}`);
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
  swaggerUi(router, path = '/docs') {
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
   * Validate an instance against a schema which references schemas inside this spec.
   * @param instance {*}
   * @param schema {Object}
   * @returns {ValidatorResult}
   */
  async validate(instance, schema) {
    return this._validator.validate(instance, schema, await this.validatorOptions())
  }

  /**
   * Validate that this spec is compliant with the Open API specification schema.
   * Validate that all references to components in the spec are referencing defined components.
   * @returns {{valid:boolean,missingRefs:string[],errors:string[]}} - Returns true if valid, false otherwise.
   */
  validateSpec() {
    const missingRefs = []
    const errors = []

    const definedRefs = {}
    Object.getOwnPropertyNames(this.doc.components).forEach(cn =>
      Object.getOwnPropertyNames(this.doc.components[cn]).forEach(n => definedRefs[`#/components/${cn}/${n}`] = n))
    JSON.stringify(this.doc, function(key, value) {
      if(key === '$ref' && value.startsWith('#/components/') && definedRefs[value] === undefined) {
        missingRefs.push(value)
      }
      return value
    })

    const result = jsonschema.validate(this.doc, require('./openapi-3_0_0-schema'));
    if(!result.valid) {
      errors.push(...result.errors.map(e => e.toString()));
    }

    return {
      valid: (missingRefs.length === 0 && errors.length === 0),
      missingRefs,
      errors
    }
  }
}

module.exports = OpenAPI;