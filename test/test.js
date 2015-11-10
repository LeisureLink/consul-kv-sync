var exec = require('child_process').exec;
var expect = require('chai').expect;
var _ = require('lodash');
var Promise = require('bluebird');
var consul = require('consul');

function execute(commandLine) {
  return new Promise(function(resolve) {
    var proc = exec(commandLine, {
      cwd: __dirname
    });
    proc.on('exit', function(exitCode) {
      resolve(exitCode);
    });
  });
}

describe('consul-kv-sync', function() {
  var config = {
    host: process.env.CONSUL_HOST || 'consul.service.consul',
    port: process.env.CONSUL_PORT || '8500',
    secure: process.env.CONSUL_SECURE === 'true'
  };

  var _client = consul(config);
  var _exitCode;
  Promise.promisifyAll(_client.kv);

  describe('#validation', function() {
    it('should return an error when an empty config file is added', function() {
      return execute('node ../consul-kv-sync.js ./one.json ./two.json ./empty.json')
        .then(function(exitCode) {
          expect(exitCode).to.eql(99);
        });
    });
    it('should return an error when a config file with multiple top-level nodes is added', function() {
      return execute('node ../consul-kv-sync.js ./one.json ./two.json ./full.json')
        .then(function(exitCode) {
          expect(exitCode).to.eql(99);
        });
    });
    it('should return an error when an different service\'s config file is added', function() {
      return execute('node ../consul-kv-sync.js ./one.json ./two.json ./other.json')
        .then(function(exitCode) {
          expect(exitCode).to.eql(99);
        });
    });
  });

  describe('#run', function() {
    var _response;
    before(function() {
      return _client.kv.setAsync({
        key: 'service/four',
        value: 'value for removal'
      }).then(function() {
        return _client.kv.setAsync({
          key: 'service2/item',
          value: 'this value should stay'
        });
      })
      .then(function() {
        return execute('node ../consul-kv-sync.js ./one.json ./two.json');
      }).then(function(exitCode) {
        _exitCode = exitCode;
        return _client.kv.getAsync({
          key: 'service',
          recurse: true
        });
      }).then(function(result) {
        _response = result;
      });
    });

    it('should set exit code to 0', function() {
      expect(_exitCode).to.eql(0);
    });

    it('should set value to correct value', function() {
      var item = _response.find(function(item) {
        return item.Key == 'service/two';
      });

      expect(item).to.be.ok;
      expect(item.Value).to.eql('value 2');
    });

    it('should set overridden value to correct value', function() {
      var item = _response.find(function(item) {
        return item.Key == 'service/one';
      });

      expect(item).to.be.ok;
      expect(item.Value).to.eql('value from file two');
    });

    it('should set array parameters correctly', function() {
      var items = _.filter(_response, function(item) {
        return /^service\/arrayparam/.test(item.Key);
      });

      expect(items.length).to.eql(4);
      expect(items[0].Key).to.eql('service/arrayparam/0');
      expect(items[0].Value).to.eql('1');
      expect(items[1].Value).to.eql('2');
      expect(items[2].Value).to.eql('3');
      expect(items[3].Value).to.eql('4');
    });

    it('should remove existing keys that are not in config file', function() {
      var items = _.filter(_response, function(item) {
        return item.Key == 'service/four';
      });

      expect(items.length).to.eql(0);
    });

    it('should not impact keys for a different service', function() {
      return _client.kv.getAsync({
        key: 'service2/item'
      }).then(function(item) {
        expect(item.Value).to.eql('this value should stay');
      });
    });

  });
});
