'use strict';

var http = require('http'),
    url = require('url'),
    querystring = require('querystring'),
    ogr2ogr = require('ogr2ogr'),
    winston = require('winston');

exports.createServer = function(config) {
   return new Server(config);
}


function Server (interfaces) {

    this.ifacedef = interfaces;
    var that = this;

    // iterate through interfaces
        // initialize index and data store
        // open dataset
        // iterate though features, updating index and store
        // configure interface

    // create server
    this.server = http.createServer(function(req, resp) { 
        return that.listener(req, resp); });
}

Server.prototype.listener = function(req, resp) {

    resp.writeHead(200, {
       'Content-Type': 'application/json',
       'Access-Control-Allow-Origin': '*' });

    resp.write(JSON.stringify(this.ifacedef));
    resp.end();
}


Server.prototype.listen = function() {

    this.server.listen.apply(this.server, arguments);  
}


