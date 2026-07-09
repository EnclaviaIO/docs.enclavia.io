# Create an enclave

`enclavia enclave create` reserves an enclave id and provisions a dedicated private registry repo for it at `<your-handle>/<enclave-uuid>`. The enclave starts in `waiting_for_image` and stays there until you `enclavia push` your container image into that repo. Builds are asynchronous; you poll for status.

::: tip Working interactively?
[`enclavia deploy`](/deploy) rolls create, push, and the build watch into one command, and accepts every flag documented on this page. Prefer it when you're at a terminal; use the individual `create` / `push` steps below in scripts and agents.
:::

## The minimum

```bash
enclavia enclave create
```

This reserves a `small` enclave with no persistent storage, no inbound HTTP port, and an auto-generated `<adjective>-<animal>-<NNN>` display name. The output looks like:

```
Enclave created:
  ID:     1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d
  Status: waiting_for_image

Push your image to start the build:
  enclavia push <local-image> 1d2c3b4a

Check status with `enclavia enclave status 1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d`.
```

The second argument to `enclavia push` is the enclave id (or any unique prefix that resolves to exactly one of your enclaves). The CLI tags your local image as `registry.beta.enclavia.io/<handle>/<enclave-uuid>:latest` and pushes it; the registry digest the push produces is what the backend pins the enclave to. See [Push an image](/push).

## A more typical example

```bash
enclavia enclave create \
  --instance-type small \
  --container-port 8080 \
  --name my-api \
  --storage-size-bytes 268435456
```

This reserves a `small` enclave with a 256 MiB encrypted volume, declares that the container listens on `127.0.0.1:8080` inside the enclave (so the proxy knows where to forward decrypted traffic), and labels the enclave `my-api` in the dashboard and `enclave list`.

## How create-then-push works

Each enclave owns its own registry repo at `<your-handle>/<enclave-uuid>`. `create` provisions that repo; the first successful push to it is what flips the enclave from `waiting_for_image` to `building`, and the digest the registry assigns becomes the enclave's pinned image (`docker_image` becomes `<host>/<owner>/<enclave-uuid>@sha256:...`).

For non-upgradable enclaves (the default), the enclave's identity is pinned to that digest for its lifetime. Pushing a different image later is rejected. To deploy a new version, `create` a fresh enclave and `push` your new image to it. For upgradable enclaves, subsequent pushes are staged and require an explicit confirm step before any version swap occurs. See [Staged deployments](/upgrades).

## Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--instance-type <small\|medium\|large>` | `small` | Resource tier. |
| `--container-port <port>` | unset | Plaintext port the container listens on inside the enclave. The proxy forwards decrypted bytes to `127.0.0.1:<port>` once the Noise channel is up. Required if you want the enclave to expose an HTTP service. |
| `--storage-size-bytes <bytes>` | unset | Size of the persistent encrypted volume in bytes. Omit (or pass `0`) for a stateless enclave. Minimum is 128 MiB (`134217728`); the backend rejects anything smaller. |
| `--name <name>` | auto-generated | Optional freeform display name (max 64 chars). Shown in the dashboard header and `enclave list`. Omit it to get an `<adjective>-<animal>-<NNN>` name. |
| `--visibility <private\|public>` | `private` | Registry visibility for anonymous pulls. `public` lets anyone pull the enclave's image without auth, which is what makes `enclavia reproduce` work for non-owners. Owner pulls and pushes are governed by ownership and unaffected. |
| `--egress-allow <host:port[/proto]>` | unset (deny-all) | Permit one outbound destination. Repeatable. See [Outbound egress allowlist](/egress). |
| `--egress-resolver <ipv4>` | unset | DNS resolver(s) the in-enclave `unbound` forwards to. Required if any `--egress-allow` is a hostname. Repeatable. |
| `--egress-config <path>` | unset | Path to a JSON allowlist file. Mutually exclusive with `--egress-allow` / `--egress-resolver`. See [Outbound egress allowlist](/egress#json-schema). |
| `--upgradable` | off | Mark the enclave as upgradable. Future pushes are staged rather than rejected. Immutable post-create. See [Staged deployments](/upgrades). |
| `--control-key <name>` | unset (managed) | Use self-hosted control-key custody: register the named local key (from `enclavia key generate --yubikey`) as this enclave's control key, so only your hardware can authorize upgrades. Implies `--upgradable`. Immutable post-create. See [Control-key custody](/custody). |
| `--min-upgrade-delay <duration>` | unset (no minimum) | Minimum delay between confirming an upgrade and it taking effect, e.g. `30m`, `48h`, `7d`, or a bare number of seconds. Baked into the measured image, so the enclave itself rejects any earlier activation, including `--immediate`, even from the control-key holder. Requires `--upgradable`. Maximum 90 days. Immutable post-create. See [Minimum upgrade delay](/upgrades#minimum-upgrade-delay). |

### Persistent storage

When `--storage-size-bytes` is set, the backend provisions a LUKS2 volume on top of btrfs and mounts it inside the container at `/data` — that's where your app reads and writes. Pick a size in bytes; for example:

```bash
enclavia enclave create --storage-size-bytes 1073741824   # 1 GiB
enclavia enclave create --storage-size-bytes 134217728    # 128 MiB (minimum)
```

The volume is encrypted at rest. The LUKS passphrase lives in AWS KMS and is only released to the enclave after its attestation document matches the image's PCRs — so a stolen backing file is useless without the running, attested enclave. See [Push](/push) for why image tags are immutable.

#### Why Enclavia can't change the policy after the fact

A reasonable follow-up: "Enclavia controls the AWS account that owns the KMS key — couldn't an admin (rogue or coerced) just edit the key policy to grant `kms:Decrypt` to themselves, retrieve the passphrase, and decrypt the volume outside the enclave?"

The answer is no, and the mechanism is a quirk of how KMS key policies work that's worth spelling out:

1. **KMS key policies do not implicitly grant root access.** Unlike most AWS resource policies, the AWS account root principal only has the permissions a KMS key policy *explicitly* gives it. If a key policy doesn't list root, root cannot administer the key — full stop. ([Default key policy - AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-default.html))
2. **The key policy is created locked.** When the backend provisions the KMS key for a new enclave, it calls `CreateKey` with `BypassPolicyLockoutSafetyCheck=true` and a policy that grants `kms:Decrypt` *only* to principals presenting a Nitro attestation document with the image's PCRs, and grants `kms:PutKeyPolicy` / `kms:DeleteKey` to *no one*. The bypass flag is required because KMS normally rejects policies that would lock the key out of further management; we want exactly that lockout. ([PutKeyPolicy - AWS KMS](https://docs.aws.amazon.com/kms/latest/APIReference/API_PutKeyPolicy.html))
3. **The policy is now immutable.** No principal — including Enclavia's AWS root, Enclavia engineers, AWS support, or anyone with `AdministratorAccess` in the account — can call `PutKeyPolicy` on this key, because the policy itself doesn't grant that permission to anyone. The key will continue to release the passphrase only to enclaves whose PCRs match, until it's eventually rotated as part of the upgrade flow.

The trust boundary that protects your data is the policy that AWS KMS enforces on the key, not Enclavia's operational discipline. We deliberately set things up so that even we cannot grant ourselves access.

Lifecycle: `enclave stop` keeps the encrypted volume around so the next start can re-mount it. `enclave destroy` removes the record and the volume.

## Timeout

The backend keeps the enclave in `waiting_for_image` for up to **30 minutes** after `create`. If no push lands in that window the enclave moves to `error` with a `no fresh push detected within 30 minutes` message; you'll need to `create` a new one and push to it.

## Lifecycle commands

```bash
enclavia enclave list                  # all your enclaves
enclavia enclave status <id>           # detail: status, instance type, image, vsock CID, PCRs
enclavia enclave logs <id>             # build log + (debug enclaves) runtime log
enclavia enclave stop <id>             # stop a running enclave (terminates the instance, keeps storage)
enclavia enclave start <id>            # boot a stopped enclave, re-mounting any provisioned storage
enclavia enclave restart <id>          # server-side stop + start; applies pending secret changes
enclavia enclave destroy <id>          # delete the enclave record (and any provisioned storage)
```

Every command that takes an enclave id (the lifecycle commands above, plus `push`, `reproduce`, and the `secret` and `upgrade` subcommands) accepts any unique prefix of it, resolved against your enclave list. If a prefix matches more than one enclave the command fails and lists the candidates.

`status` shows populated PCRs (`pcr0`, `pcr1`, `pcr2` as hex) once the build completes. Those are the values you'll pin in the client when [connecting](/connect).

`logs` prints two sections: the **build log** (the EIF build output, available once the build has started) and the **runtime log** (the guest serial console, captured only for debug/QEMU enclaves; production Nitro enclaves have no runtime log by design). With `--json` it emits the raw `{"build_log": ..., "runtime_log": ...}` object for piping. It's the first place to look when `status` shows `error` during a build or boot.

## Status meanings

| Status | Meaning |
|--------|---------|
| `waiting_for_image` | Created and waiting for the first `enclavia push` to the enclave's registry repo. |
| `building` | The backend is producing the enclave image (EIF) from your Docker image. |
| `running` | The enclave is up. The proxy URL is `wss://<id>.enclaves.beta.enclavia.io`. |
| `stopped` | The instance is no longer running. The record (and storage if any) is preserved. |
| `error` | Something failed; `error_message` in `enclave status` has details, and `enclave logs` has the full build log. |

## Connect

Once the enclave is `running`, hand its ID and PCRs to the client library — see [Connect](/connect).
