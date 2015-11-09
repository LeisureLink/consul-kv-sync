# consul-kv-sync

Synchronizes a json document with key-value pairs in Consul.

Usage:

```bash
$ echo '{"my-api":{"global-key":"value"}' > my-api-global.json
$ echo '{"my-api":{"environment-key":"env value"}' > my-api-environment.json
$ consul-kv-sync --host http://localhost:8500 \
    my-api-global.json my-api-environment.json
```
