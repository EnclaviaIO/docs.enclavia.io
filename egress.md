# Outbound network access (egress allowlist)

By default a running enclave has **no outbound network**. Nothing the workload writes leaves the VM, and no library will see "connection succeeded" against any external host. This is intentional: an enclave's value comes from being able to *prove* what it does with your data, and unconstrained egress would let a workload silently exfiltrate.

You opt in to outbound traffic by declaring an **allowlist** at create time. The allowlist is a list of destinations (hostnames, IPv4 literals, or IPv4 CIDRs, each scoped to a port and protocol). It is baked into the enclave image at build time and **covered by the PCRs**: an auditor running `enclavia reproduce` sees the exact set of destinations the workload can reach, and any change to that set changes the enclave's identity.

## How it works (one screen)

```
workload ──┐
           │ writes packets to /dev/net/tun (the workload's default route)
           ▼
        tun0  (inside the enclave)
           │ userspace TCP/IP stack (smoltcp) terminates the connection
           ▼
      egress filter  (deny-all by default; allow only what the policy permits)
           │ permitted flows are forwarded as length-prefixed CBOR frames
           ▼
      vsock to host  (port 5006)
           │
           ▼
      egress-host  (host-side relay; dials the upstream IP and splices bytes)
```

The workload itself doesn't need to know any of this. It opens a TCP socket like it normally would; the daemon decides whether to let the connection complete. Hostname entries are resolved by a validating `unbound` running inside the enclave on `127.0.0.1:53` (DNSSEC, allowlist-aware); the workload's `/etc/resolv.conf` is auto-written to point at it.

## Trust model

The trust boundary for egress is the **in-enclave filter**, not the host. The host-side relay (`egress-host`) trusts the enclave: the enclave decides which destinations to dial, and the host obeys. That's safe because the filter, the resolver, and `/etc/enclavia/egress.json` all live in the EIF rootfs, which is hashed into PCR2. If anyone tampers with the policy between build and boot, the PCRs change and clients pinning the original PCRs refuse to connect.

The practical consequence: **what the auditor sees in `enclavia reproduce` is what the enclave can reach.** No out-of-band policy, no separate firewall to audit.

## The CLI

`enclavia enclave create` takes three flags. Use the per-entry flags for ad-hoc allowlists, the file form for anything non-trivial.

### Per-entry flags

```bash
enclavia enclave create \
  --egress-allow api.openai.com:443 \
  --egress-resolver 1.1.1.1
```

(The build kicks off only when you `enclavia push` your image to the enclave; see [Create](/create) for the full create-then-push flow.)

