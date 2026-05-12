# Reproduce an enclave's build

`enclavia reproduce <enclave-id>` rebuilds an enclave's EIF on your machine and checks that the PCRs of your local build match the ones the backend recorded for the original build.

This is the user-facing half of Enclavia's reproducibility story. PCRs are deterministic measurements of the enclave's kernel + initramfs + rootfs — same inputs in, same PCRs out. If your local rebuild produces a different PCR than the backend recorded, the backend's claim about what code is running in the enclave is suspect, and you should refuse to trust it.

## Trust model

You don't have to trust the host to tell you the truth about which code it booted — instead you pin the PCRs you expect (`Pcrs { pcr0, pcr1, pcr2 }` in the [client library](/connect)) and the Noise attestation flow fails closed if the running enclave's measurements don't match.

`enclavia reproduce` answers the prior question: *what should those PCRs be?* It pulls the image the backend pinned by digest (so a later push to the same tag can't drift the build), runs the same `builder` binary the backend uses, and compares its output to the row the backend wrote at build time. Anyone can do this for `public` enclaves; owners can do it for their `private` ones (registry-enforced).

## Run it

```
$ enclavia reproduce 2f7e1a3c
Enclave:        2f7e1a3c-8b9d-4ec2-9a01-77c5e0a4d8b1
Image digest:   sha256:9c1f4b2d6a7e8c0a3f5d2b1c8e7a6f4d3c2b1a0e9d8c7b6a5f4e3d2c1b0a9f8e
Recorded revs:  builder e3a91bd0f4c5d6e7a8b9c0d1e2f3a4b5c6d7e8f9
                crates  a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
  (the original build was pinned to these revs; if the local PCRs diverge,
  re-run with a builder checked out to those revisions before reporting a failure.)

Running local builder: "builder"
  output: /tmp/enclavia-reproduce-2f7e1a3c-8b9d-4ec2-9a01-77c5e0a4d8b1
...
✓ Reproducible — local PCRs match the recorded build.

  PCR0: 4f8c2a1b...
  PCR1: 7e3d9c0a...
  PCR2: 6b5a4938...
```

On success the command exits `0`. On a PCR mismatch it prints each diverging slot and exits non-zero:

```
✗ NOT reproducible — 1 PCR(s) diverged:

  PCR0
    expected: 4f8c2a1b...
    actual:   8a3e5d92...
```

The enclave id can be a unique prefix (same rule as `enclavia push`); a full UUID works without authentication for public enclaves.

## Pinning your local builder to the recorded revs

PCRs are reproducible only if **all** inputs match — including the `builder` binary itself and the `enclavia-crates` workspace it consumes. The backend records the git revs of both at build time and `enclavia reproduce` prints them as `Recorded revs:`. If your local PCRs diverge, point your local `builder` at those revs before reporting a bug:

```sh
# In your local checkout of the builder repo
git checkout e3a91bd0f4c5d6e7a8b9c0d1e2f3a4b5c6d7e8f9

# Build the binary (see the builder repo README for full instructions)
nix build .#builder

# Tell `enclavia reproduce` where to find it
BUILDER_PATH=$(realpath result/bin/builder) enclavia reproduce 2f7e1a3c
```

The CLI prefers `$BUILDER_PATH`, then falls back to `builder` on `$PATH`.

## No provenance recorded

Enclaves built by an older backend (or by a deployment without `FLAKE_LOCK_PATH` configured) have no recorded revs. The command still runs — your local PCRs are compared against the ones the backend recorded — but the rev-pinning hint is suppressed:

```
Recorded revs:  none (built by an older backend; can't pin local rebuild to source)
```

If reproduction fails for such an enclave there's no canonical source-pin to fall back to; you'll have to figure out which revs the deploying backend was on at the time by other means (git log, deployment history, etc.).
