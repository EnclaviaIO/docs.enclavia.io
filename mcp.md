# Connect Claude with the MCP server

Enclavia ships a [Model Context Protocol](https://modelcontextprotocol.io) server so you can manage your enclaves from Claude (web, Desktop, or any other MCP-aware client) using natural language. It's the same surface as the CLI — list enclaves, inspect status and logs, create, stop, destroy — exposed as MCP tools and authenticated against your Enclavia account.

The hosted endpoint for the public beta is:

```
https://mcp.beta.enclavia.io/mcp
```

## Add the connector to Claude

1. In Claude (claude.ai or Claude Desktop), open **Settings → Connectors → Add custom connector**.
2. Paste the URL above into the connector field.
3. Save. Claude will redirect you to `api.beta.enclavia.io` to authorize the connector against your Enclavia account — the same OAuth flow that backs `enclavia auth login`. Approve the consent screen and you'll be bounced back to Claude with the connector linked.
4. Enable the connector in any chat to start using the tools.

If the consent screen logs you in via GitHub or Google first, that's because your browser session at `beta.enclavia.io` had expired — sign back in, then re-trigger the connector and it will skip straight to consent.

## What Claude can do

The connector exposes one tool per CLI verb. Anything Claude calls runs against your account, scoped by the OAuth token issued during the authorization step. Tools currently available:

| Tool | Equivalent CLI |
|------|----------------|
| `enclave_list` | `enclavia enclave list` |
| `enclave_status` | `enclavia enclave status <id>` |
| `enclave_logs` | reads build + runtime logs |
| `enclave_create` | `enclavia enclave create --image ... [--instance-type ... --container-port ... --storage-size-bytes ...]` |
| `enclave_stop` | `enclavia enclave stop <id>` |
| `enclave_destroy` | `enclavia enclave destroy <id>` |

A useful prompt to verify the connector is wired up:

> List my enclaves and tell me which are running.

Claude will call `enclave_list` and summarise.

## Scope and authentication

- **Identity** is established via OAuth 2.1 (PKCE-S256) against `api.beta.enclavia.io`. The MCP server itself never sees your password or upstream identity-provider token — it only receives the API JWT minted by the backend, attached to each tool call as a `Authorization: Bearer <token>` header on the inbound MCP request.
- **Multi-tenant by design.** The MCP server holds no per-user secrets. Two different Claude sessions authorized by two different users hit the same process and only see their own enclaves.
- **Revoking access** takes one click: open the dashboard at `beta.enclavia.io`, find the active session for `enclavia-mcp` under your sessions list, and revoke it. Subsequent Claude tool calls from that connector will fail with `unauthorized` and Claude will offer to re-authorize.

## Local clients (Claude Desktop, mcp-inspector)

The same server speaks the standard MCP Streamable HTTP transport, so any client that supports a custom remote MCP URL works against `https://mcp.beta.enclavia.io/mcp`. Stdio mode is also supported by the underlying binary (`enclavia-mcp-server --transport stdio`) for advanced setups that want to run the MCP server locally and pin a specific token via `ENCLAVIA_TOKEN` — useful if you're embedding it into a non-OAuth client. Most users should use the hosted URL above.

## Limitations

- `enclavia push` is **not** exposed as an MCP tool — pushing requires a Docker daemon and a local image, both of which live on your machine, not in the MCP server. Push from the CLI, then ask Claude to create the enclave from the resulting tag.
- The MCP server doesn't proxy traffic into running enclaves. To talk to an enclave's HTTP service you still use the [`enclavia` client library](/connect).
