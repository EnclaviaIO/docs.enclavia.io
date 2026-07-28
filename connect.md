---
description: "Rust, TypeScript (WASM), and Dart client SDKs: attestation verification, PCR pinning, and reconnect handling"
---

# Connect from a client

There are two ways to talk to a running enclave, and the right one depends on who you trust to verify the attestation.

**Embed the SDK in your client** (this page). Your code opens a WebSocket directly to `wss://<id>.enclaves.beta.enclavia.io`, performs the Noise handshake itself, fetches the attestation document, validates the AWS Nitro signing chain, and pins the PCRs. **You are the verifier.** No third party can hand you tampered bytes without your client detecting it. Use this path when the client is yours to ship: a Rust binary, a WASM build in the browser or Node, a Dart or Flutter app.

**Go through the HTTPS proxy at `https://<id>.enclaves.beta.enclavia.io/proxy/...`**. The proxy (we operate one on `*.enclaves.beta.enclavia.io`, or you can [self-host one](/self-host-proxy)) does the attestation verification on every request and tunnels plain HTTP/WebSocket to the enclave's workload. **The proxy operator is the verifier.** Use this path when you can't embed the SDK: an unmodified browser hitting a public URL, a curl pipeline, a client written in a language without a native enclavia SDK. PCR values are surfaced on every response as `X-Enclavia-PCR0..2` headers so a curious client can still check them out-of-band, but transport security between client and enclave reduces to "trust the proxy". See [Hosted HTTPS proxy](/proxy) for the user-side reference and [Self-host the proxy](/self-host-proxy) if you want to be the proxy operator yourself.

The rest of this page covers the embed-the-SDK path.

## SDK overview

Each running enclave is reachable at `wss://<id>.enclaves.beta.enclavia.io`, the WebSocket-based proxy that bridges your client to the enclave's vsock channel. The client speaks Noise+CBOR directly to the in-enclave responder; the proxy is protocol-agnostic and never sees plaintext.

The security core is one Rust implementation, shipped in three packagings:

