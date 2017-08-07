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
        iface.qconfig.bool = typeof(iface.def.searchBool) !== undefined ?
            iface.def.searchBool : 'AND';
        iface.qconfig.expand = typeof(iface.def.searchExpand) !== undefined ?
            iface.def.searchExpand : true; 

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

    if (!['json', 'jsonv2'].includes(q.query.format)) {
        resp.writeHead(405); resp.end(); 
        log.warn( "405 %s (unsupported format '%s').", req.url, q.query.format);
        return;
    } 
   
    var iface = this.ifaces[q.pathname.substring(1)];

    if (!iface) {
        resp.writeHead(404); resp.end(); 
        log.warn( "404 %s (unknown interface '%s').", req.url, q.pathname );
        return;
    }

    var body = this.response(iface,q);
   
    resp.writeHead(200, {
       'Content-Type': 'application/json',
       'Access-Control-Allow-Origin': '*' });

    resp.write(body); 
    resp.end();

    log.info("200 %s (OK)", req.url);
}


Server.prototype.response = function(iface, q) {

    // search
    var results = iface.index.search(q.query.q, iface.qconfig);

    // build return value
    var retval = [];

    var limit = results.length;
    if (typeof(q.query.limit) != 'undefined') 
        limit = Math.min(limit, q.query.limit);

    for (var i = 0; i < limit; i++) {

         var result = iface.db[results[i].ref];
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

    // establish list of searchable properties
    var fields = [];
    var fel = iface.features && iface.features.features
        && iface.features.features.length 
        && iface.features.features[0];
    var exclude = iface.def.searchExclude && new RegExp(iface.def.searchExclude);

    if (fel && fel.properties)
        for (var key in fel.properties)
            if (!exclude || ! key.match(exclude)) fields.push(key);

    // initialize index
    iface.index = elasticlunr(function() {
     
         for (var k=0; k < fields.length; k++) this.addField(fields[k]);
         this.setRef(iface.def.idProperty);
         this.saveDocument(false);
    });
    
    // populate index
    for (var i = 0; i < iface.features.features.length; i++) {
        var doc = {}
        for (var k = 0; k < fields.length; k++) 
            doc[fields[k]] = iface.features.features[i].properties[fields[k]];
        //log.info(doc); 
        iface.index.addDoc(doc);            
    }

    // done
    log.info("searchable properties on iface '%s:':", iface.name);
    log.info("\t" + fields.join(' '));
    log.info("\t%d features in index.", iface.features.features.length);
}

Server.prototype.fillTemplate = function(template,dict){

    var retval = template;

    if (typeof(template) !== 'string') return retval;

    for (var key in dict) if (dict.hasOwnProperty(key))
        retval = retval.replace(new RegExp('\{' + key + '\}','g'), dict[key]);
   
    return retval;
}



Server.prototype.populateDb = function (iface) {

    iface.db = {};

    // for all features on the interface
    for (var i = 0; i < iface.features.features.length; i++) {
        var feature = iface.features.features[i];

        // geometry bounding box
        var bbox = this.geometryBoundingBox(feature);
       
        // build the response entry corresponding to the feature
        var entry = {}; var props = feature.properties;

        entry.lon = 0.5 * (bbox.min[0] + bbox.max[0]);        
        entry.lat = 0.5 * (bbox.min[1] + bbox.max[1]);        

        if (iface.def.iauBoundingBox) {
            // IAU nomenclature files store latlon extents in feature properties
            entry.boundingbox = [
               props.min_lat, props.max_lat, props.min_lon, props.max_lon];            

        } else {
            entry.boundingbox = [
               bbox.min[1], bbox.max[1], bbox.min[0], bbox.max[0]];
        }

        entry.display_name = this.fillTemplate(iface.def.displayName, props);

        entry['class'] = this.fillTemplate(iface.def['class'], props);
        entry.type = this.fillTemplate(iface.def.type, props);
      
        entry.importance = 1; entry.icon = null;
      
        entry.address = {};
        entry.address.region = this.fillTemplate(iface.def.addressRegion, props);
        entry.address.state = this.fillTemplate(iface.def.addressState, props);

        entry.place_id = null; entry.osm_type = null; 
        entry.licence = null; entry.osm_id = null; 

        if (iface.def.debug) entry.orig_feature = feature;

        // store result in database
        iface.db[feature.properties[iface.def.idProperty]] = entry;        
    }
}

Server.prototype.geometryBoundingBox = function (feature) {

    var geometry = feature.geometry;
    var bbox;

    if (geometry.type == 'Point') {

        bbox= {};
        bbox.min = geometry.coordinates.slice();          
        bbox.max = geometry.coordinates.slice();          
    }

    if (['MultiPoint', 'LineString'].includes(geometry.type)) {

        for (var i = 0; i < geometry.coordinates.length; i++ ) {

            var coors = geometry.coordinates[i];

            if (!bbox) {
                bbox = {}; 
                bbox.min = coors.slice();
                bbox.max = coors.slice(); 
            } else {
                bbox.min[0] = Math.min(bbox.min[0], coors[0]);
                bbox.min[1] = Math.min(bbox.min[1], coors[1]);
                bbox.max[0] = Math.min(bbox.max[0], coors[0]);
                bbox.max[1] = Math.min(bbox.max[1], coors[1]); 
            }
        }
    }

    if (['MultiLineString','Polygon'].includes(geometry.type)) {
        for (var i = 0; i < geometry.coordinates.length; i++ )
            for (var j = 0; j < geometry.coordinates[i].length; j++) {

                var coors = geometry.coordinates[i][j];

                if (!bbox) {
                    bbox={}; 
                    bbox.min = coors.slice();
                    bbox.max = coors.slice(); 
                } else {
                    bbox.min[0] = Math.min(bbox.min[0], coors[0]);
                    bbox.min[1] = Math.min(bbox.min[1], coors[1]);
                    bbox.max[0] = Math.min(bbox.max[0], coors[0]);
                    bbox.max[1] = Math.min(bbox.max[1], coors[1]); 
                }
            }
    }

    if (geometry.type == 'MultiPolygon') {
        for (var i = 0; i < geometry.coordinates.length; i++ )
            for (var j = 0; j < geometry.coordinates[i].length; j++)
                for (var k = 0; k < geometry.coordinates[i][j].length; k++) {
                    var coors = geometry.coordinates[i][j][k];

                    if (!bbox) {
                        bbox={}; 
                        bbox.min = coors.slice();
                        bbox.max = coors.slice(); 
                    } else {
                        bbox.min[0] = Math.min(bbox.min[0], coors[0]);
                        bbox.min[1] = Math.min(bbox.min[1], coors[1]);
                        bbox.max[0] = Math.min(bbox.max[0], coors[0]);
                        bbox.max[1] = Math.min(bbox.max[1], coors[1]); 
                    }
                }    
    }

    return bbox;
}

