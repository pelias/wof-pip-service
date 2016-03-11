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
var countryWorker;

var responseQueue = {};

var defaultLayers = module.exports.defaultLayers = [
  //'continent',
  // 'country', // 216
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

  startWorker(directory, 'country', function(err, worker) {
    countryWorker = worker;

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

            var id = uid(10);

            responseQueue[id] = {
              results: [],
              latLon: {latitude: latitude, longitude: longitude},
              search_layers: search_layers,
              resultCount: 0,
              responseCallback: responseCallback
            };

            search_layers.forEach(function(layer) {
              searchWorker(id, workers[layer], {latitude: latitude, longitude: longitude});
            });
          }
        });
      }
    );

  });

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
  responseQueue[msg.id].resultCount++;

  if (responseQueue[msg.id].resultCount >= responseQueue[msg.id].search_layers.length) {
    // check if country data got added
    // if not, add it and figure out how to wait for its response
    if (responseQueue[msg.id].results.length === 0 && !countryAlreadyCalled(responseQueue[msg.id])) {
      searchWorker(msg.id, countryWorker, responseQueue[msg.id].latLon);
    } else {
      responseQueue[msg.id].responseCallback(null, responseQueue[msg.id].results);
      delete responseQueue[msg.id];
    }

  }
}

function countryAlreadyCalled(q) {
  return q.resultCount === q.search_layers.length+1;
}

function hasDataDirectory() {
  return peliasConfig.imports.hasOwnProperty('whosonfirst') &&
    peliasConfig.imports.whosonfirst.hasOwnProperty('datapath');
}
