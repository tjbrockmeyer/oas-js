/**
 * @type {oas.OpenAPI}
 */
const OpenAPI = require('./openapi');
const {Response, Data, toExpressPath, ref, arrayOf} = require('./utils');

exports.OpenAPI = OpenAPI;
exports.Response = Response;
exports.Data = Data;
exports.toExpressPath = toExpressPath;
exports.ref = ref;
exports.arrayOf = arrayOf;

/**
 * Types belonging to package oas (Open API Specification)
 * @namespace oas
 */
