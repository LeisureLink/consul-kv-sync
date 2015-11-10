var exec = require('child_process').exec;
var expect = require('chai').expect;
var request = require('request-promise');
var base64 = require('js-base64').Base64;
var _ = require('lodash');

describe('consul-kv-sync', function() {

  describe('#run', function() {
    var response;
    before(function(done) {
      request.put('http://' + process.env.CONSUL_HOST + ':' + (process.env.CONSUL_PORT || 8500) + '/v1/kv/service/four', {
        body: 'value for removal',
        json: true
      }).then(function() {
        var proc = exec('node ../consul-kv-sync.js ./one.json ./two.json', {
          cwd: __dirname
        });
        proc.on('exit', function() {
          request.get('http://' + process.env.CONSUL_HOST + ':' + (process.env.CONSUL_PORT || 8500) + '/v1/kv/service?recurse=1', {
            json: true
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
      expect(base64.decode(item.Value)).to.eql('value 2');
    });

    it('should set overridden value to correct value', function() {
      var item = response.find(function(item) {
        return item.Key == 'service/one';
      });

      expect(item).to.be.ok;
      expect(base64.decode(item.Value)).to.eql('value from file two');
    });

    it('should set array parameters correctly', function() {
      var items = _.filter(response, function(item) {
        return /^service\/arrayparam/.test(item.Key);
      });

      expect(items.length).to.eql(4);
      expect(items[0].Key).to.eql('service/arrayparam/0');
      expect(base64.decode(items[0].Value)).to.eql('1');
      expect(base64.decode(items[1].Value)).to.eql('2');
      expect(base64.decode(items[2].Value)).to.eql('3');
      expect(base64.decode(items[3].Value)).to.eql('4');
    });

    it('should set remove existing keys that are not in config file', function() {
      var items = _.filter(response, function(item) {
        return item.Key == 'service/four';
      });

      expect(items.length).to.eql(0);
    });

  });
});
