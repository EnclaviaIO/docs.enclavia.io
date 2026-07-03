# Per-enclave secrets

Enclavia lets you attach small, named environment-variable secrets to an enclave. The backend stores them encrypted at rest, the values never appear in any API response, and they only ever leave the backend over an authenticated single-shot vsock channel into the enclave at boot. Inside the enclave they land in the workload's `process.env` before the container's entrypoint runs. Plaintext is never written to disk inside the EIF and never logged.

## Why use them

Anything sensitive your workload needs (database URLs, API keys, signing keys, OAuth client secrets) is a problem if you bake it into the Docker image. The image is publishable: anyone who can pull it from the registry can extract baked-in values. Even non-sensitive per-deployment configuration (staging vs production endpoints, per-customer keys) is awkward to hardcode, because every change becomes a new image build with a new content hash.

Secrets are injected at boot through the in-enclave init path, never written into the image, and never measured into PCRs. That gives you two things:

1. **Sensitive material stays out of the registry.** API keys, signing keys, database URLs are never visible to anyone who can pull the image, because they aren't there.
2. **You can reconfigure without rebuilding.** Rotating, adding, or removing a secret is an enclave restart. The EIF is unchanged, so the PCRs are unchanged, so any client pinned to this enclave's PCRs keeps working through the rotation. (PCRs are always per-enclave, by design: the enclave's UUID is stamped into the rootfs at build time, so even two enclaves built from the same image have different PCR2 values. See [Connect from a client](/connect#get-the-pcrs-you-need-to-pin).)

## Trade-offs

- **Changes take effect on the next start.** A `set`, rotate, or delete is recorded in the backend immediately, but the running enclave keeps seeing the previous values until you restart it (or it stops and starts again on its own).
- **No per-secret access policy.** Anyone who owns the enclave can rotate or delete any of its secrets. There are no per-secret IAM grants, no audit log of reads (there are no reads).
- **Names, not files.** Each secret becomes one environment variable. There is no filesystem-mounted secret store; if your workload needs a file, write the env var out yourself inside the container entrypoint.

## CLI usage

Three subcommands: `set`, `list`, `delete`. All three take an enclave id (full UUID or any unique prefix that resolves to one of your enclaves).

### Set

The simplest form takes one or more `NAME=value` pairs:

```bash
enclavia secret set 1d2c3b4a DATABASE_URL=postgres://... STRIPE_KEY=sk_test_abc
```

Each name is validated client-side and re-validated by the backend before insertion. A name that fails validation aborts the whole call before any request goes out.

For values you do not want to appear in shell history, pass them via stdin or a file. Both forms require `--name` and only set a single secret per call:

```bash
# From stdin (no trailing newline is stored; pipe-friendly).
echo -n 'sk_live_...' | enclavia secret set 1d2c3b4a --from-stdin --name STRIPE_KEY

# From a file (read verbatim, must be valid UTF-8).
enclavia secret set 1d2c3b4a --from-file ./stripe.key --name STRIPE_KEY
```

The stdin and file forms both treat the value as a UTF-8 string. A binary blob piped into `--from-stdin` will be rejected with a UTF-8 decode error rather than silently corrupted. If you need to store binary data, base64 it on your side first.

After a successful `set` against a running enclave the CLI reminds you that the new values are pending:

```
2 changes pending. Run `enclavia enclave restart 1d2c3b4a` to apply.
```

If the enclave is `stopped`, the message instead notes that the new values will land on the next start.

### List

```bash
enclavia secret list 1d2c3b4a
```

Output:

```
NAME                             LAST UPDATED                     PENDING
--------------------------------------------------------------------------------
DATABASE_URL                     2026-06-04T10:22:11Z             no
STRIPE_KEY                       2026-06-04T12:05:48Z             yes
```

`PENDING: yes` means the secret was written or rotated after the most recent successful enclave start, so the running workload is still seeing the previous value (or no value at all, if the secret is brand new). For an enclave that has never started, every secret is reported as pending.

Values are never returned by the backend, so they are never printed by `list`. You can rotate or delete a secret you can no longer read, but you cannot read it back.

### Delete

```bash
enclavia secret delete 1d2c3b4a STRIPE_KEY
```

Multiple names can be passed in one call. Each name prompts for confirmation unless you pass `--yes`:

```bash
enclavia secret delete 1d2c3b4a --yes STRIPE_KEY DATABASE_URL
```

A delete is treated like any other change: it lands on the next enclave start. The running workload keeps the old environment variable until then.

### Restart to apply

```bash
enclavia enclave restart 1d2c3b4a
```

Server-side stop + start. The next boot reads a fresh snapshot of the secrets table.

## Dashboard usage

On `beta.enclavia.io` the enclave detail page has a Secrets panel that mirrors the CLI surface: list, add, rotate, delete, with a per-row "pending" pill on any secret that has been written or rotated since the last successful start. Adding or rotating a secret takes a name and a value (with a show/hide toggle); the value is sent straight to the backend and is not returned on subsequent loads, so the same row offers rotate and delete but no read-back.

When at least one row is pending on a running enclave, a banner appears at the top of the panel with a "Restart now" button that performs the same server-side stop + start the CLI's `enclavia enclave restart` does. The panel also enforces the per-enclave cap by hiding the "add secret" button once you hit 32 rows.

## Naming rules

Names must match the regex:

```
^[A-Z_][A-Z0-9_]*$
```

Concretely: uppercase ASCII letters, digits, and underscores; the first character is a letter or underscore (not a digit); the whole name is at most **64 characters**.

A small set of names is rejected because the runtime sets them inside the OCI bundle and a user-supplied value would be shadowed:

```
PATH, HOME, HOSTNAME, PWD, OLDPWD, TERM, SHLVL, _
```

Names starting with two underscores (`__FOO`) are reserved for future internal use and also rejected.

## Limits

| Limit | Value |
|-------|-------|
| Secrets per enclave | 32 |
| Bytes per value | 4 KiB |
| Total bytes per enclave (sum of stored ciphertexts) | 16 KiB |
| Name length | 64 characters |

These caps are enforced server-side. A `set` or rotate that would push you past any of them fails with a pointed error before encryption runs.

## When changes take effect

Every successful enclave start re-reads the secrets table and snapshots it into the launching enclave. That means:

- **Running enclave.** A `set`, rotate, or delete is queued (the `pending` flag flips to `yes`) and lands on the next restart. Restart with `enclavia enclave restart <id>` or the "Restart now" button in the dashboard.
- **Stopped enclave.** Changes land on the next `enclavia enclave start <id>`. No extra step.
- **Brand new enclave that has not finished its first build.** Changes you make during the `building` window land on the first boot. (A recent first-boot fix changed this; an earlier version of the platform silently discarded `secret set` calls made before the first successful start, which meant the first boot came up with an empty environment. If you hit that, the fix is in production and re-running `secret set` now persists across the auto-start.)

There is no in-band signal to the running workload that secrets are stale. If you need that, surface the `pending` flag from `secret list` in your own deployment pipeline and trigger the restart from there.

## How it works

A short note for users who want to know what they are trusting.

Each secret value is encrypted at rest in the backend with an authenticated cipher; only ciphertext is persisted, and the plaintext is dropped from memory as soon as the row is written.

At enclave start the backend:

1. Reads the current rows for that enclave, decrypts them in memory, and serializes the result as a CBOR `map<string, bytes>` keyed by secret name.
2. Hands the serialized payload to a host-side single-shot daemon that serves it on a per-enclave vsock port.
3. The in-enclave init binary (`enclavia-secrets-init`) opens that vsock port, reads the CBOR map, and writes each entry into the OCI bundle's `process.env` before the container starts.

Plaintext is never written to a file inside the EIF, never copied into an env-file on disk, and never appears in container logs. The vsock channel is single-shot: once the in-enclave init has read the payload, the host daemon exits.

Because the secrets ship at start time, they are not part of the EIF's PCRs. The enclave's identity (PCR0/1/2) is the same regardless of which secret values it was started with. If you need a value to be part of the attested identity instead of a runtime secret, bake it into your container image so it ends up under PCR2.

## Recipes

### Bulk-set from a `.env`-style file

The CLI does not parse `.env` files directly, but a one-liner gets you there:

```bash
enclavia secret set 1d2c3b4a $(grep -v '^#' .env | xargs)
```

(Names must already conform to the naming rules; the call aborts on the first invalid entry.)

### Rotate a single value without leaking it to history

```bash
read -s -p 'new value: ' NEW; echo
echo -n "$NEW" | enclavia secret set 1d2c3b4a --from-stdin --name STRIPE_KEY
unset NEW
```

### Inspect what is pending before restarting

```bash
enclavia secret list 1d2c3b4a | awk '$3 == "yes"'
enclavia enclave restart 1d2c3b4a
```
