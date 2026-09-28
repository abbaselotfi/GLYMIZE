# R30-04-B1 third-party dependency record

This spike pins its direct dependencies in `Cargo.toml` and the complete resolved graph in `Cargo.lock`.

- `rusqlite 0.40.1` and resolved `libsqlite3-sys 0.38.2`: MIT license.
- Bundled SQLCipher source supplied by `libsqlite3-sys`: BSD-style SQLCipher license.
- Vendored OpenSSL source `300.6.1+3.6.3`, selected by `bundled-sqlcipher-vendored-openssl`: Apache License 2.0.
- `serde_json 1.0.151` and its resolved dependencies: see the exact package/license inventory captured with the acceptance evidence.

Authoritative bundled license files remain in each Cargo package and must be included by any future redistributable candidate. This experimental crate is not itself a redistributable GLYMIZE runtime.
