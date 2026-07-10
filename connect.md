# Connect from a client

There are two ways to talk to a running enclave, and the right one depends on who you trust to verify the attestation.

**Embed the SDK in your client** (this page). Your code opens a WebSocket directly to `wss://<id>.enclaves.beta.enclavia.io`, performs the Noise handshake itself, fetches the attestation document, validates the AWS Nitro signing chain, and pins the PCRs. **You are the verifier.** No third party can hand you tampered bytes without your client detecting it. Use this path when the client is yours to ship: a Rust binary, a wallet that compiles in the SDK, eventually a WASM build in the browser.

**Go through the HTTPS proxy at `https://<id>.enclaves.beta.enclavia.io/proxy/...`**. The proxy (we operate one on `*.enclaves.beta.enclavia.io`, or you can [self-host one](/self-host-proxy)) does the attestation verification on every request and tunnels plain HTTP/WebSocket to the enclave's workload. **The proxy operator is the verifier.** Use this path when you can't embed the SDK: an unmodified browser hitting a public URL, a curl pipeline, a client written in a language without a native enclavia SDK. PCR values are surfaced on every response as `X-Enclavia-PCR0..2` headers so a curious client can still check them out-of-band, but transport security between client and enclave reduces to "trust the proxy". See [Hosted HTTPS proxy](/proxy) for the user-side reference and [Self-host the proxy](/self-host-proxy) if you want to be the proxy operator yourself.

The rest of this page covers the embed-the-SDK path.

## SDK overview

Each running enclave is reachable at `wss://<id>.enclaves.beta.enclavia.io`, the WebSocket-based proxy that bridges your client to the enclave's vsock channel. The client speaks Noise+CBOR directly to the in-enclave responder; the proxy is protocol-agnostic and never sees plaintext.

The reference client is the Rust [`enclavia`](https://crates.io/crates/enclavia) crate, published on crates.io. It runs natively (Tokio) and also compiles to WebAssembly; the browser/Node packaging is on npm as [`@enclavia/client-wasm`](https://www.npmjs.com/package/@enclavia/client-wasm) (see [Browser and Node](#browser-and-node) below).

## Add the dependency

```toml
# Cargo.toml
[dependencies]
enclavia = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

The crate's public surface is small: `Client`, `ClientBuilder`, `Pcrs`, and a request builder. Optional `json` feature brings in `RequestBuilder::json`.

## Connect and verify

```rust
use enclavia::{Client, Pcrs};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Hex strings copied verbatim from `enclavia enclave status`.
    let pcrs = Pcrs::from_hex(
        "...your pcr0...",
        "...your pcr1...",
        "...your pcr2...",
    )?;

    let client = Client::connect(
        "wss://<enclave-id>.enclaves.beta.enclavia.io",
        pcrs,
    ).await?;

    let resp = client.get("/health").send().await?;
    println!("{} — {}", resp.status(), resp.text()?);
    Ok(())
}
```

`Client::connect` does three things in one call:

1. Opens the WebSocket.
2. Performs a Noise NN (`Noise_NN_25519_ChaChaPoly_BLAKE2s`) handshake.
3. Requests an attestation document from the enclave and verifies the COSE_Sign1 envelope, the AWS Nitro signing certificate chain, the handshake-hash binding (so this attestation can't be replayed against a different connection), and the PCR0/1/2 values you pinned.

If any check fails, the call returns an error and no traffic flows.

## Get the PCRs you need to pin

```bash
enclavia enclave status <enclave-id>
```

The `PCRs:` block in the output is the source of truth. Pin those exact values; the client will refuse to connect to anything that doesn't measure to the same identity.

PCRs are **per-enclave, not per-image** — the enclave's UUID is stamped into the rootfs at build time, so two enclaves created from the same Docker image have different PCR2 values. Pinning the PCRs from `enclave status` therefore binds your client to that specific enclave, not just to its image. If you destroy and re-create an enclave from the same image, you'll get a new set of PCRs to pin.

## Sending requests

The request builder mirrors `reqwest`:

```rust
let resp = client
    .post("/api/run")
    .header("Content-Type", "application/json")
    .body(r#"{"input": "..."}"#)
    .send()
    .await?;

println!("status: {}", resp.status());
println!("body:   {}", resp.text()?);
```

With the `json` feature, `RequestBuilder::json(&value)` serializes a `serde::Serialize` and sets `Content-Type: application/json` for you.

The host header is filled in from the URL automatically. Each request is encrypted under the same Noise transport and forwarded plaintext to the inner container on the `--container-port` you specified at [create time](/create#flags).

## The connection does not auto-reconnect

A `Client` holds a **single** long-lived attested WebSocket channel. It is opened once, at connect/build time, and the SDK does **not** re-dial it if it drops. There is no built-in reconnect loop, retry, or backoff in either the native or the WASM SDK. This is deliberate: re-establishing the channel means redoing the Noise handshake and re-verifying the attestation, and the SDK cannot know your retry policy or whether the enclave you were pinned to still has the same PCRs.

When the channel drops (most commonly because the enclave [restarted or was upgraded](/create#lifecycle-commands), which tears the old connection down), the failure surfaces as an error on the request you attempted (in the native SDK, `Error::ConnectionClosed`; in WASM, a rejected promise). The `Client` is dead at that point: it will not recover, and subsequent requests on it also fail. **Reconnecting is the application's responsibility.** The pattern is:

- **Connect lazily** and hold the `Client`, but be ready to throw it away.
- On a dropped-channel error, **build a fresh `Client`** (which re-runs the handshake and attestation) and retry the request once. Beyond a single retry, apply your own backoff so a genuinely-down enclave does not spin.

A minimal retry-on-drop wrapper, native Rust:

```rust
async fn fetch_with_reconnect(
    url: &str,
    pcrs: &Pcrs,
    path: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    for attempt in 0..2 {
        // Reconnect (or first connect) on each attempt.
        let client = Client::connect(url, pcrs.clone()).await?;
        match client.get(path).send().await {
            Ok(resp) => return Ok(resp.text()?),
            // Channel died mid-flight: drop this client and reconnect once.
            Err(e) if attempt == 0 => {
                eprintln!("channel dropped ({e}), reconnecting");
                continue;
            }
            Err(e) => return Err(e.into()),
        }
    }
    unreachable!()
}
```

The same shape in the WASM SDK (rebuild the client with `connect`, retry the `fetch` once):

```js
async function fetchWithReconnect(url, pcrs, method, path, options) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = await connect(url, pcrs, { debugMode: true });
    try {
      return await client.fetch(method, path, options);
    } catch (e) {
      if (attempt === 0) continue;   // channel dropped: reconnect once
      throw e;
    }
  }
}
```

In a real app you would cache the `Client` between calls and only reconnect on failure, rather than reconnecting on every request as these minimal examples do. The load-bearing point is that a request can fail because the channel died, and the recovery is a fresh `connect`, not a retry on the same dead `Client`.

::: tip Expected right after a deploy or restart
A dropped or failed client connection immediately after you restart, stop-then-start, or upgrade an enclave is **expected**, not a bug: the old attested channel went away with the old enclave. Reconnect (which re-verifies the new enclave's attestation) and carry on. If the enclave was [upgraded](/upgrades) to a new image, its PCRs also changed, so either re-pin the new values from `enclavia enclave status` or connect with `trustUpgrades` / `ClientBuilder::trust_upgrades` so the client follows the signed upgrade chain automatically.
:::

## Debug-mode enclaves

If you're targeting a debug-mode enclave, the attestation document is a stub that echoes the handshake nonce instead of being COSE-signed. Use the builder explicitly:

```rust
let client = Client::builder("wss://...local-debug-url...")
    .pcrs(Pcrs { pcr0: vec![], pcr1: vec![], pcr2: vec![] })
    .debug_mode(true)
    .build()
    .await?;
