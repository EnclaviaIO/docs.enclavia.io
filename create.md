# Create an enclave

`enclavia enclave create` reserves an enclave bound to a Docker image reference and waits for you to push it. The build only starts once your `enclavia push` produces a *fresh* manifest digest for that tag — there's no way to accidentally bind a new enclave to stale content. Builds are asynchronous; you poll for status.

## The minimum

```bash
enclavia enclave create --image myapp:v1
enclavia push myapp:dev myapp:v1   # in the same or another shell
```

This reserves a `small` enclave bound to `<handle>/myapp:v1` with no persistent storage and no inbound HTTP port. The backend canonicalizes whatever you pass to `--image` into the full registry path (`registry.beta.enclavia.io/<handle>/<repo>:<tag>`) and stores *that*. The `create` output looks like:

```
Enclave created:
  ID:     1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d
  Status: waiting_for_image

Push your image to start the build:
  enclavia push <local-image> <handle>/myapp:v1

The enclave is bound to whatever digest your push produces — re-pushing
the same tag later won't affect this enclave. Check status with
`enclavia enclave status 1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d`.
```

## Create-then-push

Every `create` lands in `waiting_for_image`, even if `<owner>/<repo>:<tag>` already resolves in the registry. The backend snapshots the digest of whatever is at that tag right now (the *baseline*) and only flips the enclave to `building` once it sees a digest that's different from the baseline — i.e. a fresh push.

The enclave's identity is then pinned to that pushed digest (`docker_image` becomes `<host>/<owner>/<repo>@sha256:...`). Re-pushing the same tag later produces a new digest but doesn't touch this enclave; it stays bound to the digest it built from. To deploy a new version, run `create` again and push to it.

If the manifest doesn't exist yet at create time the baseline is empty, and the very first push wins.

## Image reference grammar

`--image` accepts two forms:

- `<repo>[:<tag>]` — owner defaults to your handle. `myapp:v1`, or `myapp` (tag defaults to `latest`).
- `<owner>/<repo>[:<tag>]` — owner **must** equal your handle; the backend rejects mismatches. The form exists so the references you type and the references the backend stores look the same.

`<repo>` uses the same character class as a handle. Tags follow Docker's grammar: `[A-Za-z0-9_.-]`, max 128 characters, no leading `.` or `-`. See [Push › Destination grammar](/push#destination-grammar) for the full rules.

## Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--image <ref>` | required | Image reference; see [Image reference grammar](#image-reference-grammar) above. |
| `--instance-type <small\|medium\|large>` | `small` | Resource tier. |
| `--container-port <port>` | unset | Plaintext port the container listens on inside the enclave. The proxy forwards decrypted bytes to `127.0.0.1:<port>` once the Noise channel is up. Required if you want the enclave to expose an HTTP service. |
| `--storage-size-bytes <bytes>` | unset | Size of the persistent encrypted volume in bytes. Omit (or pass `0`) for a stateless enclave. Minimum is 128 MiB (`134217728`); the backend rejects anything smaller. |

### Persistent storage

When `--storage-size-bytes` is set, the backend provisions a LUKS2 volume on top of btrfs and mounts it inside the container at `/data` — that's where your app reads and writes. Pick a size in bytes; for example:

```bash
enclavia enclave create --image myapp:v1 --storage-size-bytes 1073741824   # 1 GiB
enclavia enclave create --image myapp:v1 --storage-size-bytes 134217728    # 128 MiB (minimum)
```

The volume is encrypted at rest. The LUKS passphrase lives in AWS KMS and is only released to the enclave after its attestation document matches the image's PCRs — so a stolen backing file is useless without the running, attested enclave. See [Push](/push) for why image tags are immutable.

Lifecycle: `enclave stop` keeps the encrypted volume around so the next start can re-mount it. `enclave destroy` removes the record and the volume.

## Timeout

The backend polls the registry for up to **30 minutes** after `create`. If no fresh push lands in that window the enclave moves to `error` with a `no fresh push detected within 30 minutes` message.

## Lifecycle commands

```bash
enclavia enclave list                  # all your enclaves
enclavia enclave status <id>           # detail: status, instance type, image, vsock CID, PCRs
enclavia enclave stop <id>             # stop a running enclave (terminates the instance)
enclavia enclave destroy <id>          # delete the enclave record (and any provisioned storage)
```

`status` will show populated PCRs (`pcr0`, `pcr1`, `pcr2` as hex) once the build completes. Those are the values you'll pin in the client when [connecting](/connect).

## Status meanings

| Status | Meaning |
|--------|---------|
| `waiting_for_image` | Created and waiting for a fresh `enclavia push` to the bound tag. |
| `building` | The backend is producing the enclave image (EIF) from your Docker image. |
| `running` | The enclave is up. The proxy URL is `https://<id>.enclaves.beta.enclavia.io`. |
| `stopped` | The instance is no longer running. The record (and storage if any) is preserved. |
| `error` | Something failed; `error_message` in `enclave status` has details. |

## Connect

Once the enclave is `running`, hand its ID and PCRs to the client library — see [Connect](/connect).
