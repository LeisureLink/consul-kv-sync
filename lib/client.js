'use strict';

const consul = require('consul');
const _ = require('lodash');
const Promise = require('bluebird');
const readFileSync = require('fs').readFileSync;
const log = require('./logger');

module.exports = (program) => {
  const certificates = _.map(program.ca, readFileSync);
  var config = {
    host: program.host || process.env.CONSUL_HOST || 'consul.service.consul',
    port: program.port || process.env.CONSUL_PORT || 8500,
    secure: program.secure || process.env.CONSUL_SECURE === 'true',
    ca: certificates
  };
  log.debug('Config: ', config);

  let client = consul(config);
  Promise.promisifyAll(client.kv);
  return client;
};
