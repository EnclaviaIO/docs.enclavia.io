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
      text: Push your first image
      link: /push

features:
  - title: Push, then run
    details: Build any Docker image. `enclavia push` uploads it to your private registry namespace. `enclavia enclave create` boots it inside an AWS Nitro enclave.
  - title: Attested by default
    details: Every connection performs a Noise NN handshake, requests an attestation document, and verifies PCR0/1/2 against the image you pushed. No remote agent, no extra steps.
  - title: Encrypted from the browser
    details: The included WASM-friendly client speaks the Noise channel directly to the enclave over a WebSocket proxy. The plaintext never leaves the user's device or the enclave.
  - title: Storage sealed to your enclave
    details: Optional persistent volumes are LUKS-encrypted with a passphrase held in AWS KMS. The key is only released after attestation matches your image's PCRs, so the data is bound to the same identity as the code that wrote it.
  - title: Drive it from Claude
    details: A hosted MCP server lets you manage enclaves from Claude (web or Desktop) in natural language. Same OAuth identity as the CLI, scoped per user, revocable from the dashboard.
---

## What is Enclavia

Enclavia is a managed platform for running container workloads inside hardware-attested enclaves. You point it at a Docker image; it builds an enclave image, boots it on Nitro hardware, and exposes it behind a WebSocket proxy that speaks an end-to-end encrypted channel directly to the enclave.

The pieces a user touches:

- **`enclavia` CLI** — authenticate, push images, create and manage enclaves.
- **`enclavia` client library** (Rust) — connect from a server or browser, verify attestation, send HTTP through the encrypted channel.
- **Backend API** — `https://api.beta.enclavia.io`. Documented implicitly through the CLI.
- **MCP server** — `https://mcp.beta.enclavia.io/mcp`. Lets [Claude drive your enclaves](/mcp) over the Model Context Protocol with the same identity the CLI uses.

## Where to start

1. [Install the CLI](/install).
2. [Authenticate](/auth) by approving a session in the web UI.
3. [Push an image](/push) to your private registry namespace.
4. [Create an enclave](/create) from that image.
5. [Connect](/connect) to it from your code, or [drive Claude](/mcp) at the same enclaves over MCP.

## Beta scope

The public beta runs at `beta.enclavia.io` and is intended for evaluation. Image references resolve against `registry.beta.enclavia.io` under your handle (the user-chosen identifier set during onboarding). The CLI talks to `https://api.beta.enclavia.io` and the encrypted client connects to enclaves under `enclaves.beta.enclavia.io`.

## For AI agents

A machine-readable index of these docs is published at [`/llms.txt`](/llms.txt) — the convention for surfacing documentation to LLMs without parsing HTML. Feed it to your agent of choice.
