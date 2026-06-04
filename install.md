# Install the CLI

The `enclavia` CLI is the primary entry point: authenticate, push images, create and manage enclaves. The source of truth is the public workspace at [`EnclaviaIO/enclavia`](https://github.com/EnclaviaIO/enclavia).

There are three ways to install it, in roughly the order most users will reach for them. All produce the same `enclavia` binary; pick the one that matches the toolchain you already have on your machine.

- [Nix](#nix-recommended) — the recommended path; one command, no system dependencies to install.
- [cargo install](#cargo-install) — if you already have a Rust toolchain.
- [Build from source](#build-from-source) — if you want to read or modify the code as you go.

## Common requirement

Regardless of install method:

- [Docker](https://docs.docker.com/engine/install/) — the CLI shells out to `docker tag` and `docker push` when you run `enclavia push`.

## Nix (recommended)

A working [Nix](https://nixos.org/download) installation with flakes enabled is the only prerequisite. If your Nix config doesn't enable flakes by default, add this to `~/.config/nix/nix.conf`:

```
experimental-features = nix-command flakes
```

For a one-off invocation:

```bash
nix run github:EnclaviaIO/enclavia#enclavia -- --help
```

Every `enclavia ...` example in these docs can be prefixed with `nix run github:EnclaviaIO/enclavia#enclavia --` if you'd rather not install the binary.

To get a persistent `enclavia` on `$PATH`:

```bash
nix profile install github:EnclaviaIO/enclavia#enclavia
```

To upgrade later:

```bash
nix profile upgrade enclavia
```

## cargo install

If you already use Rust, `cargo install` fetches the source and builds it once into `~/.cargo/bin`.

### Prerequisites

- A reasonably recent Rust toolchain (stable channel, 1.85+). [rustup](https://rustup.rs) is the path of least resistance.
- A C compiler and `pkg-config`. The CLI's HTTP client uses the system OpenSSL via `openssl-sys`, which builds against the host's libssl headers at install time.

Concrete package lists, by OS:

```bash
# Debian / Ubuntu
sudo apt install pkg-config libssl-dev build-essential

# Fedora / RHEL
sudo dnf install pkg-config openssl-devel gcc

# macOS (with Homebrew)
brew install pkg-config openssl@3
```

On macOS you may also need to point `openssl-sys` at the Homebrew install:

```bash
export PKG_CONFIG_PATH="$(brew --prefix openssl@3)/lib/pkgconfig"
```

### Install

```bash
cargo install --git https://github.com/EnclaviaIO/enclavia enclavia-cli
```

The trailing `enclavia-cli` is required: the repo is a workspace with several binaries (`enclavia-server`, `mock-kms`, etc), and `cargo install` needs to know which package to take. The installed binary is still called `enclavia` (the crate's `[[bin]]` name).

`~/.cargo/bin` should already be on your `$PATH` if you installed Rust via rustup. To upgrade later, re-run the same command — `cargo install` will rebuild if the upstream commit has moved.

## Build from source

If you'd rather have the repo on disk:

```bash
git clone https://github.com/EnclaviaIO/enclavia
cd enclavia
cargo build --release -p enclavia-cli
sudo install -m 0755 target/release/enclavia /usr/local/bin/enclavia
```

Same prerequisites as the `cargo install` path. The binary you want is at `target/release/enclavia`; the `install` step is optional but puts it somewhere on `$PATH`.

## Verify

```bash
enclavia --help
```

You should see the top-level command list (`auth`, `enclave`, `push`, `reproduce`). If that prints, you're done; head to [Authenticate](/auth).

## Backend

The CLI talks to the public beta backend at `https://api.beta.enclavia.io`. Credentials live under `~/.config/enclavia/` after `enclavia auth login`.
