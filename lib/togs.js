'use strict';

var http = require('http'),
    url = require('url'),
    querystring = require('querystring'),
    ogr2ogr = require('ogr2ogr'),
    winston = require('winston');

exports.createServer = function(config) {
   return new Server(config);
}


function Server (config) {

    this.config = config;

    // iterate through interfaces
        // initialize index and data store
        // open dataset
        // iterate though features, updating index and store
        // configure interface

    // create server
    this.server = http.createServer(function() { return this.listener; });
}

Server.prototype.listener = function(request, response) {
}


Server.prototype.listen = function() {

    this.server.listen.apply(this.server, arguments);  
}


