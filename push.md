# Push an image

Enclavia runs your enclave from a Docker image hosted in your private registry namespace. `enclavia push` is a thin wrapper around `docker tag` + `docker push` that handles registry login and namespacing for you.

## Prerequisites

- You're [authenticated](/auth) — `enclavia enclave list` returns without error.
- You've [created an enclave](/create) that's waiting on the destination tag you're about to push to. Every tag in your namespace is bound to a specific enclave; pushing without a waiting enclave doesn't trigger a build.
- Docker is running and can see the image you want to push.

## Push a local image

The command takes two positional arguments — the local image and the destination in your registry namespace:

```bash
enclavia push <local-image> <destination>
```

For example, given a local image tagged `myapp:dev`:

```bash
enclavia push myapp:dev myapp:v1
```

This:

1. Asks the backend for your registry endpoint and a short-lived bearer token.
2. Logs Docker into `registry.beta.enclavia.io` with that token.
3. Tags `myapp:dev` as `registry.beta.enclavia.io/<handle>/myapp:v1` — the CLI automatically prepends the registry host and your handle, you only ever type `<repo>:<tag>`.
4. Pushes the result.
5. Prints the manifest digest (`sha256:...`) the registry recorded — the content-addressed identifier the backend will pin enclaves to.
6. Notifies the backend that the push happened, so the enclave you've already created against this tag starts building immediately (the backend also polls the registry every 15 seconds as a fallback).

The notify step uses the *push event itself* as the trigger, not just a manifest-digest change. That matters when you re-push an image whose layers the registry already cached — the registry returns the same digest, but the waiting enclave still picks up the push and starts its build.

## Destination grammar

The destination accepts two forms:

- `<repo>[:<tag>]` — owner defaults to your handle. `myapp:v1`, `myapp` (tag defaults to `latest`).
- `<owner>/<repo>[:<tag>]` — owner **must** equal your handle. The form exists so the references you type and the references the backend stores look identical.

`<repo>` uses the same character class as a handle. Tags follow Docker's grammar: `[A-Za-z0-9_.-]`, max 128 characters, no leading `.` or `-`.

## Tag immutability

From your perspective each `<owner>/<repo>:<tag>` is **immutable**. An enclave is bound at creation time to the image it was built from; the attestation document covers the contents of that image. To deploy a new version, create a new enclave bound to a new tag, then push your image to that tag. Pushing the same tag twice is allowed by the registry but will not affect any already-running enclave.

## Pushing from CI

`enclavia push` shells out to `docker login` against the bearer-token endpoint of the registry; nothing CI-specific is required beyond:

- The `enclavia` binary on the runner (install via Nix, or `nix run github:EnclaviaIO/enclavia-crates#enclavia --`).
- A pre-approved API token (run `enclavia auth login` from a developer machine, copy `~/.config/enclavia/credentials.json` into the CI's secret store, restore it before invoking `enclavia push`).
- Docker available to the CI job.

## Next

Once your image is pushed the bound enclave starts building. Check progress with `enclavia enclave status <id>`, then [connect to it](/connect) once it's `running`.
