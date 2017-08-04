'use strict';

var http = require('http'),
    url = require('url'),
    querystring = require('querystring'),
    ogr2ogr = require('ogr2ogr'),
    log = require('winston'),
    elasticlunr = require('elasticlunr');


exports.createServer = function(config) {
   return new Server(config);
}


function Server(ifdefs) {

    var that = this;

    // iterate through interfaces
    this.ifaces = {}

    for (var ifname in ifdefs) {

        var iface = { "name": ifname, "def": ifdefs[ifname] }

        // read features from dataset, then
        getFeatures(iface).then(
            // index, db, start
            iface => { 

                // build search index 
                buildIndex(iface);

                // populate feature database
                populateDb(iface);

                // configure interface
                this.ifaces[iface["name"]] = iface;
                log.info("Interface '%s' ready.", iface.name);

            },
            // or handle errors
            (e) => { log.error(e); });

    }

    // create server
    this.server = http.createServer(function(req, resp) { 
        return that.listener(req, resp); });
}


Server.prototype.listener = function(req, resp) {

    var q = url.parse(req.url, true);

    //log.info(JSON.stringify(q));
    
    var iface = this.ifaces[q["pathname"].substring(1)];

    if (!iface) {
        resp.writeHead(404); resp.end(); 
        log.warn( "404 %s (unknown interface '%s').", req.url, q["pathname"] );
        return;
    }


    var body = this.response(iface,q);
   
    resp.writeHead(200, {
       'Content-Type': 'application/json',
       'Access-Control-Allow-Origin': '*' });

    resp.write(body); 
    resp.end();
}


Server.prototype.response = function(iface, q) {

    // META
    var results = iface.index.search(q.query.q,{ bool: "AND", expand: true });

    var retval = []

    for (var i = 0; i < results.length; i++) {

         var result = iface.db[results[i].ref];

         retval.push({ result });
    }


    return (JSON.stringify(retval,null,4));
}

Server.prototype.listen = function() {

    this.server.listen.apply(this.server, arguments);  
}

function getFeatures(iface) {
  return new Promise((resolve,reject) => {
      var data = [];
      var st = ogr2ogr(iface.def.dataset).stream();
      st.on('data', function(buf) { data.push(buf);});
      st.on('end', function() {
          data = Buffer.isBuffer(data[0]) ? Buffer.concat(data) : data.join('');
          var features = JSON.parse(data);
          iface.features = features;
          resolve(iface);
      });
      st.on('error', reject); 
  });    
}


function buildIndex(iface) {

    // initialize index
    iface.index = elasticlunr(function() {
     
         var fel = iface.features && iface.features.features
           && iface.features.features.length 
           && iface.features.features[0];
     
         if (fel && fel.properties) {
            for (var key in fel.properties) this.addField(key);
            console.log(key);
         }
         this.setRef(iface.def.idProperty);
         this.saveDocument(false);
    });
    
    // populate index
    for (var i = 0; i < iface.features.features.length; i++)  {
        iface.index.addDoc(iface.features.features[i].properties);
    }            
}

function populateDb(iface) {

   iface.db = {};

   for (var i = 0; i < iface.features.features.length; i++) {
      var feature = iface.features.features[i];
      iface.db[feature.properties[iface.def.idProperty]]
        = feature;        
   }
}
