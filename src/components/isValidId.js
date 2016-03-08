var filter = require('through2-filter');

module.exports.create = function() {
  // this method just returns the id property of an object
  return filter.obj(function(id) {
    return id.length >= 6;
  });
}
