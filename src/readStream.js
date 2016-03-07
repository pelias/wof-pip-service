var parse = require('csv-parse');
var fs = require('fs');
var sink = require('through2-sink');

/*
  This function finds all the `latest` files in `meta/`, CSV parses them,
  pushes the ids onto an array and calls the callback
*/
function readData(directory, type, callback) {
  var wofIds = [];

  var options = {
    delimiter: ',',
    columns: true
  };

  fs.createReadStream(directory + 'meta/wof-' + type + '-latest.csv')
    .pipe(parse(options))
    .pipe(sink.obj(function(data) {
      wofIds.push(data.id);
    }))
    .on('finish', function() {
      callback(wofIds);
    });

}

module.exports = readData;
