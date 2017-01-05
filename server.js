'use strict';

const peliasConfig = require('pelias-config').generate();

// validate the WOF configuration before continuing
require('./src/configValidation').validate(peliasConfig);

var createPIPService = require('./src/index.js').create;
var express = require('express');
var app = express();
var logger = require( 'pelias-logger' ).get( 'wof-pip-service:master' );

var port = ( process.env.PORT || 3333 );

createPIPService(peliasConfig.imports.whosonfirst.datapath, function (err, pipService) {
  app.get('/', function (req, res) {
    pipService.lookup(req.query.latitude, req.query.longitude, function (err, results) {
      res.json(results);
    });

  });

  app.listen(port, function () {
    logger.info('PIP service listening on port ', port);
  });

});
