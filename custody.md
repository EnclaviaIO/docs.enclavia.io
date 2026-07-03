# Control-key custody: managed vs self-hosted

Every [upgradable enclave](/upgrades) has an ECDSA P-256 control keypair. The public half is baked into every EIF built for the enclave, so the running version can verify that any upgrade or revocation command came from an authorized source. Custody is about who holds the private half, and therefore who can authorize those commands.

There are two modes, chosen once at create time and immutable for the enclave's lifetime (the public key is measured into the EIF's PCRs, so it cannot change without rebuilding the enclave's identity).

## The two modes

**Managed (default).** The backend generates the keypair and keeps the private scalar encrypted at rest (AES-256-GCM, under the same master key as [per-enclave secrets](/secrets)). When you confirm or revoke an upgrade, the backend decrypts the scalar and signs the command itself. You approve upgrades with one click from the web dashboard. This is the zero-setup path: nothing to install, no hardware, no key to lose.

**Self-hosted (YubiKey).** You generate the key on a YubiKey (PIV slot, on-device, non-extractable). The backend only ever stores the public key. It has no way to sign anything, so upgrades and revocations can only be authorized by a signature produced on your hardware, from a machine you control. The dashboard shows copyable CLI commands instead of action buttons, because the backend cannot perform the action for you.

### The trust tradeoff, plainly

