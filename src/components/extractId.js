var through2 = require('through2');

module.exports.create = function() {
  // this method just returns the id property of an object
  return through2.obj(function(o, enc, callback) {
    callback(null, o.id);
  });
}
