'use strict';

const Joi = require('joi');

// who's on first importer requires just `datapath`
const schema = Joi.object().keys({
  datapath: Joi.string()
}).requiredKeys('datapath').unknown(true);

module.exports = {
  validate: function validate(config) {
    Joi.validate(config, schema, (err, value) => {
      if (err) {
        throw new Error(err.details[0].message);
      }
    });
  }

};
