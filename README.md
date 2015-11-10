# consul-kv-sync

Synchronizes a json document with key-value pairs in Consul. Will add, update, and *delete* keys as necessary.

Usage:

```bash
$ echo '{"my-api":{"global-key":"value"}' > my-api-global.json
$ echo '{"my-api":{"environment-key":"env value"}' > my-api-environment.json
$ consul-kv-sync --host localhost --port 8500 \
    my-api-global.json my-api-environment.json
```

Full help
```
  Usage: consul-kv-sync [options] <file ...>

  Synchronizes one or more JSON manifests with consul's key value store.

  Options:

    -h, --help         output usage information
    -V, --version      output the version number
    -H, --host <host>  Consul API url. Environment variable: CONSUL_HOST. Default: consul.service.consul
    -p, --port <port>  Consul API port. Environment variable: CONSUL_PORT. Default: 8500
    -s, --secure       Enable HTTPS. Environment variable: CONSUL_SECURE.
    --ca <ca>          Path to trusted certificate in PEM format. Specify multiple times for multiple certificates.
    -v, --verbose      If present, verbose output provided.

  Examples:

    $ consul-kv-sync my-service-global.json my-service-dev.json
    $ CONSUL_HOST=consul.local consul-kv-sync my-service-global.json my-service-dev.json
    $ consul-kv-sync --host localhost --port 8500 --secure \
        --ca root-ca.pem --ca intermediate-ca.pem \
        my-service-global.json my-service-dev.json
```
