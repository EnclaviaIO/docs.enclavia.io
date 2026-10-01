---
description: "Build an EIF locally from a Docker image as a CI gate, without creating or touching any enclave"
---

# Build as a CI gate

`enclavia build <local-image>` (alias `enclavia ci`) turns a local Docker image into an enclave EIF on your own machine, using the same `builder` the backend runs, without creating or touching any enclave. It is meant to run right after `docker build`, as a gate in your CI pipeline: a non-zero exit means the image would also fail to build when you later push it for real.

No login or account is required. Nothing is uploaded anywhere.

## Prerequisites

- `nix` installed and on `$PATH`.
- The `builder` binary on `$PATH`, or `BUILDER_PATH` pointing at one. `nix profile install github:EnclaviaIO/builder` installs both the tool dependencies and the binary; no source checkout of the builder repo is needed; its flake source is fetched automatically.
- A linux/amd64 Docker image.

## Run it

By default the image is read from your local Docker daemon, which is what a CI job has right after `docker build`:

```bash
docker build -t myapp:candidate .
enclavia build myapp:candidate
```

```
Fetching builder source from github:EnclaviaIO/builder …
Building docker-daemon:myapp:candidate into an EIF …
  output: ./enclavia-out
… builder log …
Build succeeded.
Source:  docker-daemon:myapp:candidate
EIF:     ./enclavia-out/image.eif
PCR0:    4f8c2a1b...
PCR1:    7e3d9c0a...
PCR2:    6b5a4938...
```

Exit code `0` means the image builds into an EIF; any failure (missing builder, image not found, build error) exits non-zero with the error printed, which is what a CI step branches on.

## Image sources

| Form | Behavior |
|------|----------|
| Plain reference, e.g. `myapp:dev` | Read from the local Docker daemon (`docker-daemon:` transport). A bare name with no tag or digest defaults to `:latest`, same as Docker. |
| `--pull` | Fetch `local_image` from its registry instead of the local daemon. |
| An explicit skopeo transport (`docker-archive:img.tar`, `oci:dir`, `oci-archive:file`, `containers-storage:name`) | Passed straight through, letting you build from a tarball or OCI layout without a Docker daemon at all. |

## Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--pull` | off | Pull `local_image` from its registry instead of the local Docker daemon. |
| `--output-dir <dir>` | `./enclavia-out` | Directory to write `image.eif` and `pcr.json` into (plus the `egress.json` policy that was baked in). |
| `--container-port <port>` | `8080` | Port the container listens on inside the enclave. Match the `--container-port` you use (or will use) at `enclave create` time. |
| `--debug` | off | Build with debug-attestation trust settings (what a non-`--production` enclave runs). The builder only measures this into the synchronizer trust config, which local builds don't bake in, so today the EIF and its PCRs are the same with or without it. |
| `--storage` | off | Build the storage-capable variant (LUKS+btrfs over NBD), matching an enclave created with `--storage-size-bytes`. |
| `--egress-allow HOST:PORT[/PROTO]`, `--egress-resolver IPV4`, `--egress-dns allowlist\|open`, `--egress-config PATH` | none | Same [egress allowlist](/egress) flags as `enclave create`. Without any of them the empty deny-all policy is baked in, matching a create with no egress flags. |
| `--builder-rev <git-rev>` | default branch tip | Pin the builder flake source to a specific git rev of the builder repo, so a CI gate doesn't move under you as the builder evolves. Overrides an exported `BUILDER_FLAKE`. |

## JSON output

`enclavia build --json` prints a single object instead of the human-readable summary, for CI steps that want to parse the result:

```json
{"source":"docker-daemon:myapp:dev","eif_path":"./enclavia-out/image.eif","pcrs":{"PCR0":"...","PCR1":"...","PCR2":"..."}}
```

## How this differs from `enclavia reproduce`

Both commands shell out to the same `builder` binary rather than reimplementing the build. [`enclavia reproduce`](/reproduce) rebuilds an *existing* enclave's recorded image and compares the resulting PCRs against what the backend stored, to verify a running enclave matches its claimed code. `enclavia build` has no enclave and no recorded row to compare against: it just builds whatever local image you give it and reports whether the build succeeded, plus the resulting PCRs, which is all a CI gate needs.

Don't expect those PCRs to match the ones a deployed enclave reports for the same image. A real deploy also measures per-enclave values into the EIF (such as the enclave id and the pinned image digest), so its PCRs are unique to that enclave. Use `enclavia reproduce` when you need PCR equality.
