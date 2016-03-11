/**
 * @file In order to load huge volumes of polygon data into memory without
 * breaking Node (due to its low heap-size limits), the package forks a
 * worker process per polygon layer/shapefile. This module contains
 * functions for initializing them and searching them.
 */

'use strict';

var path = require('path');
var childProcess = require( 'child_process' );
var logger = require( 'pelias-logger' ).get( 'wof-pip-service:master' );
var peliasConfig = require( 'pelias-config' ).generate();
var async = require('async');
var uid = require('uid');
var _ = require('lodash');

var workers = {};

var responseQueue = {};

var defaultLayers = module.exports.defaultLayers = [
  'country', // 216
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

  async.forEach(layers, function (layer, done) {
      startWorker(directory, layer, function (err, worker) {
        workers[layer] = worker;
        done();
      });
    },
    function end() {
      logger.info('PIP Service Loading Completed!!!');

      callback(null, {
        end: function end() {
          Object.keys(workers).forEach(function (layer) {
            workers[layer].kill();
          });
          countryWorker.kill();
        },
        lookup: function (latitude, longitude, responseCallback, search_layers) {
          if (search_layers === undefined) {
            search_layers = layers;
          } else {
            // take the intersection of the valid layers and the layers sent in
            // so that if any layers are manually disabled for development
            // everything still works. this also means invalid layers
            // are silently ignored
            search_layers = _.intersection(search_layers, layers);
          }

          // exclude country layer initially
          search_layers = _.filter(search_layers, function(layer) { return layer !== 'country' } );

          var id = uid(10);

          responseQueue[id] = {
            results: [],
            latLon: {latitude: latitude, longitude: longitude},
            search_layers: search_layers,
            numberOfLayersCalled: 0,
            responseCallback: responseCallback
          };

          search_layers.forEach(function(layer) {
            searchWorker(id, workers[layer], {latitude: latitude, longitude: longitude});
          });
        }
      });
    }
  );

};

function startWorker(directory, layer, callback) {

  var worker = childProcess.fork(path.join(__dirname, 'worker'));

  worker.on('message', function (msg) {
    if (msg.type === 'loaded') {
      logger.info(msg, 'Worker ' + msg.name + ' just told me it loaded!');
      callback(null, worker);
    }

    if (msg.type === 'results') {
      handleResults(msg);
    }
  });

  worker.send({
    type: 'load',
    name: layer,
    directory: directory
  });
}

function searchWorker(id, worker, coords) {
  worker.send({
    type: 'search',
    id: id,
    coords: coords
  })
}

function handleResults(msg) {
  // logger.info('RESULTS:', JSON.stringify(msg, null, 2));

  if (!_.isEmpty(msg.results) ) {
    responseQueue[msg.id].results.push(msg.results);
  }
  responseQueue[msg.id].numberOfLayersCalled++;

  if (allLayersHaveBeenCalled(responseQueue[msg.id])) {
    if (countryLayerShouldBeCalled(responseQueue[msg.id], workers)) {
        searchWorker(msg.id, workers.country, responseQueue[msg.id].latLon);
    } else {
      responseQueue[msg.id].responseCallback(null, responseQueue[msg.id].results);
      delete responseQueue[msg.id];
    }

  }
}

// helper to determine if all requested layers have been called
// need to check `>=` since country is initially excluded but counted when called
function allLayersHaveBeenCalled(q) {
  return q.numberOfLayersCalled >= q.search_layers.length;
}

// country layer should be called when the following 3 conditions have been met
// 1. no other layers returned anything (when a point falls under no subcountry polygons)
// 2. country layer has not already been called
// 3. there is a country layer available (don't crash if it hasn't been loaded)
function countryLayerShouldBeCalled(q, workers) {
  return noNonCountryLayersReturned(q) &&
          !countryAlreadyCalled(q) &&
          workers.hasOwnProperty('country');
}

// helper to determine if any non-country layers returned results
function noNonCountryLayersReturned(q) {
  return q.results.length === 0;
}

// helper to determine if country layer has already been called
function countryAlreadyCalled(q) {
  return q.numberOfLayersCalled === q.search_layers.length+1;
}

function hasDataDirectory() {
  return peliasConfig.imports.hasOwnProperty('whosonfirst') &&
    peliasConfig.imports.whosonfirst.hasOwnProperty('datapath');
}
