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
var express = require('express');
var app = express();
var _ = require('lodash');

var responseQueue = {};

function hasDataDirectory() {
  return peliasConfig.imports.hasOwnProperty('whosonfirst') &&
    peliasConfig.imports.whosonfirst.hasOwnProperty('datapath');
}

if (!hasDataDirectory()) {
  console.error('Could not find whosonfirst data directory in configuration');
  process.exit( 2 );
}

var directory = peliasConfig.imports.whosonfirst.datapath;

if (directory.slice(-1) !== '/') {
  directory = directory + '/';
}

var layers = [
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

var workers = [];

async.forEach(layers, function (layer, done) {
    startWorker(layer, function (err, worker) {
      workers.push(worker);
      done();
    });
  },
  function end() {

    app.get('/lookup', function (req, res) {
      logger.debug(req.query);

      var id = uid(10);

      responseQueue[id] = {
        results: [],
        resultCount: 0,
        res: res
      };
      workers.forEach(function (worker) {
        searchWorker(id, worker, req.query);
      });

    });

    app.listen(process.env.HOST_PORT || 3333, function () {
      console.log('PIP service listening on port 3333!');
    });

  });

function startWorker(layer, callback) {

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
  logger.info('RESULTS:', JSON.stringify(msg, null, 2));

  if (!_.isEmpty(msg.results) ) {
    responseQueue[msg.id].results.push(msg.results);
  }
  responseQueue[msg.id].resultCount++;

  if (responseQueue[msg.id].resultCount === workers.length) {
    responseQueue[msg.id].res.json(responseQueue[msg.id].results);
    delete responseQueue[msg.id];
  }
}