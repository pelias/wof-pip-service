var path = require('path');
var map = require('through2-map');
var fs = require('fs');

module.exports.create = function(datapath) {
  // parse and return JSON contents with Id property appended
  return map.obj(function(id, enc, callback) {
    // id 123456789 -> data/123/456/789/123456789.geojson
    var filename = [
      datapath,
      'data',
      id.substr(0, 3),
      id.substr(3, 3),
      id.substr(6),
      id + '.geojson']
    .join(path.sep);

    var contents = JSON.parse(fs.readFileSync(filename));
    contents.Id = id.toString();

    return contents;

  });
}
