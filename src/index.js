/**
 * @file In order to load huge volumes of polygon data into memory without
 * breaking Node (due to its low heap-size limits), the package forks a
 * worker process per polygon layer/shapefile. This module contains
 * functions for initializing them and searching them.
 */

'use strict';

var path = require('path');

var _ = require('lodash');
var async = require('async');

var peliasConfig = require( 'pelias-config' ).generate();
var logger = require( 'pelias-logger' ).get( 'wof-pip-service:master' );

var readStream = require('./readStream');
var geos = require('../../../node-geos/lib/index.js');
var STRtree = geos.STRtree;
var WKTReader = geos.WKTReader;

var reader = new WKTReader();

var requestCount = 0;
// worker processes keyed on layer
var strtrees = {};

var countriesByID = {};

var responseQueue = {};

// don't include `country` here, it makes the bookkeeping more difficult later
var defaultLayers = module.exports.defaultLayers = [
  'borough', // 5
  'county', // 18166
  'dependency', // 39
  'disputed', // 39
  'localadmin', // 106880
  'locality', // 160372
  'macrocounty', // 350
  'macroregion', // 82
  'neighbourhood', // 62936
  'region' // 4698
];

function buildInitialResponseTracker(latitude, longitude, search_layers, responseCallback) {
  return {
    results: [],
    latLon: {latitude: latitude, longitude: longitude},
    search_layers: search_layers,
    numberOfLayersCalled: 0,
    responseCallback: responseCallback,
    countryLayerHasBeenCalled: false,
    lookupCountryByIdHasBeenCalled: false
  };
}

function calculateSearchLayers(search_layers, layers) {
  if (search_layers === undefined) {
    search_layers = layers;
  } else if (search_layers.length === 1 && search_layers[0] === 'country' && strtrees['country']) {
    // in the case where only the country layer is to be searched
    // (and the country layer is loaded), keep search_layers unmodified
    // so that the country layer is queried directly
  } else {
    // take the intersection of the valid layers and the layers sent in
    // so that if any layers are manually disabled for development
    // everything still works. this also means invalid layers
    // are silently ignored
    search_layers = _.intersection(search_layers, layers);
  }

  return search_layers;
}

module.exports.create = function createPIPService(layers, callback) {
  if (!hasDataDirectory()) {
    logger.error('Could not find whosonfirst data directory in configuration');
    process.exit( 2 );
  }

  var directory = peliasConfig.imports.whosonfirst.datapath;

  if (!_.endsWith(directory, '/')) {
    directory = directory + '/';
  }

  // if no layers were supplied, then use default layers and the only parameter
  //  is the callback
  if (!(layers instanceof Array) && typeof layers === 'function') {
    callback = layers;
    layers = defaultLayers;
  }

  // load all layers, including country, which is a special case
  async.forEach(layers.concat('country'), function (layer, done) {
    loadLayer(directory, layer, function (err, strtree) {
      strtrees[layer] = strtree;
      done();
    });
  }, function end() {
    logger.info('PIP Service Loading Completed!!!');

    callback(null, {
      end: onEnd,
      lookup: function (latitude, longitude, responseCallback, search_layers) {
        search_layers = calculateSearchLayers(search_layers, layers);

        var id = requestCount;
        requestCount++;

        if (responseQueue.hasOwnProperty(id)) {
          var msg = "Tried to create responseQueue item with id " + id + " that is already present";
          logger.error(msg);
          return responseCallback(null, []);
        }

        // bookkeeping object that tracks the progress of the request
        responseQueue[id] = buildInitialResponseTracker(latitude, longitude, search_layers, responseCallback);

        search_layers.forEach(function(layer) {
          searchStrtree(id, strtrees[layer], {latitude: latitude, longitude: longitude});
        });
      }
    });
  });
};

function onEnd() {
  // do nothing
}

function validateFeatureGeometry(feature) {
  var geometry = feature.geometry;
  if ('Polygon' === geometry.type) {
    if (feature.geometry.coordinates.length < 4) {
      return false;
    } else {
      return true;
    }
  } else if ('MultiPolygon' === geometry.type) {
    var ok = true;
    feature.geometry.coordinates.forEach(function(polygon) {
      polygon.forEach(function(ring) {
        if (ring.length != 0 && ring.length < 4) {
          ok = false;
        }
      });
    });
    return ok;
  }
}

function loadLayer(directory, layer, callback) {
  readStream(directory, layer, function(features) {
    logger.info(features.length + ' ' + layer + ' record ids loaded');

    var strtree = new STRtree();
    var geojsonreader = new geos.GeoJSONReader();

    //features = features.filter(validateFeatureGeometry);
    features.forEach(function(feature) {
      var geom = geojsonreader.read(feature.geometry);

      strtree.insert(geom, feature.properties);
    });

    strtree.build();

    // load countries up into an object keyed on id
    if ('country' === layer) {
      countriesByID = features.reduce(function(cumulative, feature) {
        cumulative[feature.properties.Id] = feature.properties;
        return cumulative;
      }, {});
    }

    logger.info( 'Done loading ' + layer );
    logger.info(layer + ' finished loading ' + features.length + ' features in ');

    //callback with strtree
    callback(null, strtree);
  });
}