- **Rust**: the reference [`enclavia`](https://crates.io/crates/enclavia) crate on crates.io, running natively on Tokio.
- **TypeScript / JavaScript**: the same core compiled to WebAssembly, on npm as [`@enclavia/client-wasm`](https://www.npmjs.com/package/@enclavia/client-wasm). Runs in browsers and any JS runtime with a global `WebSocket` (Node 22+, Deno). See [Browser and Node specifics](#browser-and-node-specifics).
- **Dart**: UniFFI bindings over the same core, on pub.dev as [`enclavia_dart`](https://pub.dev/packages/enclavia_dart), for Dart and Flutter apps on Android, iOS, Linux, macOS, and Windows. See [Dart and Flutter specifics](#dart-and-flutter-specifics).

All three run the same Noise handshake and the same attestation verifier, so the encrypted channel terminates inside your app in every case.

## Add the dependency

::: tabs key:lang

== Rust

```toml
# Cargo.toml
[dependencies]
enclavia = "0.2"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

The crate's public surface is small: `Client`, `ClientBuilder`, `Pcrs`, and a request builder. Optional `json` feature brings in `RequestBuilder::json`.

== TypeScript

```bash
npm install @enclavia/client-wasm
```

The package bundles the compiled WASM module plus JS glue and TypeScript definitions; bundlers resolve the `.wasm` asset automatically (for plain Node see [Browser and Node specifics](#browser-and-node-specifics)).

== Dart

```yaml
# pubspec.yaml
dependencies:
  enclavia_dart: ^0.2.0
```

The native library is compiled on your machine by Dart's Native Assets system on `dart pub get` / `dart run` / `flutter run`, so you need a Rust toolchain installed (via [rustup](https://rustup.rs/)). The first build takes a few minutes; subsequent builds are cached.

:::

## Connect and verify

::: tabs key:lang

== Rust

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

== TypeScript

```js
import init, { connect } from "@enclavia/client-wasm";
await init();   // loads the wasm module

const client = await connect(
  "wss://<enclave-id>.enclaves.beta.enclavia.io",
  { pcr0: "...", pcr1: "...", pcr2: "..." },  // hex, from `enclavia enclave status`
);

const resp = await client.fetch("GET", "/health");
console.log(resp.status, new TextDecoder().decode(resp.body));
```

== Dart

```dart
import 'dart:convert';
import 'package:enclavia_dart/enclavia_dart.dart';

Future<void> main() async {
  // `Pcrs` takes raw bytes: hex-decode the values from
  // `enclavia enclave status` yourself (see example/main.dart in the
  // package for a copy-pasteable helper).
  final client = await Client.connect(
    url: 'wss://<enclave-id>.enclaves.beta.enclavia.io',
    pcrs: Pcrs(pcr0: pcr0Bytes, pcr1: pcr1Bytes, pcr2: pcr2Bytes),
    options: null,
  );

  final resp = await client.fetch(method: 'GET', path: '/health', options: null);
  print('${resp.status}: ${utf8.decode(resp.body)}');
}
```

:::

Connecting does three things in one call, in every SDK:

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

Every request is encrypted under the same Noise transport and forwarded plaintext to the inner container on the `--container-port` you specified at [create time](/create#flags). The host header is filled in from the URL automatically.

::: tabs key:lang

== Rust

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

== TypeScript

`client.fetch(method, path, options?)` resolves to `{ status, headers, body }`; `body` is always a `Uint8Array` of raw bytes. There is no JSON convenience helper (the `json` feature is native-Rust only), so serialize the body and set `Content-Type` yourself:

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

- `method`: an HTTP method string (`"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"PATCH"`, `"HEAD"`, `"OPTIONS"`; case-insensitive).
- `options.headers`: an array of `[name, value]` string pairs.
- `options.body`: a `Uint8Array` (encode strings/JSON yourself).

== Dart

`client.fetch` mirrors the WASM signature with named arguments; the response's `body` is raw bytes (`Uint8List`), and there is no JSON convenience helper here either:

```dart
final payload = utf8.encode(jsonEncode({'input': '...'}));

final resp = await client.fetch(
  method: 'POST',
  path: '/api/run',
  options: FetchOptions(
    headers: [Header(name: 'Content-Type', value: 'application/json')],
    body: payload,
  ),
);

if (resp.status != 200) {
  throw Exception('enclave returned ${resp.status}');
}
final result = jsonDecode(utf8.decode(resp.body));
```

:::

## Reconnects are automatic and re-attested

A `Client` holds a single long-lived attested WebSocket channel. Since SDK 0.2.0 the client transparently re-establishes that channel when it drops (most commonly because the enclave [restarted or was upgraded](/create#lifecycle-commands), which tears the old connection down): the next request on a dead channel first re-dials the WebSocket, re-runs the full Noise handshake, and **re-verifies the attestation** against your pinned PCRs before anything is sent. A reconnect can never relax the checks you configured at connect time.

The semantics worth knowing:

- **A request that was already in flight when the channel died still fails** (native Rust: `Error::ConnectionClosed`; TypeScript: a rejected promise; Dart: an `EnclaviaError` with `retryable` set). The SDK never silently re-sends a request it already transmitted, because it cannot know whether the enclave acted on it before the channel dropped. If the request is idempotent, retry it at the application level; the retry itself will trigger the reconnect.
- **Attestation failures on reconnect are terminal**, not retried. If the enclave now measures differently (for example after an [upgrade](/upgrades)), the reconnect fails closed.
- **Only transient transport failures** are retried internally; protocol and verification errors surface immediately.
- **Open streams are not resurrected.** A raw stream is stateful on the workload side, so a dropped stream stays dead; opening a replacement stream reconnects and re-attests first.
- Native Rust can opt out with `ClientBuilder::auto_reconnect(false)` to restore fail-fast behavior; the TypeScript and Dart bindings always have auto-reconnect enabled.

::: tip Expected right after a deploy or restart
A failed in-flight request immediately after you restart, stop-then-start, or upgrade an enclave is **expected**, not a bug: the old attested channel went away with the old enclave. Retry the request and the client reconnects, re-verifying the new enclave's attestation. If the enclave was [upgraded](/upgrades) to a new image, its PCRs also changed, so the reconnect fails closed until you either re-pin the new values from `enclavia enclave status` or connect with `trustUpgrades` / `ClientBuilder::trust_upgrades` so the client follows the signed upgrade chain automatically.
:::

## Debug-mode enclaves

If you're targeting a debug-mode enclave, the attestation document is a stub that echoes the handshake nonce instead of being COSE-signed. Opt in explicitly:

::: tabs key:lang

== Rust

```rust
let client = Client::builder("wss://...local-debug-url...")
    .pcrs(Pcrs { pcr0: vec![], pcr1: vec![], pcr2: vec![] })
    .debug_mode(true)
    .build()
    .await?;
```

== TypeScript

```js
const client = await connect(
  "wss://...local-debug-url...",
  { pcr0: "", pcr1: "", pcr2: "" },
  { debugMode: true },
);
```

== Dart

```dart
final client = await Client.connect(
  url: 'wss://...local-debug-url...',
  pcrs: Pcrs(pcr0: Uint8List(0), pcr1: Uint8List(0), pcr2: Uint8List(0)),
  options: ConnectOptions(debugMode: true, trustUpgrades: null),
);
```

:::

Debug mode only verifies the nonce binding — never use it against production enclaves.

## Browser and Node specifics

The WASM packaging performs the same attestation verification as the native SDK, so the encrypted channel terminates in the user's browser and no proxy has to be trusted. A few things are specific to it:

**Loading the module.** `init()` must run once before `connect`. Bundlers resolve the `.wasm` asset; in plain Node (no bundler), pass the wasm bytes yourself:

```js
import { readFileSync } from "node:fs";
import init, { connect } from "@enclavia/client-wasm";

await init({
  module_or_path: readFileSync(
    new URL(import.meta.resolve("@enclavia/client-wasm/wasm")),
  ),
});
```

**Raw streams.** Non-HTTP protocols can use `client.openStream(firstBytes)` for a raw byte pipe over the same attested channel.

**Upgrade trust.** `connect` accepts `trustUpgrades: { backendUrl, enclaveId }`, mirroring the native `ClientBuilder::trust_upgrades`.

**WebSocket-inherent differences.** Custom upgrade headers are refused (production routing is by hostname), and TLS for the `wss://` hop belongs to the host runtime (the security boundary is the Noise channel inside it, not the TLS hop). See the [`enclavia-wasm` README](https://github.com/EnclaviaIO/enclavia/tree/master/enclavia-wasm) for the full surface.

## Dart and Flutter specifics

The Dart packaging wraps the same Rust core via UniFFI and works on Android, iOS, Linux, macOS, and Windows. A few things are specific to it:

**The native library builds on your machine.** No prebuilt binaries ship with the package: Dart's Native Assets system compiles the Rust core locally (pinned toolchain, locked dependencies) the first time you `dart pub get` / `dart run` / `flutter run`, so a working `rustup` install is a hard requirement for development and CI.

**Surface.** The API is `Client.connect` and `client.fetch` only; there is no raw stream API in the Dart bindings yet. `Pcrs` takes raw bytes rather than hex strings, and `FetchResponse.body` is a `Uint8List`.

**Errors.** Failures surface as `EnclaviaError`. Transport-level failures carry `retryable: true` (safe to retry, which also triggers the reconnect); attestation and verification failures do not.

See the [`enclavia-dart` README](https://github.com/EnclaviaIO/enclavia/tree/master/enclavia-dart) and its runnable `example/main.dart` for the full surface.
