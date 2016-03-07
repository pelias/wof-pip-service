/**
 * A worker processes intended to be launched by the `./master.js` module.
 * Loads one polygon layer into memory, builds a `PolygonLookup` for it, and
 * then returns intersection results for `search` queries.
 */

var fs = require('fs');
var path = require('path');
var sink = require( 'through2-sink' );
var logger = require( 'pelias-logger').get('admin-lookup:worker');
var PolygonLookup = require('polygon-lookup');
var simplify = require('simplify-js');
var microtime = require('microtime');
var _ = require('lodash');
var es = require('event-stream')

var readStream = require('./readStream');

var context = {
  adminLookup: null,// This worker's `PolygonLookup`.
  name: '', // The name of this layer (eg, 'country', 'neighborhood').
  featureCollection: {
    features: []
  }
};


/**
 * Respond to messages from the parent process
 */
function messageHandler( msg ) {

  //logger.debug('MESSAGE: ', msg.type);

  switch (msg.type) {
    case 'load'   : return handleLoadMsg(msg);
    case 'search' : return handleSearch(msg);
    default       : logger.error('Unknown message:', msg);
  }
}

process.on( 'message', messageHandler );


function elapsedTime() {
  return ((Date.now() - context.startTime)/1000) + ' secs';
}

function handleLoadMsg(msg) {

  context.name = msg.name;
  context.startTime = Date.now();

  readStream(msg.directory, msg.name, function(wofIds) {

    logger.info(wofIds.length + ' ' + context.name + ' record ids loaded in ' + elapsedTime());

    var count = 0;

    // a stream of WOF records
    es.readArray(wofIds).pipe(sink.obj(function (id) {

        if (++count % 10000 === 0) {
          logger.verbose('Layer:', context.name, 'Count:', count, 'Percentage:', count/wofIds.length*100);
        }

        addFeature(id.toString(), msg.directory);
      }))
      .on('finish', function () {

        logger.info(context.name + ' finished building FeatureCollection in ' + elapsedTime());

        loadFeatureCollection();

        logger.info(context.name + ' finished loading ' + count + ' features in ' + elapsedTime());
      });
  });

}

// this function is used to verify that a US county QS altname is available
function isUsCounty(feature) {
  return 'US' === feature.properties['iso:country'] &&
        'county' === feature.properties['wof:placetype'] &&
        !_.isUndefined(feature.properties['qs:a2_alt']);
}

function addFeature(id, directory) {
  if (id.length < 6) {
    logger.debug('Skipping id: ', id);
    return;
  }

  var pathToJson = path.resolve(path.normalize(
    [directory, 'data', id.substr(0, 3), id.substr(3, 3), id.substr(6), id + '.geojson'].join(path.sep)));

  var feature = JSON.parse(fs.readFileSync(pathToJson));

  var simple = simplifyFeature(feature);

  var smallFeature = {
    properties: {
      Id: feature.properties['wof:id'],
      Name: feature.properties['wof:name'],
      Placetype: context.name,
      Hierarchy: feature.properties['wof:hierarchy']
    },
    geometry: ( simple ? simple.geometry : feature.geometry )
  };

  // use QS county altname for name in US
  if (isUsCounty(feature)) {
    smallFeature.properties.Name = feature.properties['qs:a2_alt'];
  }

  context.featureCollection.features.push(smallFeature);
}

function simplifyFeature(feature) {
  if( feature.geometry !== null ) {
    switch (feature.geometry.type) {
      case 'Polygon':
        var coords = feature.geometry.coordinates[0];
        feature.geometry.coordinates[0] = simplifyCoords(coords);
        break;

      case 'MultiPolygon':
        var polys = feature.geometry.coordinates;
        polys.forEach(function simplify(coords, ind) {
          polys[ind][0] = simplifyCoords(coords[0]);
        });
        break;
    }
  }
}

/**
 * @param {array} coords A 2D GeoJson-style points array.
 * @return {array} A slightly simplified version of `coords`.
 */
function simplifyCoords( coords ){
  var pts = coords.map( function mapToSimplifyFmt( pt ){
    return { x: pt[ 0 ], y: pt[ 1 ] };
  });

  var simplificationRate = 0.0003;
  var simplified = simplify( pts, simplificationRate, true );

  return simplified.map( function mapToGeoJsonFmt( pt ){
    return [ pt.x, pt.y ];
  });
}

/**
 * Load the layer specified by `layerConfig`.
 */
function loadFeatureCollection(){
  logger.info( 'Loading ', context.name, ' with ', context.featureCollection.features.length, ' features');
  context.adminLookup = new PolygonLookup( context.featureCollection );
  logger.info( 'Done loading ' + context.name );
  process.send( {type: 'loaded', name: context.name} );
}

function handleSearch(msg) {
  process.send({
    name: context.name,
    type: 'results',
    id: msg.id,
    results: search( msg.coords )
  });
}


/**
 * Search `adminLookup` for `latLon`.
 */
function search( latLon ){
  var startTime = microtime.now();

  var poly = context.adminLookup.search( latLon.longitude, latLon.latitude );

  return (poly === undefined) ? {} : poly.properties;
}
