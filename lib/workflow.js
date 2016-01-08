'use strict';

const jptr = require('json-ptr');
const Promise = require('bluebird');
const readFile = Promise.promisify(require('fs').readFile);
const _ = require('lodash');
const log = require('./logger');

module.exports = (client, files) => {
  let workflow = { stats: { put: 0, deleted: 0 }, config: null };
  const readFragments = (fileName) => {
    return readFile(fileName, 'utf8')
      .then(JSON.parse)
      .then((contents) => {
        log.debug(`Read ${fileName}:`);
        log.debug(contents);
        let keys = _.keys(contents);
        if (keys.length !== 1) {
          throw new Error('Each configuration file must have a single top-level node identifying the service. "' + fileName + '" has ' + keys.length + ' top-level nodes.');
        }
        let pointers = jptr.list(contents);
        let prefix = pointers[1].pointer.substring(1);
        if (workflow.prefix) {
          if (prefix !== workflow.prefix) {
            throw new Error('Each file must have the same top-level node. Expected "' + fileName + '" to have top-level node "' + workflow.prefix + '", but it has "' + prefix + '".');
          }
        } else {
          workflow.prefix = prefix;
        }
        return pointers;
      });
  };

  const readFiles = () => {
    return Promise.map(files, readFragments);
  };

  const flatten = (contents) => {
    let flattened = _.flatten(contents);
    return flattened;
  };

  const reduce = (flattened) => {
    let reduced = _.reduce(_.filter(flattened, (x) => {
      return _.isString(x.value) || _.isFinite(x.value);
    }), function (acc, item) {
      acc[item.pointer.substring(1)] = item.value;
      return acc;
    }, {});
    workflow.config = reduced;
    return reduced;
  };

  const getExistingKeys = () => {
    log.debug('Getting all keys for ' + workflow.prefix);
    return client.kv.keysAsync(`${workflow.prefix}/`)
      .catch((err) => {
        if (err.message === 'not found') {
          return [];
        }
        throw err;
      })
      .then((keys) => {
        log.debug('Keys: ', keys);
        workflow.existing = keys;
      });
  };

  const put = () => {
    return Promise.all(_.map(workflow.config, (value, key) => {
      workflow.stats.put++;
      workflow.existing = _.filter(workflow.existing, (item) => {
        return item !== key;
      });
      log.debug(`Setting "${key}" to "${value}"`);
      return client.kv.setAsync({
        key: key,
        value: '' + value
      });
    }));
  };

  const del = () => {
    return Promise.map(workflow.existing, function(key) {
      workflow.stats.deleted++;
      log.debug(`Deleting "${key}"`);
      return client.kv.delAsync(key);
    }).then(() => {
      delete workflow.existing;
    });
  };

  workflow.exec = () => {
    return readFiles()
      .then(flatten)
      .then(reduce)
      .then(getExistingKeys)
      .then(put)
      .then(del);
  };

  return workflow;
};
