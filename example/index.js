const {OpenAPI, Response, Data} = require('..');
const express = require('express');

const schemas = {
  Apple: {type: 'object', properties: {abc: {type: 'int'}}},
  Banana: {type: 'object', properties: {def: {type: 'string'}}},
  Carrot: {type: 'object', properties: {ghi: {type: 'boolean'}}},
};

const o = new OpenAPI(
  'My API', 'Holds endpoints that do stuff for me', 'http://localhost:8080', '1.0.0', schemas,
  [
    {name: 'Tag1', description: 'This is the first tag'},
    {name: 'Tag2', description: 'This is the second tag'},
  ]);

o.newEndpoint('getStuff', 'GET', '/stuff', 'Get some stuff', 'Like, really get some stuff', ['Tag1'])
  .parameter('query', 'name', 'filter by name', false, {type: 'string'}, 'string')
  .parameter('query', 'activeOnly', 'onlyShowActives', false, {type: 'string', default: true}, 'string')
  .parameter('query', 'limit', 'maximum number to retrieve', true, {type: 'boolean'}, 'bool')
  .response(200, 'Stuff found', {type: 'array', items: {type: 'string'}})
  .define(async data => {
    console.log(data.query.name, data.query.activeOnly === undefined || data.query.activeOnly);
    return new Response(200, [data.query.name]);
  });

o.newEndpoint('putApple', 'PUT', '/apple', 'Create or update an apple', '', ['Tag2'])
  .requestBody('apple', true, schemas.Apple)
  .response(200, 'Updated')
  .response(201, 'Created')
  .define(async data => {
    console.log(data.body);
    return new Response(201);
  });

o.save();

const app = express();
app.use(o.router);

app.listen(8080, 'localhost', () => console.log(`listening at http://localhost:8080`));
