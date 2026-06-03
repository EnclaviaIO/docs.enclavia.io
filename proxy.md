# Hosted HTTPS proxy

The public beta exposes every running enclave at a stable HTTPS URL that speaks plain HTTP and WebSocket. Use it when you want to reach an enclave from a tool that doesn't embed the `enclavia` client SDK: `curl`, a browser fetch, a server-side process in any language, a CDN, a webhook receiver. For a trustless connection that performs attestation client-side, see [Connect from a client](/connect).

## URL shape

```
https://<enclave-id>.enclaves.beta.enclavia.io/proxy/<path>
```

The leftmost subdomain is the enclave's UUID (the one shown by `enclavia enclave status`). The `/proxy/` prefix is stripped before the request reaches your workload, so an endpoint your container exposes as `GET /health` is reachable at `/proxy/health`.

## What goes through

Request method, path (after the `/proxy/` strip), headers, and body are forwarded unchanged. Response status, headers, and body come back unchanged. WebSocket upgrades work; idle connections hold for up to one hour.

The proxy adds three headers to every response:

```
X-Enclavia-PCR0: <hex>
X-Enclavia-PCR1: <hex>
X-Enclavia-PCR2: <hex>
```

These are the PCRs the proxy verified during the attestation handshake. They match the values in `enclavia enclave status`.

## Trust model

The hosted path terminates TLS at Enclavia's edge, runs the Noise handshake and attestation check on your behalf, and then forwards plaintext into the encrypted tunnel. Concretely, you trust Enclavia to:

- Verify the COSE_Sign1 envelope on the AWS Nitro attestation document.
- Check the document against the PCRs registered for your enclave when it was launched.
- Refuse to forward traffic if either check fails.

That trust is bounded: Enclavia cannot inject traffic the enclave will accept as authenticated by some other party, because the enclave only ever sees the encrypted channel. But Enclavia can see your plaintext requests and responses on the way through.

If that trust boundary doesn't fit your threat model, two trustless options exist:

- **Direct SDK connection** ([Connect from a client](/connect)). Embed the `enclavia` client, pin the PCRs yourself, and the attestation check runs in your process. Enclavia sees only the encrypted WebSocket bytes.
- **Self-hosted proxy** ([Self-host the proxy](/self-host-proxy)). Run the same `pingora-enclavia` binary in front of an enclave you trust, in your own environment. Same hosted shape, same headers, your PCR allowlist.

## Worked example: HTTP

```bash
ENCLAVE_ID=...      # from `enclavia enclave status`

curl -i https://$ENCLAVE_ID.enclaves.beta.enclavia.io/proxy/health
```

The response carries your workload's body and the three `X-Enclavia-PCR*` headers. A `404` with `X-Enclavia-Tunnel-Error: config_not_found` means the enclave isn't currently registered (likely stopped or destroyed); a `502` with `X-Enclavia-Tunnel-Error: tunnel_dial` means the attestation or handshake failed.

## Worked example: WebSocket

```bash
websocat wss://$ENCLAVE_ID.enclaves.beta.enclavia.io/proxy/ws
```

The proxy negotiates the upgrade with your workload and then byte-pumps the WebSocket frames in both directions for as long as both sides keep the connection open, up to the one-hour idle timeout.

## When to use which path

- Reaching the enclave from a script, `curl`, a webhook, or a browser `fetch`: **hosted path**.
- Building an end-user app where the user's device should be the attestor: **[direct SDK](/connect)**.
- Running the proxy yourself for compliance or trust reasons: **[self-host](/self-host-proxy)**.
