/**
 * A worker processes intended to be launched by the `./master.js` module.
 * Loads one polygon layer into memory, builds a `PolygonLookup` for it, and
 * then returns intersection results for `search` queries.
 */

var fs = require('fs');
var path = require('path');
var sink = require( 'through2-sink' );
var through = require( 'through2' );
var logger = require( 'pelias-logger').get('admin-lookup:worker');

// require geostore, an RTree index, and a LevelDB data store
var GeoStore = require('terraformer-geostore').GeoStore;
var RTree = require('terraformer-rtree').RTree;
var LevelStore = require('terraformer-geostore-leveldb');


var readStream = require('./readStream');
var wofRecordStream = require('./wofRecordStream');


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

  logger.debug('MESSAGE: ', msg.type);

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

  context.store = new GeoStore({
    store: new LevelStore(),
    index: new RTree()
  });

  var wofRecords = {};
  readStream(msg.directory, msg.layers, wofRecords, function() {
    var totalCount = Object.keys(wofRecords).length;
    logger.info(totalCount + ' record ids loaded in ' + elapsedTime());

    var count = 0;
    // a stream of WOF records
    wofRecordStream.createWofRecordsStream(wofRecords)
      .pipe(through.obj(function (data, enc, next) {

        count++;
        if (count % 10000 === 0) {
          logger.verbose('Count:', count, 'Percentage:', count/totalCount*100);
        }

        addFeature(data.id.toString(), msg.directory, next);

      }))
      .pipe(sink.obj(function (data) {

      }))
      .on('finish', function () {

        logger.info('finished loading ' + count + ' features in ' + elapsedTime());

        loadFeatureCollection();
      });
  });

}

function addFeature(id, directory, callback) {
  if (id.length < 6) {
    logger.debug('Skipping id: ', id);
    return;
  }

  var pathToJson = path.normalize([directory, 'data', id.substr(0, 3), id.substr(3, 3), id.substr(6), id + '.geojson'].join(path.sep));
  var feature = JSON.parse(fs.readFileSync(pathToJson));

  //var simple = simplify(feature, 0.0001, true);

  //logger.debug(JSON.stringify(Object.keys(feature), null, 2));
  //logger.debug(JSON.stringify(Object.keys(simple), null, 2));

  var smallFeature = {
    type: 'Feature',
    id: feature.properties['wof:id'],
    properties: {
      Id: feature.properties['wof:id'],
      Name: feature.properties['wof:name'],
      Placetype: feature.properties['wof:placetype']
    },
    geometry: feature.geometry
  };

  //logger.debug(smallFeature);

  //context.featureCollection.features.push(smallFeature);
  context.store.add(smallFeature, function (err) {
    if (err) {
      logger.error(err);
    }
    callback(null, smallFeature.properties);
  });
}

/**
 * Load the layer specified by `layerConfig`.
 */
function loadFeatureCollection(){
  logger.info( 'Loaded ', context.name, ' with ', context.featureCollection.features.length, ' features');
  process.send( {type: 'loaded', name: context.name} );
}

function handleSearch(msg) {
  search(msg.coords, function (err, res) {
    process.send({
      name: context.name,
      type: 'results',
      id: msg.id,
      results: res
    });
  });
}


/**
 * Search `adminLookup` for `latLon`.
 */
function search( latLon, callback ){

  var geojson = {
    "type": "Point",
    "coordinates": [latLon.lon, latLon.lat]
  };

  context.store.contains( geojson, function (err, res) {
    if (err) {
      logger.error('GeoStore search resulted in error:', err);
      return callback(null, {});
    }

    if (!res || !(res instanceof Array) || res.length === 0) {
      logger.error('GeoStore search resulted in 0 results', latLon);
      return callback(null, {});
    }

    var results = [];

    res.forEach(function (record) {
      //logger.debug('Results data:', data.properties);
      results.push(record.properties);
    });

    callback(null, results);
  });
}

