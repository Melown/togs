'use strict';

var http = require('http'),
    url = require('url'),
    querystring = require('querystring'),
    ogr2ogr = require('ogr2ogr'),
    log = require('winston'),
    elasticlunr = require('elasticlunr');

/* Exports */

exports.createServer = function(config) {
   return new Server(config);
}


/* Server prototype methods */

function Server(ifdefs) {

    var that = this;

    // iterate through interfaces
    this.ifaces = {}

    for (var ifname in ifdefs) {

        var iface = { "name": ifname, "def": ifdefs[ifname] };

        // iface query configuration
        iface.qconfig = {};
        iface.qconfig.bool = iface.def.searchBool || 'AND';
        if (iface.def.searchExpand) {
            iface.qconfig.bool = (iface.def.searchExpand == 'true');
        } else {
            iface.qconfig.bool = true;
        };

        // read features from dataset, then
        this.getFeatures(iface).then(
            // index, db, start
            iface => { 

                // build search index 
                that.buildIndex(iface);

                // populate feature database
                that.populateDb(iface);

                // configure interface
                that.ifaces[iface["name"]] = iface;
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

    // search
    var results = iface.index.search(q.query.q, iface.qconfig);

    // build return value
    var retval = []

    for (var i = 0; i < results.length; i++) {

         var result = iface.db[results[i].ref].entry;
         retval.push(result);
    }

    // done
    return (JSON.stringify(retval,null,4));
}

Server.prototype.listen = function() {

    this.server.listen.apply(this.server, arguments);  
}


Server.prototype.getFeatures = function (iface) {
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


Server.prototype.buildIndex = function (iface) {

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

Server.prototype.fillTemplate = function(template,dict){

    var retval = template;

    for (var key in dict) if (dict.hasOwnProperty(key))
        retval = retval.replace(new RegExp('\{' + key + '\}','g'), dict[key]);
   
    return retval;
}


Server.prototype.populateDb = function (iface) {

   iface.db = {};

   // for all features on the interface
   for (var i = 0; i < iface.features.features.length; i++) {
      var feature = iface.features.features[i];

      // build the response entry corresponding to the feature
      var entry = {}; var props = feature.properties;

      // META - bounding box
      // META - lat,lon

      entry.display_name = this.fillTemplate(iface.def.displayName, props);

      entry['class'] = this.fillTemplate(iface.def['class'], props);
      entry.type = this.fillTemplate(iface.def.type, props);
      
      entry.importance = 1; entry.icon = null;
      
      entry.address = {};
      entry.address.region = this.fillTemplate(iface.def.addressRegion, props);
      entry.address.state = this.fillTemplate(iface.def.addressState, props);

      entry.place_id = null; entry.osm_type = null; 
      entry.licence = null; entry.osm_id = null; 

      // store result in database
      // (we store the original feature for diagnostic purposes only)
      iface.db[feature.properties[iface.def.idProperty]]
        = { "entry": entry, "orig_feature": feature };        
   }
}


