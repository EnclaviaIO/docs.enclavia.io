---
layout: home

hero:
  name: Enclavia
  text: Provable computation, as simple as pushing a Docker image.
  tagline: Run your container inside an attested enclave. End-to-end encryption from the browser. Public beta.
  actions:
    - theme: brand
      text: Install the CLI
      link: /install
    - theme: alt
      text: Run a sample
      link: /samples

features:
  - title: Create, then push
    details: '`enclavia enclave create` reserves an enclave and a dedicated private repo for it in your registry namespace. `enclavia push` uploads your image into that repo, which triggers the build and boots the enclave inside AWS Nitro.'
  - title: Attested by default
    details: Every connection performs a Noise NN handshake, requests an attestation document, and verifies PCR0/1/2 against the image you pushed. No remote agent, no extra steps.
  - title: Reproducible builds
    details: '`enclavia reproduce` rebuilds the enclave image from the exact recorded sources and compares the PCRs to the deployed enclave, so anyone can verify the running code matches what was pushed, not just trust the attestation. Provable, end to end.'
  - title: Encrypted from the browser
    details: The client SDK ships for Rust and, as `@enclavia/client-wasm` on npm, for browsers and Node. It speaks the Noise channel directly to the enclave over a WebSocket proxy, so the plaintext never leaves the user's device or the enclave.
  - title: Storage sealed to your enclave
    details: Optional persistent volumes are LUKS-encrypted with a passphrase held in AWS KMS. The key is only released after attestation matches your image's PCRs, so the data is bound to the same identity as the code that wrote it.
  - title: Drive it from your AI agent
    details: Two ways to let an agent manage your enclaves in natural language. A hosted MCP server for any MCP-aware client (Claude, ChatGPT, Cursor, the OpenAI Codex CLI), or the CLI plus an agent skill for local agents that already have a shell, which is more token-efficient. Both use the same OAuth identity as the CLI, scoped per user and revocable from the dashboard.
---

## What is Enclavia

Enclavia is a managed platform for running container workloads inside hardware-attested enclaves. You point it at a Docker image; it builds an enclave image, boots it on Nitro hardware, and exposes it behind a WebSocket proxy that speaks an end-to-end encrypted channel directly to the enclave.

The pieces a user touches:

- **`enclavia` CLI** — authenticate, push images, create and manage enclaves. On crates.io as [`enclavia-cli`](https://crates.io/crates/enclavia-cli).
- **`enclavia` client SDK** — connect from a server or browser, verify attestation, send HTTP through the encrypted channel. On crates.io as [`enclavia`](https://crates.io/crates/enclavia) (Rust) and on npm as [`@enclavia/client-wasm`](https://www.npmjs.com/package/@enclavia/client-wasm) (browsers, Node 22+, Deno).
- **Backend API** — `https://api.beta.enclavia.io`. Documented implicitly through the CLI.
- **MCP server** — `https://mcp.beta.enclavia.io/mcp`. Lets [any MCP-aware agent](/mcp) (Claude, ChatGPT, Cursor, Codex, …) drive your enclaves with the same identity the CLI uses.

## Where to start

The fastest path to seeing Enclavia work is to run a [sample app](/samples) end to end. For your own workload the steps are:

1. [Install the CLI](/install).
2. [Authenticate](/auth) by approving a session in the web UI.
3. [Create an enclave](/create), which reserves a private repo for it in your registry namespace.
4. [Push an image](/push) to that enclave, which triggers the build.
5. [Connect](/connect) to it from your code, or [point an AI agent](/mcp) (Claude, ChatGPT, Cursor, Codex, …) at the same enclaves over MCP.

## Beta scope

The public beta runs at `beta.enclavia.io` and is intended for evaluation. Image references resolve against `registry.beta.enclavia.io` under your handle (the user-chosen identifier set during onboarding). The CLI talks to `https://api.beta.enclavia.io` and the encrypted client connects to enclaves under `enclaves.beta.enclavia.io`.

## For AI agents

A machine-readable index of these docs is published at [`/llms.txt`](/llms.txt) — the convention for surfacing documentation to LLMs without parsing HTML. Feed it to your agent of choice.