var c = 0;

function searchStrtree(id, strtree, coords) {
  var point = reader.read('POINT ( ' + coords.latitude + ' ' + coords.longitude + ')' );
  if (!_.isNumber(coords.latitude) || !_.isNumber(coords.longitude)) {
    console.log(coords);
    console.log(point);
  }

  handleResults(strtree.query(point), id);
}

function lookupCountryById(id, countryId) {
  var country = countriesByID[id] || {};
  handleResults(country, id);
}

function handleResults(results, id) {
  // logger.info('RESULTS:', JSON.stringify(msg, null, 2));

  if (!responseQueue.hasOwnProperty(id)) {
    logger.error("tried to handle results for missing id " + id);
    return;
  }

  if (!_.isEmpty(results) ) {
    responseQueue[id].results.push(results);
  }
  responseQueue[id].numberOfLayersCalled++;

  // early exit if we're still waiting on layers to return
  if (!allLayersHaveBeenCalled(responseQueue[id])) {
    return;
  }

  // all layers have been called, so process the results, potentially calling
  //  the country layer or looking up country by id
  if (countryLayerShouldBeCalled(responseQueue[id], strtrees)) {
      // mark that countryLayerHasBeenCalled so it's not called again
      responseQueue[id].countryLayerHasBeenCalled = true;

      searchStrtree(id, strtrees.country, responseQueue[id].latLon);
  } else if (lookupCountryByIdShouldBeCalled(responseQueue[id])) {
      // mark that lookupCountryById has already been called so it's not
      //  called again if it returns nothing
      responseQueue[id].lookupCountryByIdHasBeenCalled = true;

      lookupCountryById(id, getCountryId(responseQueue[id].results));
  } else {
    // all info has been gathered, so return
    responseQueue[id].responseCallback(null, responseQueue[id].results);
    delete responseQueue[id];
  }
}

// helper function that gets the id of the first result with a hierarchy country id
// caveat:  this will produce inconsistent behavior if results have different
//  hierarchy country id values (which shouldn't happen, otherwise it's bad data)
//
// it's safe to assume that at least one result has a hierarchy country id value
//  since the call to `lookupCountryByIdShouldBeCalled` has already confirmed it
//  and this function is called in combination
function getCountryId(results) {
  for (var i = 0; i < results.length; i++) {
    for (var j = 0; j < results[i].Hierarchy.length; j++) {
      if (results[i].Hierarchy[j].hasOwnProperty('country_id')) {
        return results[i].Hierarchy[j].country_id;
      }
    }
  }
}

// helper function to determine if country should be looked up by id
// returns `false` if:
// 1.  there are no results (lat/lon is in the middle of an ocean)
// 2.  no result has a hierarchy country id (shouldn't happen but guard against bad data)
// 3.  lookupCountryByIdHasBeenCalled has already been called
// 4.  there is already a result with a `country` Placetype
//
// in the general case, this function should return false because the country
// polygon lookup is normally skipped for performance reasons but country needs
// to be looked up anyway
function lookupCountryByIdShouldBeCalled(q) {
  // helper that returns true if at least one Hierarchy of a result has a `country_id` property
  var hasCountryId = function(result) {
    return result.Hierarchy.length > 0 &&
            _.some(result.Hierarchy, function(h) { return h.hasOwnProperty('country_id')});
  }

  var isCountryPlacetype = function(result) {
    return result.Placetype === 'country';
  }

  // don't call if no results or any result has a country id
  if (q.results.length === 0 || !_.some(q.results, hasCountryId)) {
    return false;
  }

  // don't call lookupCountryById if it's already been called
  if (q.lookupCountryByIdHasBeenCalled) {
    return false;
  }

  // return true if there are no results with 'country' Placetype
  return !_.some(q.results, isCountryPlacetype);
}

// helper to determine if all requested layers have been called
// need to check `>=` since country is initially excluded but counted when the worker returns
function allLayersHaveBeenCalled(q) {
  return q.numberOfLayersCalled >= q.search_layers.length;
}

// country layer should be called when the following 3 conditions have been met
// 1. no other layers returned anything (when a point falls under no subcountry polygons)
// 2. country layer has not already been called
// 3. there is a country layer available (don't crash if it hasn't been loaded)
function countryLayerShouldBeCalled(q, workers) {
  return q.results.length === 0 && // no non-country layers returned anything
          !q.countryLayerHasBeenCalled &&
          workers.hasOwnProperty('country');
}

function hasDataDirectory() {
  return peliasConfig.imports.hasOwnProperty('whosonfirst') &&
    peliasConfig.imports.whosonfirst.hasOwnProperty('datapath');
}
