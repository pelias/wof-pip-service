'use strict';

var tape = require('tape');

var configValidation = require('../src/configValidation');

tape('tests for looking up hierarchies', function(test) {
  test.test('config lacking datapath should throw error', function(t) {
    var config = {};

    t.throws(function() {
      configValidation.validate(config);
    }, /"datapath" is required/);
    t.end();

  });

  test.test('non-string datapath should throw error', function(t) {
    [null, 17, {}, [], true].forEach((value) => {
      var config = {
        datapath: value
      };

      t.throws(function() {
        configValidation.validate(config);
      }, /"datapath" must be a string/);

    });

    t.end();

  });

  test.test('string datapath should not throw error', function(t) {
    var config = {
      datapath: 'datapath value'
    };

    t.doesNotThrow(function() {
      configValidation.validate(config);
    });

    t.end();

  });

  test.test('unknown properties should not throw errors', function(t) {
    var config = {
      datapath: 'datapath value',
      unknown_property: 'property value'
    };

    t.doesNotThrow(function() {
      configValidation.validate(config);
    });

    t.end();

  });

});