- With **managed** keys you trust Enclavia not to push a malicious upgrade. The backend can technically sign an upgrade command on its own. The [upgrade chain](/upgrades#the-upgrade-chain) still records every transition as a public, hardware-attested, append-only log, so a silent swap is detectable after the fact, but the key material to authorize it lives on our servers.
- With **self-hosted** keys Enclavia cannot upgrade or revoke without your signature. The tradeoff is that responsibility for the key is entirely yours: if you lose the YubiKey, the enclave is frozen on its current version forever (see [Losing the key](#losing-the-key)).

### Comparison

| | Managed (default) | Self-hosted (YubiKey) |
|---|---|---|
| Who holds the private key | Enclavia backend (encrypted at rest) | You, on a YubiKey (non-extractable) |
| Who can authorize an upgrade or revocation | Enclavia, on your approval | Only a signature from your hardware |
| How you approve | One click in the web dashboard | `enclavia upgrade confirm/revoke` from the CLI (PIN + touch) |
| Dashboard surface | Confirm / revoke buttons | Copyable CLI commands |
| Recovery if the key material is lost | Backend still holds it; nothing to recover | Re-import from the device, or if the device is gone the enclave is frozen |
| You must trust | Enclavia not to push a malicious upgrade | Only your own key custody |

The split is invisible to the enclave: same public-key slot, same signatures, same verification. Only the location of the private key differs.

## Generating a control key on a YubiKey

The key is generated on-device and never leaves the hardware. You need a YubiKey 5 (PIV, ECDSA P-256).

```bash
enclavia key generate --yubikey --name deploy-key
```

Full flag set:

```bash
enclavia key generate --yubikey \
  [--name <name>] \
  [--slot 9c] \
  [--touch-policy always|cached|never] \
  [--pin-policy once|always|never] \
  [--serial <n>] \
  [--yes]
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--yubikey` | (required) | Generate on a YubiKey. Currently the only self-hosted backend. |
| `--name <name>` | `default` | Name the key is recorded under in the local index; this is what you pass to `enclave create --control-key`. |
| `--slot <slot>` | `9c` | PIV slot to generate into (`9a`, `9c`, `9d`, `9e`). `9c` is the Digital Signature slot. |
| `--touch-policy <policy>` | `always` | Require a physical touch on every signature (`always`), cache it for 15 seconds (`cached`), or never (`never`). |
| `--pin-policy <policy>` | `once` | Require the PIN once per session (`once`), before every signature (`always`), or never (`never`). |
| `--serial <n>` | unset | Disambiguate when several YubiKeys are connected. |
| `--yes` | off | Skip the slot-replacement confirmation prompt (for non-interactive use). |

::: warning Generation replaces any key already in the slot
PIV key generation into an occupied slot silently overwrites whatever key was there. Before touching the hardware, the CLI prints what it is about to do and waits for you to press Enter (Ctrl-C aborts). If slot `9c` already holds a control key you rely on, generating into it destroys that key. Pass `--yes` only when you are certain the slot is free or expendable.
:::

The private key is generated on-device and cannot be extracted. Only the public key is recorded, in a local index at `~/.config/enclavia/keys/index.json`. That file holds public metadata only (name, backend type, device serial, slot, public key, and its fingerprint); it never contains private key material, so it is not itself a secret.

List what you have:

```bash
enclavia key list
```

Each row shows the name, backend, device, and the public-key fingerprint.

## Creating a self-hosted enclave

Register the named local key as the enclave's control key at create time:

```bash
enclavia enclave create --image myapp:v1 --upgradable --control-key deploy-key
```

`--control-key <name>` implies `--upgradable` (a control key only makes sense on an upgradable enclave), so you can omit `--upgradable` if you like. The CLI resolves the key locally before creating anything, so a typo in the key name fails fast rather than creating a managed enclave by accident. The backend stores only the public key and marks the enclave as self-hosted custody; this is immutable for the enclave's lifetime.

A plain `--upgradable` with no `--control-key` stays in managed custody.

## Upgrading a self-hosted enclave

The staging flow is identical to a [managed upgrade](/upgrades): push a new tag, which stages the upgrade, then confirm it.

```bash
# Stage the new version.
enclavia push myapp:v2 1d2c3b4a

# Confirm it (same flags as managed).
enclavia upgrade confirm 1d2c3b4a a3b4c5d6                        # default: swap in 7 days
enclavia upgrade confirm 1d2c3b4a a3b4c5d6 --at 2026-07-08T12:00:00Z
enclavia upgrade confirm 1d2c3b4a a3b4c5d6 --immediate
```

The `--at` / `--immediate` scheduling flags behave exactly as in managed mode. What differs is what happens under the hood: because the backend has no private key, `confirm` runs a two-phase flow.

1. **Prepare.** The CLI asks the backend for the exact bytes to sign: the upgrade payload plus a live nonce fetched from the running enclave over its attested control channel. (The nonce rotates only when the enclave actually processes a control command, so it stays valid across an offline signing round-trip, which is plenty of time for a YubiKey touch.)
2. **Sign.** The CLI signs twice on the YubiKey: once over the payload (the inner signature) and once over the assembled control command (the envelope signature). Expect two touch prompts and one PIN prompt.
3. **Submit.** The CLI sends the signed command back. The backend dispatches it to the running enclave, which verifies both signatures against its baked-in public key and, on success, records the `upgrade` chain link exactly as in managed mode.

If the enclave's nonce changed between prepare and submit (a concurrent control command landed in between), the submit returns a `409` and the CLI transparently re-prepares and retries once.

Revocation has the same shape:

```bash
enclavia upgrade revoke 1d2c3b4a a3b4c5d6
```

Same two-phase prepare, sign-twice, submit flow, with the same single retry on a nonce conflict.

From the web dashboard, a self-hosted enclave's upgrade panel shows these commands as copyable text rather than confirm and revoke buttons, since only you can produce the signature.

## Key recovery

### Rebuilding a lost index

The local index at `~/.config/enclavia/keys/index.json` holds only public metadata, so losing it (a wiped laptop, a new machine) does not lose the key: the private key still lives on the YubiKey. Rebuild the index entry by reading the public key back off the device:

```bash
enclavia key import --yubikey --name deploy-key [--slot 9c] [--serial <n>]
```

This reads the public key via PIV GET METADATA (YubiKey firmware 5.2.3 or newer). Nothing is written to the device and no PIN is prompted; it only reads the public half back and records it exactly as `generate` would have. The recovered entry is byte-identical to the original, so the enclave still recognizes it.

### Losing the key

::: danger If the YubiKey is lost, the enclave is frozen forever
Self-hosted custody means Enclavia never holds your control key. If the YubiKey itself is lost, destroyed, or the on-device key is regenerated (which overwrites the old private key), then **enclaves bound to that key can never be upgraded or revoked again**. Enclavia cannot help you: there is no backend copy, no reset, no escape hatch. That is the entire point of self-hosted custody.

The enclave keeps running its current version indefinitely. What you lose is the ability to change versions: you cannot confirm a staged upgrade and you cannot revoke one. To move to a new version you would have to create a fresh enclave (with a new identity and new PCRs) and migrate to it.

For v1 there is no support for multiple registered keys or backup keys per enclave. If frozen-on-loss is a risk you cannot accept, use managed custody instead.
:::
