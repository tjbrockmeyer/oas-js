const {OpenAPI, Response, toExpressPath, ref, arrayOf} = require('..');
const {JSONValidationError} = require('../utils')
const express = require('express');

function bananaValidation(instance, schema, options, ctx) {
  return 'banana validation'
}

const schemas = {
  Apple: {type: 'object', required: ['abc'], properties: {abc: {type: 'integer'}}},
  Banana: {
    type: 'object',
    properties: {def: {type: 'string'}},
    'x-validator': bananaValidation,
    additionalProperties: false
  },
  Carrot: {type: 'object', required: ['ghi'], properties: {ghi: {type: 'boolean'}}, 'x-validator': 'carrotValidation'},
  Date: {
    allOf: [
      ref('Apple'),
      ref('Banana')
    ],
    'x-validator': [
      'carrotValidation',
      bananaValidation
    ]
  },
  Elephant: {
    anyOf: [
      ref('Apple'),
      ref('Banana')
    ]
  },
  Citrus: {
    patternProperties: {
      [`^or.nge .{2}$`]: ref('Orange')
    }
  },
  Orange: {
    description: 'an orange',
    'x-nullable': {
      oneOf: [
        ref('Apple'),
        ref('Banana')
      ]
    }
  }
};

/** @param api {oas.OpenAPI} */
function customValidation(api) {
  api.validatorFuncs.carrotValidation = function() {
    this.addError('failed carrot validation')
  }
}

function myMiddleware(req, res, next) {
  console.log('hello from myMiddleware!')
  next()
}

function main() {
  const port = 8001
  const app = express();
  app.use(express.json({strict: false}))
  app.listen(8080)
  const routeCreator = (endpoint, handler) => {
    app[endpoint.method](toExpressPath(endpoint.path), [myMiddleware, handler])
  }
  const o = createApi(routeCreator, port)
  o.swaggerUi(app)
  app.listen(port, () => console.log(`listening at http://localhost:${port}/docs`));
}

function createApi(routeCreator, port) {
  const o = new OpenAPI(
    'My API', 'Holds endpoints that do stuff for me', `http://localhost:${port}`, '1.0.0', schemas,
    [
      {name: 'Tag1', description: 'This is the first tag'},
      {name: 'Tag2', description: 'This is the second tag'},
    ], routeCreator);

  o.responseAndErrorHandler = (data, response, error) => {
    console.log(`${data.endpoint.doc.operationId}: ${data.req.method} ${data.req.url} | ${response.status}`)
    if(error) {
      if(error instanceof JSONValidationError) {
        error = {
          message: [error.message, ...error.errors],
          stack: error.stack,
        }
      }
      console.error({
        operationId: data.endpoint.doc.operationId,
        method: data.req.method,
        url: data.req.url,
        reqBody: data.body,
        status: response.status,
        resBody: response.body,
        error: error.message,
        stack: error.stack.split('\n'),
      })
    }
  }

  o.newEndpoint('getStuff', 'GET', '/apple', 'Get some apples', 'Like, really get some apples', ['Tag1'])
    .parameter('query', 'name', 'filter by name', false, {type: 'string'}, 'string')
    .parameter('query', 'activeOnly', 'onlyShowActives', false, {type: 'boolean', default: true}, 'bool')
    .parameter('query', 'limit', 'maximum number to retrieve', true, {type: 'integer'}, 'number')
    .response(200, 'Stuff found', arrayOf(ref('Apple')))
    .define(async data => {
      console.log(data.query.name, data.query.activeOnly === undefined || data.query.activeOnly);
      return new Response(200, [data.query.name]);
    });

  o.newEndpoint('putBanana', 'PUT', '/banana', 'Create or update a banana', '', ['Tag2'])
    .requestBody('apple', true, ref('Banana'))
    .response(200, 'Updated')
    .response(201, 'Created')
    .define(async data => {
      console.log(data.body);
      return new Response(201);
    });

  o.newEndpoint('getCarrot', 'GET', '/carrot/{id}', 'Get a single carrot by ID', 'this is a description', ['Tag2'])
    .parameter('path', 'id', 'The id to retrieve', true, {type: 'integer'}, 'number')
    .response(200, 'Found the carrot', ref('Carrot'))
    .response(204, 'Apple id not found')
    .define(async data => {
      console.log(data.params.id)
      return {ghi: true}
    })

  o.newEndpoint('postOrange', 'POST', '/orange', 'Create an orange', 'this is another description', ['Tag2'])
    .requestBody('orange to create', true, ref('Orange'))
    .response(201, 'Created the orange')
    .response(409, 'Orange already exists')
    .define(async data => {
      console.log(JSON.stringify(data.body, undefined, 2))
    })

  customValidation(o)
  return o
}

main()
