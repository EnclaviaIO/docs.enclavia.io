# Install the CLI

The `enclavia` CLI is the primary entry point: authenticate, push images, create and manage enclaves. It is distributed as a Nix flake from [`EnclaviaIO/enclavia-crates`](https://github.com/EnclaviaIO/enclavia-crates).

## Requirements

- A working [Nix](https://nixos.org/download) installation with flakes enabled.
- [Docker](https://docs.docker.com/engine/install/) — the CLI shells out to `docker tag` and `docker push` when uploading images.

If your Nix config doesn't enable flakes by default, add this to `~/.config/nix/nix.conf`:

```
experimental-features = nix-command flakes
```

## Run without installing

For a one-off invocation:

```bash
nix run github:EnclaviaIO/enclavia-crates#enclavia -- --help
```

Every subsequent `enclavia ...` example in these docs can be prefixed with `nix run github:EnclaviaIO/enclavia-crates#enclavia --` if you'd rather not install the binary.

## Install into your profile

To get a persistent `enclavia` on `$PATH`:

```bash
nix profile install github:EnclaviaIO/enclavia-crates#enclavia
```

To upgrade later:

```bash
nix profile upgrade enclavia
```

## Verify

```bash
enclavia --help
```

You should see the top-level command list — `auth`, `enclave`, `push`. If that prints, you're done — head to [Authenticate](/auth).

## Backend

The CLI talks to the public beta backend at `https://api.beta.enclavia.io`. Credentials live under `~/.config/enclavia/` after `enclavia auth login`.