| Flag | Form | Notes |
|------|------|-------|
| `--egress-allow` | `HOST:PORT`, repeatable | `HOST` is a hostname, IPv4 literal, or IPv4 CIDR. TCP only today. |
| `--egress-resolver` | `IPV4`, repeatable | DNS resolver(s) the in-enclave `unbound` forwards to. Required if any `--egress-allow` is a hostname. |
| `--egress-config` | `PATH` | JSON file matching the [schema below](#json-schema). Mutually exclusive with the two flags above. |

Three worked examples:

```bash
# Hostname target. Needs a resolver because the daemon has to learn
# api.openai.com's A records at connect time.
enclavia enclave create \
  --egress-allow api.openai.com:443 \
  --egress-resolver 1.1.1.1

# CIDR target. No resolver needed (the daemon is matching IP literals).
enclavia enclave create \
  --egress-allow 10.0.0.0/8:443
```

Omit all three flags and the enclave is back to its pre-egress behaviour: no outbound network. This is the default, and it matches the behaviour of any enclave created before this feature shipped.

### JSON schema

For non-trivial allowlists, drop a JSON file alongside your project and pass it with `--egress-config`. The canonical schema:

```json
{
  "version": 1,
  "resolvers": ["1.1.1.1", "8.8.8.8"],
  "egress": [
    { "host": "api.openai.com", "port": 443, "protocol": "tcp" },
    { "host": "10.0.0.0/8",     "port": 443, "protocol": "tcp" }
  ]
}
```

Validation rules (enforced identically by the CLI, the backend, and the in-enclave daemon, all calling into the same `enclavia-egress` parser):

| Field | Rule |
|-------|------|
| `version` | Must be `1`. Future schemas bump this and the CLI/backend negotiate. |
| `resolvers[]` | IPv4 literals. Required if any `egress[].host` is a hostname; can be empty if you only allowlist IPs/CIDRs. |
| `egress[].host` | RFC 1035 hostname, an IPv4 literal, or an IPv4 CIDR (`a.b.c.d/n`). |
| `egress[].port` | `1..65535`. |
| `egress[].protocol` | `"tcp"`. The only supported protocol today; the schema reserves room for `"udp"` in the type but actively rejects it at validation. |
| IPv6 | Rejected at every layer; there's no v6 path through the daemon. |

```bash
enclavia enclave create --egress-config ./egress.json
```

The CLI rejects mixing `--egress-config` with `--egress-allow` / `--egress-resolver` so there's no ambiguity about which document gets baked into the EIF.

## The API

The same shape is exposed on the REST API. `POST /enclaves` accepts an optional `egress_allowlist` body field whose JSON matches the schema above:

```jsonc
POST /enclaves
{
  "instance_type": "small",
  "container_port": 8080,
  "egress_allowlist": {
    "version": 1,
    "resolvers": ["1.1.1.1"],
    "egress": [
      { "host": "api.openai.com", "port": 443, "protocol": "tcp" }
    ]
  }
}
```

Validation runs server-side before the build kicks off; an invalid document fails the request with a pointed error rather than failing the EIF build later. The persisted value is returned as-is on every `GET /enclaves/{id}`, which is what powers `enclavia reproduce`.

The MCP `enclave_create` tool takes the same `egress_allowlist` field. The MCP server doesn't have access to your filesystem, so there's no path-based variant; pass the document inline. See [Connect an AI agent (MCP)](/mcp).

## The dashboard

On `beta.enclavia.io`, the **Create enclave** form has an *Egress allowlist* section. Empty form means deny-all (the default). Filled in, it accepts the same per-entry grammar as the CLI (`host:port[/proto]` lines) plus a list of resolver IPs. The frontend does a syntactic pre-flight check; the backend's validator remains the authoritative gate.

## `enclavia reproduce` and PCR pinning

The allowlist lives at `/etc/enclavia/egress.json` inside the enclave's rootfs, so it's hashed into PCR2. Two consequences:

1. **The auditor sees the policy.** `enclavia reproduce <enclave-id>` rebuilds the EIF locally from the same image and the same allowlist the backend recorded, and confirms the local PCRs match. See [Reproduce a build](/reproduce).
2. **Changing the policy changes the identity.** If you re-create an enclave with a different allowlist, the new enclave has different PCRs. Clients that pinned the old PCRs will refuse to connect, which is the right behaviour: from their perspective, this is a different deployment.

This is the auditor's verification surface. If you want to claim "this enclave only talks to `api.openai.com:443`," you don't ask anyone to trust you: they reproduce the build and read the file.

## Recipes

### Only `api.openai.com`

```bash
enclavia enclave create \
  --egress-allow api.openai.com:443 \
  --egress-resolver 1.1.1.1
```

### A customer VPN CIDR

```bash
enclavia enclave create \
  --egress-allow 10.99.0.0/16:443
```

No resolver needed; CIDR matches happen on IP literals.

### A larger policy as a file

```bash
cat > egress.json <<'EOF'
{
  "version": 1,
  "resolvers": ["1.1.1.1", "8.8.8.8"],
  "egress": [
    { "host": "api.openai.com",     "port": 443, "protocol": "tcp" },
    { "host": "api.anthropic.com",  "port": 443, "protocol": "tcp" },
    { "host": "10.0.0.0/8",         "port": 443, "protocol": "tcp" }
  ]
}
EOF

enclavia enclave create --egress-config ./egress.json
```

### Try it locally

A worked, end-to-end sample exercising the full egress path (a tiny Python service that does an outbound HTTPS request through the allowlist and reports the result) lands alongside the public beta in a separate `enclavia-samples` repository. Until then, the recipes above are the minimum you need to wire up egress against your own image.

## Limitations

- **TCP only.** The schema reserves `"udp"` as a value but validation actively rejects it; declaring a UDP entry today fails at create time with a clear error. UDP support is tracked separately and will land without a schema change. Workloads that need DNS should rely on the in-enclave `unbound` for resolution and stick to TCP for everything else.
- **IPv6 is always denied.** Every layer rejects v6: schema, validator, daemon. If your upstream is v6-only, it's currently out of reach.
- **Hostnames trust the configured resolvers.** Hostname matching dereferences names through your declared `resolvers` (validated by DNSSEC inside `unbound`). A hostile resolver that returns valid DNSSEC for a domain it controls can steer the workload at IPs it shouldn't reach. Stick to resolvers you trust, or use IP/CIDR entries when you need stronger guarantees.
