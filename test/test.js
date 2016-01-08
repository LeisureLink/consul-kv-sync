'use strict';

var exec = require('child_process').exec;
var expect = require('chai').expect;
var _ = require('lodash');
var Promise = require('bluebird');
var consul = require('consul');

function execute(commandLine) {
  return new Promise(function(resolve, reject) {
    exec(commandLine, {
      cwd: __dirname
    }, function(err, stdout, stderr) {
      if (err) {
        reject(err);
      } else {
        resolve({ stdout: stdout, stderr: stderr });
      }
    });
  });
}

describe('consul-kv-sync', function() {
  var config = {
    host: process.env.CONSUL_HOST || 'consul.service.consul',
    port: process.env.CONSUL_PORT || '8500',
    secure: process.env.CONSUL_SECURE === 'true'
  };

  var client = consul(config);
  Promise.promisifyAll(client.kv);

  after(function(){
    return client.kv.delAsync({ key:'service', recurse:true })
      .then(function(){
        return client.kv.delAsync({ key:'service2', recurse:true });
      })
      .then(function(){
        return client.kv.delAsync({ key:'other_service', recurse:true });
      });
  });

  describe('#validation', function() {
    it('should return an error when an empty config file is added', function() {
      return execute('node ../consul-kv-sync.js ./one.json ./two.json ./empty.json')
        .then(function(){
          throw new Error('Expected failure, got success');
        })
        .catch(function(err) {
          expect(err.code).to.eql(99);
        });
    });
    it('should return an error when a config file with multiple top-level nodes is added', function() {
      return execute('node ../consul-kv-sync.js ./one.json ./two.json ./full.json')
        .then(function(){
          throw new Error('Expected failure, got success');
        })
        .catch(function(err) {
          expect(err.code).to.eql(99);
        });
    });
    it('should return an error when an different service\'s config file is added', function() {
      return execute('node ../consul-kv-sync.js ./one.json ./two.json ./other.json')
        .then(function(){
          throw new Error('Expected failure, got success');
        })
        .catch(function(err) {
          expect(err.code).to.eql(99);
        });
    });
  });

  describe('#run', function() {
    var response;
    describe('first run scenario', function(){
      before(function(){
        return client.kv.delAsync({ key:'service', recurse:true })
          .then(function(){
            return execute('node ../consul-kv-sync.js ./one.json ./two.json');
          }).then(function(){
            return client.kv.getAsync({
              key: 'service',
              recurse: true
            });
          }).then(function(res){
            response = res;
          });
      });

      it('should set value to correct value', function() {
        var item = response.find(function(item) {
          return item.Key === 'service/two';
        });

        expect(item).to.be.ok;
        expect(item.Value).to.eql('value 2');
      });

      it('should set overridden value to correct value', function() {
        var item = response.find(function(item) {
          return item.Key === 'service/one';
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
    });

    describe('second run scenario', function(){
      before(function() {
        return client.kv.setAsync({
          key: 'service/four',
          value: 'value for removal'
        }).then(function() {
          return client.kv.setAsync({
            key: 'service2/item',
            value: 'this value should stay'
          });
        }).then(function() {
          return client.kv.setAsync({
            key: 'service/one',
            value: 'this value should be changed'
          });
        }).then(function() {
          return execute('node ../consul-kv-sync.js ./one.json ./two.json');
        }).then(function() {
          return client.kv.getAsync({
            key: 'service',
            recurse: true
          });
        }).then(function(result) {
          response = result;
        });
      });

      it('should set value to correct value', function() {
        var item = response.find(function(item) {
          return item.Key === 'service/two';
        });

        expect(item).to.be.ok;
        expect(item.Value).to.eql('value 2');
      });

      it('should set overridden value to correct value', function() {
        var item = response.find(function(item) {
          return item.Key === 'service/one';
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

      it('should remove existing keys that are not in config file', function() {
        var items = _.filter(response, function(item) {
          return item.Key === 'service/four';
        });

        expect(items.length).to.eql(0);
      });

      it('should not impact keys for a different service', function() {
        return client.kv.getAsync({
          key: 'service2/item'
        }).then(function(item) {
          expect(item.Value).to.eql('this value should stay');
        });
      });
    });
  });
});
