# Self-host the proxy

[`pingora-enclavia`](https://github.com/EnclaviaIO/pingora-enclavia) is the Pingora-based attested proxy behind the [hosted `/proxy/*` path](/proxy). It's a small Rust service that takes inbound HTTP/WebSocket, dials the WebSocket endpoint of a configured enclave, runs a Noise handshake and AWS Nitro attestation check, then byte-pumps the request through the encrypted tunnel.

Self-host it when you want the attestation check to happen in infrastructure you control rather than at Enclavia's edge: air-gapped deployments, compliance regimes that forbid third-party termination, or running in front of an enclave whose PCRs only you trust.

## Role of the proxy

```
client (HTTP / WS)
  ↓ TLS (your front-end: nginx, Caddy, ...)
your front-end
  ↓ plain HTTP
pingora-enclavia
  ↓ WSS → Noise NN → Nitro attestation
remote enclave
  ↓
your workload
```

`pingora-enclavia` doesn't terminate TLS. It expects a front-end to do that and forward plaintext on a loopback port. The trust boundary the proxy enforces is the attestation check: a configured set of PCRs (from `enclavia enclave status`) per enclave UUID, refreshed from disk via inotify so a controller can add or remove targets without restarting.

## Install: NixOS module (preferred)

```nix
{
  inputs.pingora-enclavia.url = "github:EnclaviaIO/pingora-enclavia";

  outputs = { self, nixpkgs, pingora-enclavia, ... }: {
    nixosConfigurations.myhost = nixpkgs.lib.nixosSystem {
      modules = [
        pingora-enclavia.nixosModules.default
        ({ ... }: {
          services.pingora-enclavia = {
            enable = true;
            configDir = "/var/lib/pingora-enclavia/targets";
            listen = "127.0.0.1:6188";
          };
        })
      ];
    };
  };
}
```

The module creates a system user/group (`pingora-enclavia`), runs the binary as a hardened systemd unit, and creates `configDir` mode `2770`. Any other service that needs to write target JSON files should join the `services.pingora-enclavia.targetsGroup` group.

You still need to put a front-end in front of the listener. The nginx snippet, including the `map` for the WebSocket upgrade header (without which WebSocket frames don't flow):

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  listen 443 ssl http2;
  server_name ~^(?<sub>.+)\.enclaves\.example\.com$;

  location /proxy/ {
    rewrite ^/proxy/(.*) /$1 break;
    proxy_pass http://127.0.0.1:6188;
    proxy_set_header Host $host;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

The `map` block belongs in the `http` context, not inside `server`. Skipping it is the most common WebSocket-doesn't-work bug.

## Install: Docker

```bash
docker run \
  -v $(pwd)/targets:/etc/pingora-enclavia/targets \
  -p 6188:6188 \
  enclaviaio/pingora-enclavia:0.1.0
```

The image reads target files from `/etc/pingora-enclavia/targets` and listens on `0.0.0.0:6188`.

## Install: from source

```bash
git clone https://github.com/EnclaviaIO/pingora-enclavia
cd pingora-enclavia
cargo build --release --bin pingora-enclavia
./target/release/pingora-enclavia \
  --config-dir ./targets \
  --listen 127.0.0.1:6188
```

## Target config file

One file per enclave you want to proxy, keyed by UUID:

```json
{
  "enclave_id": "<uuid>",
  "endpoint": "wss://<uuid>.enclaves.beta.enclavia.io",
  "pcrs": {
    "pcr0": "<hex>",
    "pcr1": "<hex>",
    "pcr2": "<hex>"
  },
  "debug_mode": false
}
```

Filename is `<uuid>.json`. The proxy watches the directory with inotify and reloads on create/modify/delete without restart. `debug_mode: true` accepts the stub attestation produced by debug-mode enclaves; never set it for production.

The proxy dispatches on the leftmost label of the inbound `Host` header. Send `Host: <uuid>.enclaves.example.com` (your domain, not Enclavia's) and the matching target file is picked up.

## Operational notes

- **Logs**: JSON-formatted via `tracing`, one info line per request, error lines carry a `failure_kind` field (`config_not_found`, `bad_config`, `tunnel_dial`). Point your log shipper at journald.
- **Health endpoint**: `GET /healthz` returns `200 ok` when the config dir is readable, `200 degraded` otherwise. Use it for upstream checks.
- **Graceful shutdown**: SIGTERM triggers Pingora's drain (default 5 s). In-flight requests finish; new connections are refused.
- **Timeouts**: `tunnelTimeoutSecs` (default 10 s) bounds the WSS+Noise+attestation handshake; `requestTimeoutSecs` (default 30 s) is the per-request upstream read/write window.
- **Failure surface**: `X-Enclavia-Tunnel-Error: <kind>` is set on every error response. The PCR mismatch, Noise handshake failure, and attestation parse cases currently collapse into `tunnel_dial`; the failing leg lands in the error log line.
- **Pooling**: every inbound request opens a fresh attested tunnel. Tunnel pooling isn't in the beta cut.

## See also

- [Hosted `/proxy/*` path](/proxy): the same proxy, run for you.
- [Connect from a client](/connect): the trustless alternative when the attestation check should run on the end user's device.
- The [`pingora-enclavia`](https://github.com/EnclaviaIO/pingora-enclavia) source: licensed Apache-2.0 OR MIT.
