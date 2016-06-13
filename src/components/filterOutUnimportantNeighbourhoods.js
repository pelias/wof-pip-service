var filter = require('through2-filter');

// tier_locality has values ranging from 1-7 with 1 being of highly suspect
// validity (East Yoe, Red Lion, PA) and 7 being very important (Soho, New York City)
function isImportant(tier_locality) {
  return tier_locality === 6 || tier_locality === 7;
}

// is_funky has value either 0 or 1 and describes the validity of the data
// 0 should be interpreted as "from an authoritative and trusted source"
// 1 should be interpreted as "from a highly suspect data source and shouldn't be consumed"
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
    // examples of tier_locality/is_funky:
    // 7/0 - Soho, https://whosonfirst.mapzen.com/spelunker/id/85865687/#15/40.7235/-74.0057
    // 7/1 - Baja Noe, https://whosonfirst.mapzen.com/spelunker/id/85887409/#15/37.7540/-122.4231
    // 1/0 - East Yoe, https://whosonfirst.mapzen.com/spelunker/id/85816963/#12/39.9002/-76.6190
    return isImportant(wofData.properties['mz:tier_locality']) &&
            !isFunky(wofData.properties['mz:is_funky']);

  });
}
