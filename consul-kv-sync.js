#!/usr/bin/env node

'use strict';

/*eslint no-console: 0*/

var fs = require('fs');
var Promise = require('bluebird');
var program = require('commander');
var jptr = require('json-ptr');
var _ = require('lodash');
var consul = require('consul');

var pkg = require('./package.json');

var readFile = Promise.promisify(fs.readFile);
var firstFragmentId, client, flattened, reduced, deleteCount = 0, putCount = 0, existing = {};

function info(message) {
  console.log(message);
}
function error(message) {
  console.log(message);
}
function debug(message) {
  if (program.verbose) {
    console.log(message);
  }
}

function readFragments(fileName) {
  return readFile(fileName, 'utf8').then(JSON.parse).then(function validateContents(contents) {
    var pointers, keys;
    debug('Read ' + fileName);
    debug(contents);
    keys = _.keys(contents);
    if (keys.length !== 1) {
      return Promise.reject(new Error('Each configuration file must have a single top-level node identifying the service. "' + fileName + '" has ' + keys.length + ' top-level nodes.'));
    }
    pointers = jptr.list(contents);
    if (firstFragmentId) {
      if (pointers[1].pointer !== firstFragmentId) {
        return Promise.reject(new Error('Each file must have the same top-level node. Expected "' + fileName + '" to have top-level node "' + firstFragmentId.substring(1) + '", but it has "' + pointers[1].pointer.substring(1) + '".'));
      }
    } else {
      firstFragmentId = pointers[1].pointer;
    }
    return Promise.resolve(pointers);
  });
}

function collectCA(value, items) {
  items.push(value);
}

program.version(pkg.version)
  .usage('[options] <file ...>')
  .description('Synchronizes one or more JSON manifests with consul\'s key value store.')
  .option('-H, --host <host>', 'Consul API url. Environment variable: CONSUL_HOST. Default: consul.service.consul')
  .option('-p, --port <port>', 'Consul API port. Environment variable: CONSUL_PORT. Default: 8500')
  .option('-s, --secure', 'Enable HTTPS. Environment variable: CONSUL_SECURE.')
  .option('--ca <ca>', 'Path to trusted certificate in PEM format. Specify multiple times for multiple certificates.', collectCA, [])
  .option('-v, --verbose', 'If present, verbose output provided.')
  .on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ consul-kv-sync my-service-global.json my-service-dev.json');
    console.log('    $ CONSUL_HOST=consul.local consul-kv-sync my-service-global.json my-service-dev.json');
    console.log('    $ consul-kv-sync --host localhost --port 8500 --secure \\');
    console.log('        --ca root-ca.pem --ca intermediate-ca.pem \\');
    console.log('        my-service-global.json my-service-dev.json');
    console.log('');
  });

program.parse(process.argv);
if (!program.args.length) {
  program.outputHelp();
  process.exit(1);
}

Promise.all(_.map(program.ca, readFile)).then(function(certificates) {
  var config = {
    host: program.host || process.env.CONSUL_HOST || 'consul.service.consul',
    port: program.port || process.env.CONSUL_PORT || 8500,
    secure: program.secure || process.env.CONSUL_SECURE === 'true',
    ca: certificates
  };
  debug('Config:');
  debug(config);
  client = consul(config);
  Promise.promisifyAll(client.kv);

  return Promise.all(_.map(program.args, readFragments));
}).then(function(files) {
  var prefix;
  flattened = _.flatten(files);
  prefix = flattened[1].pointer.substring(1) + '/';

  debug('Getting keys for ' + prefix);
  return client.kv.keysAsync(prefix);
}).then(function(results) {
  debug('Keys:');
  debug(results);
  existing = results;
}).catch(function(err) {
  if (err.message === 'not found') {
    debug('No existing keys found');
  } else {
    error(err);
    process.exit(99);
  }
}).then(function() {
  reduced = _.reduce(_.filter(flattened, function(x) {
    return _.isString(x.value) || _.isFinite(x.value);
  }), function(acc, item) {
    acc[item.pointer.substring(1)] = item.value;
    return acc;
  }, {});
  return Promise.all(_.map(reduced, function(value, key) {
    putCount++;
    existing = _.filter(existing, function(item) {
      return item !== key;
    });
    debug('Setting "' + key + '" to "' + value + '"');
    return client.kv.setAsync({
      key: key,
      value: ''+value
    });
  }));
}).then(function() {
  return Promise.all(_.map(existing, function(key) {
    deleteCount++;
    return client.kv.delAsync(key);
  }));
}).then(function() {
  info('Sync completed. ' + putCount + ' items set, ' + deleteCount + ' items deleted.');
  info('Config:');
  info(reduced);
});
