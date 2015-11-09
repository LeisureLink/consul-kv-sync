#!/usr/bin/env node

var fs = require('fs');
var Promise = require('bluebird');
var program = require('commander');
var jptr = require('json-ptr');
var _ = require('lodash');
var request = require('request-promise');
var base64 = require('js-base64').Base64;

var pkg = require('./package.json');

var readFile = Promise.promisify(fs.readFile);

function readFragments(fileName) {
  return readFile(fileName, "utf8").then(function(contents){
    return jptr.list(JSON.parse(contents));
  });
}

request.defaults({json:true});

program.version(pkg.version)
  .description("Synchronizes one or more JSON manifests with consul's key value store")
  .option('-H, --host <host>', "Consul API url, default: http://consul.service.consul:8500");

program.parse(process.argv);

var host = program.host || process.env.CONSUL_HOST || 'http://consul.service.consul:8500/';

Promise.all(_.map(program.args, readFragments)).then(function (files){
  var flattened = _.flatten(files);
  var prefix = flattened[1].fragmentId.substring(2);
  var reduced = _.reduce(_.filter(flattened, function(x){ return _.isString(x.value) || _.isFinite(x.value)}), function(acc, item){
    acc[item.fragmentId.substring(2)] = item.value;
    return acc;
  }, {});

  var existing = {};
  request.get(host + 'v1/kv/' + prefix + '?recurse=1', {json: true})
    .then(function (res) {
      _.each(res, function(item){
        existing[item.Key] = base64.decode(item.Value);
      })
      if (res.statusCode == 200) {
        existing = res.body;
      }
      return;
    }).catch(function(err){
      console.log(err);
      //ignore errors, jus
    }).then(function(){
      return Promise.all(_.map(reduced, function(value, key){
        delete existing[key];
        return request.put(host + 'v1/kv/' + key, {body:''+value});
      }));
    }).then(function(){
      return Promise.all(_.map(existing, function(value, key){
        return request(host + 'v1/kv/' + key, {method:'DELETE'});
      }));
    }).then(function(){
      console.log(reduced);
      console.log('Synced');
    });
});

if (!program.args.length) program.help();

