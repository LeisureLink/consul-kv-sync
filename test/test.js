var exec = require('child_process').exec;
var expect = require('chai').expect;
var _ = require('lodash');
var Promise = require('bluebird');
var consul = require('consul');

describe('consul-kv-sync', function() {
  var config = {
    host: process.env.CONSUL_HOST || 'consul.service.consul',
    port: process.env.CONSUL_PORT || '8500',
    secure: process.env.CONSUL_SECURE === 'true'
  };

  var _client = consul(config);
  Promise.promisifyAll(_client.kv);

  describe('#run', function() {
    var response;
    before(function(done) {
      return _client.kv.setAsync({
        key:'service/four',
        value: 'value for removal'
      }).then(function() {
        var proc = exec('node ../consul-kv-sync.js ./one.json ./two.json', {
          cwd: __dirname
        });
        proc.on('exit', function() {
          _client.kv.getAsync({
            key:'service/',
            recurse: true
          }).then(function(result) {
            response = result;
            done();
          }).catch(done);
        });
      });
    });

    it('should set value to correct value', function() {
      var item = response.find(function(item) {
        return item.Key == 'service/two';
      });

      expect(item).to.be.ok;
      expect(item.Value).to.eql('value 2');
    });

    it('should set overridden value to correct value', function() {
      var item = response.find(function(item) {
        return item.Key == 'service/one';
      });

      expect(item).to.be.ok;
      expect(item.Value).to.eql('value from file two');
    });

    it('should set array parameters correctly', function() {
      var items = _.filter(response, function(item) {
        return /^service\/arrayparam/.test(item.Key);
      });

      expect(items.length).to.eql(4);
      expect(items[0].Key).to.eql('service/arrayparam/0');
      expect(items[0].Value).to.eql('1');
      expect(items[1].Value).to.eql('2');
      expect(items[2].Value).to.eql('3');
      expect(items[3].Value).to.eql('4');
    });

    it('should set remove existing keys that are not in config file', function() {
      var items = _.filter(response, function(item) {
        return item.key == 'service/four';
      });

      expect(items.length).to.eql(0);
    });

  });
});
