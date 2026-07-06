# Staged deployments and the upgrade chain

Enclavia treats every version transition as a deliberate, auditable event. The first deploy (the **genesis**) launches immediately. Every subsequent push to an upgradable enclave is staged: the new image is built but not launched. An explicit confirm step is required to schedule the swap, and the running enclave keeps serving until the scheduled time arrives.

## Upgradable vs non-upgradable enclaves

At create time you choose whether an enclave can ever be upgraded in place:

```bash
# Upgradable: future pushes are staged, not auto-deployed.
enclavia enclave create --upgradable

# Non-upgradable (default): every push after the first is rejected.
enclavia enclave create
```

The choice is permanent for the enclave's lifetime. Existing enclaves created before this feature shipped are non-upgradable.

**Upgradable enclaves** get an ECDSA P-256 control keypair. The public key is baked into every EIF built for the enclave, so the running version can verify that any upgrade or revocation command came from an authorized source. Who holds the private key depends on the enclave's custody mode:

- **Managed (default):** the private key stays in the backend, encrypted at rest. The backend signs confirm and revoke commands itself, and you approve them from the web dashboard.
- **Self-hosted:** you hold the private key on a YubiKey, the backend stores only the public half, and confirm and revoke are authorized by a signature from your hardware via the CLI.

The rest of this page describes the managed flow. For the self-hosted flow (including how to generate a key, create a self-hosted enclave, and the two-phase CLI confirm), see [Control-key custody](/custody).

**Non-upgradable enclaves** have no control keypair and no signed-upgrade path. Pushing a second time to a non-upgradable enclave produces an error:

```
Error: this enclave is non-upgradable, create a new one
```

## Genesis: the first push

The first push to any enclave triggers an immediate build and launch, regardless of whether the enclave is upgradable.

```bash
enclavia enclave create --upgradable --name my-service
# Enclave created:
#   ID:     1d2c3b4a-5e6f-7a8b-9c0d-1e2f3a4b5c6d
#   Status: waiting_for_image

enclavia push myapp:v1 1d2c3b4a
# Tagging myapp:v1 -> registry.beta.enclavia.io/alice/1d2c3b4a-...:latest
# Pushing registry.beta.enclavia.io/alice/1d2c3b4a-...:latest
# ...
# Notified backend; 1 build now starting:
#   enclavia enclave status 1d2c3b4a
```

Once the enclave boots it records a **boot attestation** as the first entry in its upgrade chain.

## Staging a new version

Pushing again to a running upgradable enclave stages the new image instead of deploying it:

```bash
enclavia push myapp:v2 1d2c3b4a
# Tagging myapp:v2 -> registry.beta.enclavia.io/alice/1d2c3b4a-...:latest
# Pushing registry.beta.enclavia.io/alice/1d2c3b4a-...:latest
# ...
# Staged upgrade a3b4c5d6-... for enclave 1d2c3b4a-...
# Confirm with: enclavia upgrade confirm 1d2c3b4a a3b4c5d6
```

The running enclave is unaffected. The new EIF is built in the background; once the build finishes the staged upgrade moves from `building` to `staged`.

To see all staged upgrades for an enclave:

```bash
enclavia upgrade list 1d2c3b4a
```

Output:

```
UPGRADE ID                             STATUS       IMAGE                                        DIGEST           VALID FROM                 CREATED
----------------------------------------------------------------------------------------------------------------------------------------------------------------
a3b4c5d6-...                           staged       1d2c3b4a-...:latest                          sha256:9c1f4b   -                          2026-07-01 10:00 UTC
```

## Confirming an upgrade

Confirming schedules the swap and kicks off the attestation handshake with the running enclave. The running version keeps serving until `valid_from`.

```bash
# Default: swap in 7 days.
enclavia upgrade confirm 1d2c3b4a a3b4c5d6

# Pick a specific time (RFC 3339).
enclavia upgrade confirm 1d2c3b4a a3b4c5d6 --at 2026-07-08T12:00:00Z

# Take effect immediately.
enclavia upgrade confirm 1d2c3b4a a3b4c5d6 --immediate
```

