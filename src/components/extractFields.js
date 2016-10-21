var map = require('through2-map');
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
      geometry: wofData.geometry
    };

  });
};

// this function is used to verify that a US county QS altname is available
function isUsCounty(wofData) {
  return 'US' === wofData.properties['iso:country'] &&
        'county' === wofData.properties['wof:placetype'] &&
        !_.isUndefined(wofData.properties['qs:a2_alt']);
}

function getOfficialLangName(wofData) {
  var langs = wofData.properties['wof:lang_x_official'];
  var lang = langs;
  if (langs instanceof Array && langs.length > 1) {
    console.log('more than one lang specified, using first: ', wofData.properties['wof:lang_x_official'], langs[0]);
    lang = langs[0];
  }

  return 'name:' + lang + '_x_preferred';
}

// if this is a US county, use the qs:a2_alt for county
// eg - wof:name = 'Lancaster' and qs:a2_alt = 'Lancaster County', use latter
function getName(wofData) {
  if (isUsCounty(wofData)) {
    //console.log('using qs:a2_alt name');
    return wofData.properties['qs:a2_alt']
  }

  if (wofData.properties.hasOwnProperty('wof:lang_x_official') && !_.isEmpty(wofData.properties['wof:lang_x_official'])) {

    // build the preferred lang key to use for name, like 'name:deu_x_preferred'
    var official_lang_key = getOfficialLangName(wofData);

    //console.log('has official lang: ', official_lang_key, wofData.properties['wof:name'], wofData.properties['wof:placetype'], wofData.properties['wof:id']);

    // check if that language is available
    if (wofData.properties.hasOwnProperty(official_lang_key)) {

      //console.log('using official lang name: ', wofData.properties[official_lang_key], wofData.properties['wof:placetype'], wofData.properties['wof:id']);

      // return the right name if all went well
      return wofData.properties[official_lang_key];
    }
  }

  if (wofData.properties.hasOwnProperty('wof:label')) {
    return wofData.properties['wof:label'];
  }

  //console.log('using default wof:name');
  return wofData.properties['wof:name'];
}
