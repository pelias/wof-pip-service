var parse = require('csv-parse');
var fs = require('fs');
var batch = require('batchflow');
var sink = require('through2-sink');

/*
  This function finds all the `latest` files in `meta/`, CSV parses them,
  extracts the required fields, and assigns to a big collection
*/
function readData(directory, types, callback) {
  var wofIds = [];

  batch(types).parallel(2).each(function(idx, type, done) {
    var csv_parser = parse({ delimiter: ',', columns: true });

    fs.createReadStream(directory + 'meta/wof-' + type + '-latest.csv')
    .pipe(csv_parser)
    .pipe(sink.obj(function(data) {
      wofIds.push(data.id);
    }))
    .on('finish', done);

  }).error(function(err) {
    console.error(err);
  }).end(function() {
    callback(wofIds);
  });

}

module.exports = readData;
