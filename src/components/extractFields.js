var map = require('through2-map');
var simplify = require('simplify-js');
var _ = require('lodash');

module.exports.create = function() {
  // this function extracts the id, name, placetype, hierarchy, and geometry
  return map.obj(function(wofData) {
    return {
      properties: {
        Id: wofData.properties['wof:id'],
        Name: getName(wofData),
        Placetype: wofData.properties['wof:placetype'],
        Hierarchy: wofData.properties['wof:hierarchy']
      },
      geometry: simplifyGeometry(wofData.geometry)
    };

  });
}

// this function is used to verify that a US county QS altname is available
function isUsCounty(wofData) {
  return 'US' === wofData.properties['iso:country'] &&
        'county' === wofData.properties['wof:placetype'] &&
        !_.isUndefined(wofData.properties['qs:a2_alt']);
}

// if this is a US county, use the qs:a2_alt for county
// eg - wof:name = 'Lancaster' and qs:a2_alt = 'Lancaster County', use latter
function getName(wofData) {
  if (isUsCounty(wofData)) {
    return wofData.properties['qs:a2_alt']
  }

  return wofData.properties['wof:name'];

}

function simplifyGeometry(geometry) {
  if( geometry ) {
    if ('Polygon' === geometry.type) {
      var coordinates = geometry.coordinates[0];
      geometry.coordinates[0] = simplifyCoords(coordinates);
    }
    else if ('MultiPolygon' === geometry.type) {
      var polygons = geometry.coordinates;
      polygons.forEach(function simplify(coordinates, idx) {
        polygons[idx][0] = simplifyCoords(coordinates[0]);
      });
    }
  }

  return geometry;

}

/**
 * @param {array} coords A 2D GeoJson-style points array.
 * @return {array} A slightly simplified version of `coords`.
 */
function simplifyCoords( coords ){
  var pts = coords.map( function mapToSimplifyFmt( pt ){
    return { x: pt[ 0 ], y: pt[ 1 ] };
  });

  var simplificationRate = 0.0003;
  var simplified = simplify( pts, simplificationRate, true );

  return simplified.map( function mapToGeoJsonFmt( pt ){
    return [ pt.x, pt.y ];
  });
}
