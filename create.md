# Create an enclave

`enclavia enclave create` asks the backend to build an enclave image from a registry image and boot it on a Nitro instance. Builds are asynchronous; the create call returns immediately with an enclave ID and you poll for status.

## The minimum

```bash
enclavia enclave create --image myapp:v1
```

This launches a `small` enclave from `<handle>/myapp:v1` with no persistent storage and no inbound HTTP port. The output looks like:

```
Enclave created:
  ID:     1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d
  Status: building

The enclave is being built. Check status with:
  enclavia enclave status 1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d
```

## Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--image <ref>` | required | Image reference. Same grammar as the [push destination](/push#destination-grammar). |
| `--instance-type <small\|medium\|large>` | `small` | Resource tier. |
| `--container-port <port>` | unset | Plaintext port the container listens on inside the enclave. The proxy forwards decrypted bytes to `127.0.0.1:<port>` once the Noise channel is up. Required if you want the enclave to expose an HTTP service. |
| `--storage-size-bytes <bytes>` | unset | Persistent encrypted storage size. Omit (or pass `0`) for a stateless enclave. |

::: tip Persistent storage
When `--storage-size-bytes` is set, the backend provisions a LUKS volume keyed via KMS and mounts it inside the enclave. The decryption key is released to the enclave only after the attestation document matches the image — so the storage is bound to the same identity as the running code. See [Push](/push) for why image tags are immutable.
:::

## Image not pushed yet

If you call `create` before pushing, the backend accepts the request and parks the enclave in `waiting_for_image`:

```
Image was not found in the registry yet. Run:
  enclavia push <local-image> <handle>/myapp:v1

to push it. The enclave will start building automatically once the image is available.
```

The build picks up automatically once the manifest resolves. After 30 minutes without a push, the enclave moves to `error`.

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
| `waiting_for_image` | Created but the source image isn't in the registry yet. |
| `building` | The backend is producing the enclave image (EIF) from your Docker image. |
| `running` | The enclave is up. The proxy URL is `https://<id>.enclaves.beta.enclavia.io`. |
| `stopped` | The instance is no longer running. The record (and storage if any) is preserved. |
| `error` | Something failed; `error_message` in `enclave status` has details. |

## Connect

Once the enclave is `running`, hand its ID and PCRs to the client library — see [Connect](/connect).
