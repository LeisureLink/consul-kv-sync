#!/usr/bin/env node

/*eslint no-console: 0*/

var fs = require('fs');
var Promise = require('bluebird');
var program = require('commander');
var jptr = require('json-ptr');
var _ = require('lodash');
var consul = require('consul');

var pkg = require('./package.json');

var readFile = Promise.promisify(fs.readFile);
var firstFragmentId;

function readFragments(fileName) {
  return readFile(fileName, 'utf8').then(JSON.parse).then(function validateContents(contents) {
    debug('Read ' + fileName);
    debug(contents);
    var keys = _.keys(contents);
    if (keys.length !== 1) {
      return Promise.reject(new Error('Each configuration file must have a single top-level node identifying the service. "' + fileName + '" has ' + keys.length + ' top-level nodes.'));
    }
    var pointers = jptr.list(contents);
    if (firstFragmentId) {
      if (pointers[0].fragmentId != firstFragmentId) {
        return Promise.reject(new Error('Each file must have the same top-level node. Expected "' + fileName + '" to have "' + firstFragmentId + '", but it has "' + pointers[0].fragmentId + '".'));
      }
    } else {
      firstFragmentId = pointers[0].fragmentId;
    }
    return Promise.resolve(pointers);
  });
}

function collectCA(value, items) {
  items.push(value);
}

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

var _client, _flattened, _reduced, _deleteCount = 0, _putCount = 0, _existing = {};
Promise.all(_.map(program.ca, readFile)).then(function(certificates) {
  var config = {
    host: program.host || process.env.CONSUL_HOST || 'consul.service.consul',
    port: program.port || process.env.CONSUL_PORT || 8500,
    secure: !!program.secure,
    ca: certificates
  };
  debug('Config:');
  debug(config);
  _client = consul(config);
  Promise.promisifyAll(_client.kv);

  return Promise.all(_.map(program.args, readFragments));
}).then(function(files) {
  _flattened = _.flatten(files);
  var prefix = _flattened[1].fragmentId.substring(2);

  debug('Getting keys for ' + prefix);
  return _client.kv.keysAsync(prefix);
}).then(function(results) {
  debug('Keys:');
  debug(results);
  _existing = results;
}).catch(function(err) {
  error(err);
  process.exit(1);
}).then(function() {
  _reduced = _.reduce(_.filter(_flattened, function(x) {
    return _.isString(x.value) || _.isFinite(x.value);
  }), function(acc, item) {
    acc[item.fragmentId.substring(2)] = item.value;
    return acc;
  }, {});
  return Promise.all(_.map(_reduced, function(value, key) {
    _putCount++;
    _existing = _.filter(_existing, function(item) {
      return item !== key;
    });
    debug('Setting "' + key + '" to "' + value + '"');
    return _client.kv.setAsync({
      key: key,
      value: ''+value
    });
  }));
}).then(function() {
  return Promise.all(_.map(_existing, function(key) {
    _deleteCount++;
    return _client.kv.delAsync(key);
  }));
}).then(function() {
  info('Sync completed. ' + _putCount + ' items set, ' + _deleteCount + ' items deleted.');
  info('Config:');
  info(_reduced);
});
