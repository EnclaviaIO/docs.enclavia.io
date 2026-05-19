# Sample apps

The fastest way to feel what Enclavia does is to run a sample. Every sample is a self-contained Docker image with a short README that walks you through `create` → `push` → connect. Pick one, follow its README, and you'll have something running inside an attested enclave in a few minutes.

## Where they live

All samples live in one public repo:

**[github.com/EnclaviaIO/enclavia-samples](https://github.com/EnclaviaIO/enclavia-samples)**

Each top-level directory is a standalone sample. Clone the repo, change into the directory of the sample you want to try, and follow that README.

```bash
git clone https://github.com/EnclaviaIO/enclavia-samples
cd enclavia-samples/<sample-name>
# follow the README in that directory
```

## The general shape

Every sample expects the same basic prerequisites: the [`enclavia` CLI](/install) is installed and authenticated, Docker is running, and you've completed [`enclavia auth login`](/auth). Most samples then walk through the same three phases:

1. **Build the image locally** with `docker build`.
2. **Create the enclave** with `enclavia enclave create` (the sample's README spells out the flags — usually `--container-port` and sometimes an [egress allowlist](/egress)).
3. **Push the image** with `enclavia push <local-image> <enclave-id>`. The push flips the enclave to `building`; once it's `running`, the sample shows how to connect to it (either from the [client library](/connect) or, where relevant, the dashboard).

If you have the [MCP connector](/mcp) wired up, step 2 (and any inspection along the way) can be driven from your AI agent in natural language. Step 3 still runs on your laptop because pushing needs your local Docker daemon.

## Just the management surface, no Docker

If you don't want to install Docker yet and you just want to see Enclavia respond, the [MCP connector](/mcp) alone is enough to:

- Create an enclave (it will sit in `waiting_for_image`).
- List your enclaves, inspect status, read build logs.
- Stop / destroy enclaves you created earlier.

That's not the full loop — until you `enclavia push` an image the enclave never reaches `running` — but it's enough to confirm the connector is wired correctly against your account before you commit to a local install.

## Use a sample as a starting point

Each sample is intentionally small. Once one is running, copy its directory into your own project, swap the app for your own code, and you have a known-good `enclave create` invocation + push flow to build on top of. The `egress` sample in particular is useful as a template for any workload that needs outbound traffic — the [Outbound egress allowlist](/egress) page explains the policy semantics it exercises.

## Want to contribute a sample?

PRs are welcome at [EnclaviaIO/enclavia-samples](https://github.com/EnclaviaIO/enclavia-samples). The bar is roughly: a small Dockerfile, a 30-line README, and instructions that work against `api.beta.enclavia.io` without any private dependencies.
