var path = require('path');
var through = require('through2');
var logger = require( 'pelias-logger' ).get( 'wof-pip-service:loadJSON' );
var fs = require('fs');

module.exports.create = function(datapath) {
  // parse and return JSON contents
  return through.obj(function(record, enc, next) {
    // id 123456789 -> data/123/456/789/123456789.geojson
    var filename = [
      datapath,
      'data',
      record.id.substr(0, 3),
      record.id.substr(3, 3),
      record.id.substr(6),
      record.id + '.geojson']
    .join(path.sep);

    try {
      this.push(JSON.parse(fs.readFileSync(filename)));
    }
    catch (e) {
      logger.error('exception occured parsing ' + filename + ': ' + e);
    }

    next();
  });
}