```

`debug_mode(true)` only verifies the nonce binding — never use it against production enclaves.

## Browser and Node

The same Rust core compiles to WebAssembly and is published on npm as [`@enclavia/client-wasm`](https://www.npmjs.com/package/@enclavia/client-wasm). It runs in browsers and in any JS runtime with a global `WebSocket` (Node 22+, Deno), and performs the same attestation verification as the native SDK, so the encrypted channel terminates in the user's browser and no proxy has to be trusted.

```bash
npm install @enclavia/client-wasm
```

```js
import init, { connect } from "@enclavia/client-wasm";
await init();   // loads the wasm module (bundlers resolve the .wasm asset)

const client = await connect(
  "wss://<id>.enclaves.beta.enclavia.io",
  { pcr0: "...", pcr1: "...", pcr2: "..." },  // hex, from `enclavia enclave status`
  { debugMode: true },                        // beta/QEMU only; omit on production Nitro
);

const resp = await client.fetch("GET", "/health");
console.log(resp.status, new TextDecoder().decode(resp.body));
```

### The `fetch` signature

`client.fetch` takes three arguments; the third carries request headers and a body, so it is not limited to bodyless GETs:

```js
client.fetch(method, path, options?) => Promise<{ status, headers, body }>
```

- `method`: an HTTP method string (`"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"PATCH"`, `"HEAD"`, `"OPTIONS"`; case-insensitive).
- `path`: the request path, e.g. `"/api/run"`.
- `options` (optional):
  - `headers`: an array of `[name, value]` string pairs.
  - `body`: a `Uint8Array` (encode strings/JSON yourself).

The resolved response is `{ status: number, headers: [name, value][], body: Uint8Array }`. `body` is always raw bytes; decode it with `TextDecoder` (or `JSON.parse(new TextDecoder().decode(resp.body))` for JSON).

A POST with a JSON body and a custom header:

```js
const payload = new TextEncoder().encode(JSON.stringify({ input: "..." }));

const resp = await client.fetch("POST", "/api/run", {
  headers: [
    ["Content-Type", "application/json"],
    ["Authorization", "Bearer ..."],
  ],
  body: payload,
});

if (resp.status !== 200) {
  throw new Error(`enclave returned ${resp.status}`);
}
const result = JSON.parse(new TextDecoder().decode(resp.body));
```

There is no JSON convenience helper on the WASM side (the `json` feature is native-Rust only), so serialize the body and set `Content-Type` yourself as above.

In Node (no bundler), pass the wasm bytes to `init` yourself:

```js
import { readFileSync } from "node:fs";
import init, { connect } from "@enclavia/client-wasm";

await init({
  module_or_path: readFileSync(
    new URL(import.meta.resolve("@enclavia/client-wasm/wasm")),
  ),
});
```

Non-HTTP protocols can use `client.openStream(firstBytes)` for a raw byte pipe over the same attested channel. `connect` also accepts `trustUpgrades: { backendUrl, enclaveId }`, mirroring the native `ClientBuilder::trust_upgrades`. See the [`enclavia-wasm` README](https://github.com/EnclaviaIO/enclavia/tree/master/enclavia-wasm) for the full surface and its two WebSocket-inherent differences from the native SDK.
