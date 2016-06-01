var filter = require('through2-filter');

module.exports.create = function create() {
  return filter.obj(function(wofData) {

    // if this isn't a neighbourhood, just include it
    if (wofData.properties['wof:placetype'] !== 'neighbourhood') {
      return true;
    }

    // only return true if the neighbourhood is important enough
    return wofData.properties['mz:tier_locality'] === 7;

  });
}
