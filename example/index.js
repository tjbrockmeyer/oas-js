const {OpenAPI, Response, toExpressPath} = require('..');
const express = require('express');

const schemas = {
  Apple: {type: 'object', properties: {abc: {type: 'integer'}}},
  Banana: {type: 'object', properties: {def: {type: 'string'}}},
  Carrot: {type: 'object', properties: {ghi: {type: 'boolean'}}},
};

function myMiddleware(req, res, next) {
  console.log('hello from myMiddleware!')
  next()
}

function main() {
  const port = 8001
  const app = express();
  app.use(express.json())
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

  o.newEndpoint('getStuff', 'GET', '/stuff', 'Get some stuff', 'Like, really get some stuff', ['Tag1'])
    .parameter('query', 'name', 'filter by name', false, {type: 'string'}, 'string')
    .parameter('query', 'activeOnly', 'onlyShowActives', false, {type: 'boolean', default: true}, 'bool')
    .parameter('query', 'limit', 'maximum number to retrieve', true, {type: 'integer'}, 'number')
    .response(200, 'Stuff found', {type: 'array', items: {type: 'string'}})
    .define(async data => {
      console.log(data.query.name, data.query.activeOnly === undefined || data.query.activeOnly);
      return new Response(200, [data.query.name]);
    });

  o.newEndpoint('putApple', 'PUT', '/apple', 'Create or update an apple', '', ['Tag2'])
    .requestBody('apple', true, {$ref: schemas.Apple})
    .response(200, 'Updated')
    .response(201, 'Created')
    .define(async data => {
      console.log(data.body);
      return new Response(201);
    });

  o.newEndpoint('getApple', 'GET', '/apple/{id}', 'Get a single apple by ID', 'this is a description', ['Tag2'])
    .parameter('path', 'id', 'The id to retrieve', true, {type: 'integer'}, 'number')
    .response(200, 'Found the apple', {$ref: schemas.Apple})
    .response(204, 'Apple id not found')
    .define(async data => {
      return data.params.id
    })

  return o
}

main()
