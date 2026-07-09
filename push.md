# Push an image

Enclavia runs each enclave from a Docker image hosted in a dedicated private repo at `registry.beta.enclavia.io/<your-handle>/<enclave-uuid>`. `enclavia push` is a thin wrapper around `docker tag` + `docker push` that handles registry login and the per-enclave namespacing for you.

For a brand-new enclave you can skip the separate push entirely: [`enclavia deploy`](/deploy) runs create, push, and the build watch as one command. `push` on its own remains the right tool for scripts, agents, and for shipping a new image to an existing [upgradable](/upgrades) enclave.

## Prerequisites

- You're [authenticated](/auth); `enclavia enclave list` returns without error.
- You've [created an enclave](/create) and have its id (printed by `enclave create` and visible in `enclave list`).
- Docker is running and can see the image you want to push.

## Push a local image

The command takes two positional arguments: the local image to upload, and the id of the enclave you want to bind it to.

```bash
enclavia push <local-image> <enclave-id>
```

For example, given a local image tagged `myapp:dev` and an enclave whose id starts with `1d2c3b4a`:

```bash
enclavia push myapp:dev 1d2c3b4a
```

This:

1. Resolves `1d2c3b4a` against your enclaves; if it doesn't match exactly one of yours, the push fails before any I/O. Pass a full UUID if the prefix is ambiguous.
2. Asks the backend for your registry endpoint and a short-lived bearer token.
3. Logs Docker into `registry.beta.enclavia.io` with that token.
4. Tags `myapp:dev` as `registry.beta.enclavia.io/<handle>/<enclave-uuid>:latest` and pushes it.
5. Prints the manifest digest (`sha256:...`) the registry recorded; that's the content-addressed identifier the backend will pin the enclave to.
6. Notifies the backend that the push happened, so the waiting enclave starts building immediately. The backend also polls the registry as a fallback in case the notify is lost.

The notify step uses the *push event itself* as the trigger, not just a manifest-digest change. That matters when you re-push an image whose layers the registry already cached: the registry returns the same digest, but the waiting enclave still picks up the push and starts its build.

## Enclave id grammar

The second argument is the enclave id printed by `enclave create`, or any unique prefix that resolves to exactly one of your enclaves. A full UUID always works. The CLI never asks you to type the registry path or your handle; both are derived from the enclave id.

## One image per enclave (non-upgradable)

By default an enclave is **non-upgradable**: it is bound at build time to the digest of whatever you first push to its repo. Pushing again to the same repo produces a new digest in the registry but is rejected with an error:

```
Error: this enclave is non-upgradable, create a new one
```

To deploy a new version, [create a fresh enclave](/create) and push to it.

## Staged deployments (upgradable enclaves)

If the enclave was created with `--upgradable`, a second push does not deploy. Instead it stages the new image: the EIF is built but the running enclave is left untouched until you explicitly confirm the upgrade.

```bash
enclavia push myapp:v2 1d2c3b4a
# ...
# Staged upgrade a3b4c5d6-... for enclave 1d2c3b4a-...
# Confirm with: enclavia upgrade confirm 1d2c3b4a a3b4c5d6
```

From there you can review the staged upgrade, schedule when it should fire, or revoke it before it takes effect. See [Staged deployments and the upgrade chain](/upgrades) for the full workflow.

## Pushing from CI

`enclavia push` shells out to `docker login` against the bearer-token endpoint of the registry; nothing CI-specific is required beyond:

- The `enclavia` binary on the runner (install via Nix, or `nix run github:EnclaviaIO/enclavia#enclavia --`).
- A pre-approved API token (run `enclavia auth login` from a developer machine, copy `~/.config/enclavia/credentials.json` into the CI's secret store, restore it before invoking `enclavia push`).
- Docker available to the CI job.

## Next

Once your image is pushed the bound enclave starts building. Check progress with `enclavia enclave status <id>`, then [connect to it](/connect) once it's `running`.
