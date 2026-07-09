# Deploy in one command

`enclavia deploy` is the fastest way to get a local Docker image running inside an enclave. It rolls the whole flow into a single command: it creates the enclave, pushes your image into the enclave's registry repo, and then follows the build live (spinner, streamed build log) until the enclave is `running`.

```bash
enclavia deploy myapp:v1 --name my-api --container-port 8080
```

This is the **preferred path for humans** working interactively. If you are writing a script or driving the CLI from an AI agent, use the individual commands instead ([create](/create), [push](/push), then poll `enclave status`): each step then has its own JSON output and exit code, and nothing holds a process open for the length of a build. See [When not to use it](#when-not-to-use-it).

## What it does

`deploy` takes one positional argument, the local Docker image, plus every flag that [`enclave create`](/create) accepts:

1. **Create.** Reserves the enclave with the flags you passed, exactly as `enclavia enclave create` would.
2. **Push.** Logs Docker into your registry, tags the image as the enclave's repo, pushes it, and notifies the backend, exactly as `enclavia push` would.
3. **Watch.** Polls the enclave until it reaches a terminal state. While waiting it shows a spinner with the current phase and elapsed time, and once the build starts it streams the build log so long builds never look stuck.

On success it prints the enclave's ID, endpoint, and the PCR0/1/2 values to pin in your [client](/connect):

```
Enclave created: 1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d

The push refers to repository [registry.beta.enclavia.io/alice/1d2c3b4a-...]
...
Build started; streaming the build log:
  building '/nix/store/...-enclave-rootfs.drv'...
  ...
Build complete; launching the enclave...

✓ Deployed in 46s

  ID:       1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d
  Name:     my-api
  Endpoint: wss://1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d.enclaves.beta.enclavia.io
  PCRs (pin these in your client):
    PCR0: ...
    PCR1: ...
    PCR2: ...
```

If the build fails, `deploy` prints the backend's error message and points you at `enclavia enclave logs <id>` for the full build log.

## Flags

All [`enclave create` flags](/create#flags) work unchanged: `--instance-type`, `--container-port`, `--name`, `--storage-size-bytes`, `--visibility`, the `--egress-*` family, `--upgradable`, `--control-key`, `--min-upgrade-delay`, and so on. `deploy` is a superset of `create`; anything documented there applies here.

## Interrupting it

The watch is read-only: **Ctrl-C stops the watch, never the build.** The create and push already happened, so the backend keeps building server-side. Re-attach at any time with:

```bash
enclavia enclave status <id>   # current state
enclavia enclave logs <id>     # build log so far
```

The same applies if the watch times out (it gives up after 45 minutes) or loses connectivity to the backend: the deploy itself is not rolled back, and `status` will tell you how it ended.

## When not to use it

`deploy` is a convenience wrapper for interactive use. Prefer the individual commands when:

- **You are scripting or running in CI.** `create`, `push`, and a `status` polling loop give you one JSON value and one exit code per step, so a failure is attributable to a specific stage.
- **An AI agent is driving the CLI.** The [agent skill](/agent-skill) steers agents to the individual commands for the same reason: separately actionable steps, and no process held open for many minutes while a build runs.
- **The enclave already exists.** `deploy` always creates a new enclave. To ship a new image to an existing upgradable enclave, use [`enclavia push`](/push) and the [staged upgrade flow](/upgrades).

With `--json`, `deploy` still honours the [stdout contract](/agent-skill#the-json-contract): the spinner is disabled, all progress and build-log lines go to stderr, and stdout carries exactly one JSON value (the final enclave object). But scripts should prefer the individual commands anyway.

## Next

- [Connect](/connect) to the running enclave with the printed PCRs.
- [Create an enclave](/create) for the full flag reference and the create-then-push mechanics.
- [Staged deployments](/upgrades) for shipping new versions to upgradable enclaves.