If the enclave was created with a [minimum upgrade delay](#minimum-upgrade-delay), `--immediate` (and any `--at` earlier than now plus the delay) is rejected: first by the backend with a clear error, and authoritatively by the running enclave itself.

Successful output:

```
Upgrade a3b4c5d6-... confirmed.
  Status:     confirmed
  Valid from: 2026-07-08 12:00:00 UTC
  The enclave will swap to the new version automatically at that time.
```

What happens at confirm time (managed custody):

1. The backend constructs an upgrade-auth payload (`from_pcrs`, `to_pcrs`, `image_digest`, `valid_from`) and signs it with the enclave's control private key.
2. The signed command is dispatched to the running enclave over the Noise channel. The enclave verifies the signature against its baked-in control public key.
3. The running enclave emits an **upgrade attestation** (a Nitro-signed document) and the backend appends an `upgrade` entry to the chain.
4. At `valid_from` the launcher tears down the old version and boots the new EIF. On its first heartbeat the new enclave produces a **boot attestation**, recorded as a `boot` entry in the chain.

A successful upgrade therefore produces two chain entries: the old enclave's `upgrade` link at confirm time, and the new enclave's `boot` link at cutover.

On a **self-hosted** enclave the same `enclavia upgrade confirm` command runs a two-phase flow instead: the CLI fetches the exact payload plus a live nonce from the backend, signs it on your YubiKey (expect a PIN prompt and two touches), and submits the signed command. Everything downstream (dispatch, verification, chain link, cutover) is identical. See [Control-key custody](/custody#upgrading-a-self-hosted-enclave).

## Minimum upgrade delay

By default the activation delay is the operator's choice: confirm defaults to now plus 7 days, but `--immediate` can activate an upgrade within seconds. If your users need a *guaranteed* window to audit a pending upgrade before it activates, create the enclave with a minimum upgrade delay:

```bash
enclavia enclave create --upgradable --min-upgrade-delay 48h
```

The value (`30m`, `48h`, `7d`, or a bare number of seconds; maximum 90 days) is baked into every image built for the enclave, so it is covered by the enclave's PCR measurements and cannot be changed after create, not even by pushing a new version: upgrade builds carry the same value, so an upgrade can never shed the floor.

Enforcement is done by the running enclave itself, not by backend policy. At confirm time the enclave checks the signed upgrade command's `valid_from` against its own clock and refuses anything earlier than now plus the configured delay. That makes the revocation window a verifiable property of the enclave's identity: anyone who reproduces the image or checks the PCRs knows that the code inside cannot be swapped faster than the declared delay, even by the legitimate control-key holder. A compromised control key cannot fast-track a malicious image past watching verifiers.

Practical consequences:

- `enclavia upgrade confirm --immediate` fails on these enclaves, and `--at` must be at least the delay in the future. The web dashboard disables the immediate option and floors the schedule picker.
- With no explicit time, confirm schedules at now plus 7 days or now plus the delay, whichever is later.
- **Revoke is unaffected.** The window exists precisely so that revocation and third-party auditing have guaranteed time before a confirmed upgrade activates.
- The chain records `valid_from` and `issued_at` on every `upgrade` link, so verifiers can also check historically that the policy was respected.

One trust caveat, stated plainly: the enclave checks `valid_from` against its own clock, and the guest clock is influenced by the host. A host that warps the clock forward can shrink the effective delay. The delay is therefore a strong guarantee against a compromised or coerced key holder, and a weaker one against a malicious hosting substrate (which the attestation model already treats as the adversary for confidentiality, not availability).

## Revoking an upgrade

Between confirm and `valid_from` you can cancel the scheduled swap:

```bash
enclavia upgrade revoke 1d2c3b4a a3b4c5d6
```

Output:

```
Upgrade a3b4c5d6-... revoked.
  Status:     revoked
  The upgrade has been cancelled; the enclave keeps running the current version.
```

On a managed enclave the backend signs a revocation command and dispatches it to the running enclave. The enclave acknowledges and emits a **revocation attestation**, recorded as a `revocation` entry in the chain. The scheduled cutover is cancelled and the running version continues uninterrupted.

On a self-hosted enclave, `enclavia upgrade revoke` signs the revocation on your YubiKey through the same two-phase flow as confirm. See [Control-key custody](/custody).

## Storage-enabled enclaves

For enclaves with a persistent encrypted volume (created with `--storage-size-bytes`), the LUKS volume is re-keyed to the new version automatically as part of confirm. The new enclave opens the volume on its first boot using its own KMS key, and the data is available exactly as it was in the previous version. No user action is needed; the re-keying happens on the running enclave at confirm time and is covered by the `upgrade` chain attestation.

## The upgrade chain

Every transition is recorded as a public, append-only, hardware-attested chain. You can inspect it at any time:

```bash
enclavia upgrade chain 1d2c3b4a
```

Example output after a full upgrade cycle:

```
Chain for enclave 1d2c3b4a-... (3 links)

  #1   boot       2026-07-01 10:05:23 UTC  [verified]
      image:       sha256:9c1f4b2d...
      booted_at:   2026-07-01 10:05:23 UTC
      PCR0:        4f8c2a1b...
      PCR1:        7e3d9c0a...
      PCR2:        6b5a4938...
      attestation: 1204 bytes

  #2   upgrade    2026-07-01 14:22:07 UTC  [verified]
      target:      sha256:b3e7a19c...
      valid_from:  2026-07-08 12:00:00 UTC
      issued_at:   2026-07-01 14:22:07 UTC
      to.PCR0:     8a3e5d92...
      to.PCR1:     1c7b4f03...
      to.PCR2:     3d9e2a71...
      attestation: 1204 bytes

  #3   boot       2026-07-08 12:00:45 UTC  [verified]
      image:       sha256:b3e7a19c...
      booted_at:   2026-07-08 12:00:45 UTC
      PCR0:        8a3e5d92...
      PCR1:        1c7b4f03...
      PCR2:        3d9e2a71...
      attestation: 1204 bytes

Chain is valid. 3 links, all verified locally.
```

After a revocation the chain looks like:

```
  #1   boot       ...  [verified]
  #2   upgrade    ...  [verified]
  #3   revocation 2026-07-04 08:11:02 UTC  [verified]
      revokes:     a3b4c5d6-...
      issued_at:   2026-07-04 08:11:02 UTC
      attestation: 1204 bytes
```

The CLI re-validates each link locally when you run `upgrade chain`. The `[verified]` badge reflects the client's own check, not a server claim.

## Staged upgrade statuses

| Status | Meaning |
|--------|---------|
| `building` | The new EIF is being built. PCRs and image digest are not yet available. |
| `staged` | Build complete; awaiting operator confirmation. The running enclave has not been notified. |
| `confirmed` | `valid_from` is set; the backend has dispatched the signed upgrade command to the running enclave and recorded the `upgrade` chain link. The swap fires automatically at `valid_from`. |
| `promoted` | The new enclave has started successfully. The upgrade is complete. |
| `revoked` | The upgrade was cancelled before `valid_from`. The running enclave's LUKS state is rolled back (if applicable) and a `revocation` chain link is recorded. |
| `failed` | The build or chain-link submission failed. Check `upgrade list` for an error message. |
| `expired` | Staged but never confirmed within the retention window; garbage-collected. |

## How the chain is verified

Each chain link is a Nitro attestation document whose `user_data` field is `sha256(payload)`. To verify a link independently:

1. Verify the attestation's signature against Amazon's NSM root certificate.
2. Compute `sha256(payload)` and compare it to `attestation.user_data`.
3. For each `upgrade` link, confirm that `payload.from_pcrs` matches the previous active `boot`'s PCRs.
4. For each `boot` following an `upgrade`, confirm the `boot`'s PCRs match the `upgrade`'s `to_pcrs`.
5. A `revocation` cancels its referenced `upgrade`; that upgrade entry does not count as a forward step when computing the chain head.

No control-key signature appears in the chain itself. The hardware attestation is the only chain-level cryptographic primitive.

The `upgrade chain` command performs all of these checks locally and labels each link `[verified]` or `[REJECTED]`. For a detailed walkthrough of the attestation verification model, see [Reproduce a build](/reproduce).
