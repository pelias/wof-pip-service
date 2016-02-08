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

var workers = [];

var responseQueue = {};

var defaultLayers = module.exports.defaultLayers = [
  //'continent',
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

  if (directory.slice(-1) !== '/') {
    directory = directory + '/';
  }

  if (!(layers instanceof Array) && typeof layers === 'function') {
    callback = layers;
    layers = defaultLayers;
  }

  async.forEach(layers, function (layer, done) {
      startWorker(directory, layer, function (err, worker) {
        workers.push(worker);
        done();
      });
    },
    function end() {
      logger.info('PIP Service Loading Completed!!!');

      callback(null, {
        lookup: function (latitude, longitude, responseCallback) {
          var id = uid(10);

          responseQueue[id] = {
            results: [],
            resultCount: 0,
            responseCallback: responseCallback
          };
          workers.forEach(function (worker) {
            searchWorker(id, worker, {latitude: latitude, longitude: longitude});
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
  //logger.info('RESULTS:', JSON.stringify(msg, null, 2));

  if (!_.isEmpty(msg.results) ) {
    responseQueue[msg.id].results.push(msg.results);
  }
  responseQueue[msg.id].resultCount++;

  if (responseQueue[msg.id].resultCount === workers.length) {
    responseQueue[msg.id].responseCallback(null, responseQueue[msg.id].results);
    delete responseQueue[msg.id];
  }
}

function hasDataDirectory() {
  return peliasConfig.imports.hasOwnProperty('whosonfirst') &&
    peliasConfig.imports.whosonfirst.hasOwnProperty('datapath');
}
