'use strict';

var map = require('through2-map');
var _ = require('lodash');
const logger = require('pelias-logger').get('extractFields');

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

function getOfficialLangName(wofData, langProperty) {
  var languages = wofData.properties[langProperty];

  // convert to array in case it is just a string
  if (!(languages instanceof Array)) {
    languages = [languages];
  }

  if (languages.length > 1) {
    logger.info(`more than one ${langProperty} specified`,
      wofData.properties['wof:lang_x_official'], languages);
  }

  // for now always just grab the first language in the array
  return `name:${languages[0]}_x_preferred`;
}

function getLocalizedName(wofData, langProperty) {

  if (wofData.properties.hasOwnProperty(langProperty) && !_.isEmpty(wofData.properties[langProperty])) {

    // build the preferred lang key to use for name, like 'name:deu_x_preferred'
    var official_lang_key = getOfficialLangName(wofData, langProperty);

    // check if that language is available
    if (wofData.properties.hasOwnProperty(official_lang_key)) {

      logger.debug(langProperty, '[using]', wofData.properties[official_lang_key],
        wofData.properties['wof:placetype'], wofData.properties['wof:id']);

      if (wofData.properties['wof:name'] !== wofData.properties[official_lang_key][0]) {
        logger.debug('name !== official', wofData.properties['wof:name'],
          wofData.properties[official_lang_key], official_lang_key);
      }

      // return the right name if all went well
      return wofData.properties[official_lang_key][0];
    }
    else {
      logger.debug(langProperty, '[missing]', official_lang_key, wofData.properties['wof:name'],
        wofData.properties['wof:placetype'], wofData.properties['wof:id']);
    }
  }
  return false;
}

function getPropertyValue(wofData, property) {
  if (wofData.properties.hasOwnProperty(property)) {
    logger.debug(property, '[using]', wofData.properties['wof:placetype'],
      wofData.properties['wof:id']);
    return wofData.properties[property];
  }
  return false;
}

function getName(wofData) {

  // if this is a US county, use the qs:a2_alt for county
  // eg - wof:name = 'Lancaster' and qs:a2_alt = 'Lancaster County', use latter
  if (isUsCounty(wofData)) {
    return getPropertyValue(wofData, 'qs:a2_alt');
  }

  // attempt to use the following in order of priority and fallback to wof:name if all else fails
  return getLocalizedName(wofData, 'wof:lang_x_official') ||
    getLocalizedName(wofData, 'wof:lang') ||
    getPropertyValue(wofData, 'wof:label') ||
    getPropertyValue(wofData, 'wof:name');
}