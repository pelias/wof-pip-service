var path = require('path');
var through = require('through2');
var logger = require( 'pelias-logger' ).get( 'wof-pip-service:loadJSON' );
var fs = require('fs');

module.exports.create = function(datapath) {
  // parse and return JSON contents
  return through.obj(function(record, enc, next) {
    // record.path is provided from WOF in POSIX path format
    // use the path.posix tools to calculate the directory tree
    var record_path = record.path.split(path.posix.sep);
    // then use the OS specific path module to recombine them
    var filename = [ datapath, 'data' ].concat(record_path).join(path.sep);

    try {
      this.push(JSON.parse(fs.readFileSync(filename)));
    }
    catch (e) {
      logger.error('exception occured parsing ' + filename + ': ' + e);
    }

    next();
  });
};
