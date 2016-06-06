var filter = require('through2-filter');

function isImportant(tier_locality) {
  return tier_locality === 6 || tier_locality === 7;
}

function isFunky(is_funky) {
  return is_funky !== undefined && is_funky === 1;
}

module.exports.create = function create() {
  return filter.obj(function(wofData) {

    // if this isn't a neighbourhood, just include it
    if (wofData.properties['wof:placetype'] !== 'neighbourhood') {
      return true;
    }

    // only return true if the neighbourhood is important enough and isn't funky
    return isImportant(wofData.properties['mz:tier_locality']) &&
            !isFunky(wofData.properties['mz:is_funky']);

  });
}
