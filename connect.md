# Connect from a client

Each running enclave is reachable at `https://<id>.enclaves.beta.enclavia.io` — that URL is the WebSocket-based proxy that bridges your client to the enclave's vsock channel. The client speaks Noise+CBOR directly to the in-enclave responder; the proxy is protocol-agnostic and never sees plaintext.

The reference client is the Rust `enclavia` crate from this workspace. It runs natively (Tokio) and is structured so it can also target WebAssembly.

## Add the dependency

```toml
# Cargo.toml
[dependencies]
enclavia = { git = "https://github.com/EnclaviaIO/enclavia-crates" }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

The crate's public surface is small: `Client`, `ClientBuilder`, `Pcrs`, and a request builder. Optional `json` feature brings in `RequestBuilder::json`.

## Connect and verify

```rust
use enclavia::{Client, Pcrs};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pcrs = Pcrs {
        pcr0: hex::decode("...your pcr0...")?,
        pcr1: hex::decode("...your pcr1...")?,
        pcr2: hex::decode("...your pcr2...")?,
    };

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

## Browser

The same crate is structured to compile to WebAssembly so the encrypted channel terminates in the user's browser. The browser-side wrapper is published separately; this page will be updated when it ships in the public beta.
