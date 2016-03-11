/**
 * A worker processes intended to be launched by the `./master.js` module.
 * Loads one polygon layer into memory, builds a `PolygonLookup` for it, and
 * then returns intersection results for `search` queries.
 */

var logger = require( 'pelias-logger').get('admin-lookup:worker');
var PolygonLookup = require('polygon-lookup');

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
  process.title = context.name;
  context.startTime = Date.now();

  readStream(msg.directory, msg.name, function(features) {
    logger.info(features.length + ' ' + context.name + ' record ids loaded in ' + elapsedTime());
    logger.info(context.name + ' finished building FeatureCollection in ' + elapsedTime());

    context.featureCollection.features = features;
    context.adminLookup = new PolygonLookup( context.featureCollection );

    logger.info( 'Done loading ' + context.name );
    logger.info(context.name + ' finished loading ' + features.length + ' features in ' + elapsedTime());

    process.send( {type: 'loaded', name: context.name} );

  });

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
  var poly = context.adminLookup.search( latLon.longitude, latLon.latitude );

  return (poly === undefined) ? {} : poly.properties;
}
