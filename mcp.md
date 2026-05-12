# Connect an AI agent with the MCP server

Enclavia ships a [Model Context Protocol](https://modelcontextprotocol.io) server so you can manage your enclaves from any MCP-aware AI client — Claude, ChatGPT, Cursor, the OpenAI Codex CLI, or anything else that speaks the spec — using natural language. It's the same surface as the CLI (list enclaves, inspect status and logs, create, stop, destroy), exposed as MCP tools and authenticated against your Enclavia account.

The hosted endpoint for the public beta is:

```
https://mcp.beta.enclavia.io/mcp
```

It speaks the standard **Streamable HTTP** transport and authenticates via **OAuth 2.1 (PKCE-S256)** against `api.beta.enclavia.io`. Most clients will discover both automatically — paste the URL and follow the consent flow.

## Add the connector

Pick the tab for your client. The OAuth flow is identical across all of them: you'll be redirected to `api.beta.enclavia.io` to authorize the connector against your Enclavia account (the same flow that backs `enclavia auth login`), then bounced back to your client with the connector linked.

::: tabs

== Claude

1. In Claude (claude.ai or Claude Desktop), open **Settings → Connectors → Add custom connector**.
2. Paste `https://mcp.beta.enclavia.io/mcp` into the connector field.
3. Save. Claude will redirect you to authorize. Approve the consent screen and you'll be bounced back to Claude.
4. Enable the connector in any chat to start using the tools.

If the consent screen logs you in via GitHub or Google first, that's because your browser session at `beta.enclavia.io` had expired — sign back in, then re-trigger the connector and it will skip straight to consent.

== ChatGPT

1. In ChatGPT, open **Settings → Connectors → Add custom connector** (available on Plus, Pro, Team, and Enterprise).
2. Set the **MCP server URL** to `https://mcp.beta.enclavia.io/mcp`.
3. Set the **authentication** to **OAuth** — ChatGPT will discover the authorization server from the protected-resource metadata. No client ID or secret to paste; Dynamic Client Registration is supported.
4. Save and authorize. You'll be redirected to Enclavia, approve the consent screen, and ChatGPT will pick up the token automatically.
5. Enable the connector in a chat or a custom GPT and start asking it about your enclaves.

== Cursor

Cursor reads MCP servers from `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` in your workspace. Add:

```json
{
  "mcpServers": {
    "enclavia": {
      "url": "https://mcp.beta.enclavia.io/mcp"
    }
  }
}
```

Restart Cursor. Open **Settings → MCP** and click **Authorize** next to the `enclavia` server — Cursor opens the OAuth flow in your browser. Approve, return to Cursor, and the tools become available in the chat panel.

== Codex CLI

The [OpenAI Codex CLI](https://github.com/openai/codex) reads MCP servers from `~/.codex/config.toml`. Add:

```toml
[mcp_servers.enclavia]
url = "https://mcp.beta.enclavia.io/mcp"
```

Run `codex` — on first use it will print an OAuth URL; open it, authorize, and Codex stores the token in `~/.codex/auth.json`. Subsequent runs reconnect silently.

== Generic / other

Any client that supports remote MCP over Streamable HTTP works. The raw parameters:

| Parameter | Value |
|---|---|
| **MCP endpoint** | `https://mcp.beta.enclavia.io/mcp` |
| **Transport** | Streamable HTTP |
| **Authentication** | OAuth 2.1 (PKCE-S256, Dynamic Client Registration) |
| **Authorization server** | `https://api.beta.enclavia.io` (discovered via `/.well-known/oauth-protected-resource`) |
| **Audience** | `https://mcp.beta.enclavia.io` |
| **Scopes** | none required — issued token covers all `enclave_*` tools |

If your client supports stdio rather than HTTP, the same server binary speaks `--transport stdio` and reads a pre-issued token from the `ENCLAVIA_TOKEN` environment variable — useful for embedding into non-OAuth clients. Most users should use the hosted HTTP URL above.

:::

## What the agent can do

The connector exposes one tool per CLI verb. Anything the agent calls runs against your account, scoped by the OAuth token issued during the authorization step. Tools currently available:

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

The agent will call `enclave_list` and summarise.

## Scope and authentication

- **Identity** is established via OAuth 2.1 (PKCE-S256) against `api.beta.enclavia.io`. The MCP server itself never sees your password or upstream identity-provider token — it only receives the API JWT minted by the backend, attached to each tool call as a `Authorization: Bearer <token>` header on the inbound MCP request.
- **Multi-tenant by design.** The MCP server holds no per-user secrets. Two different agent sessions authorized by two different users hit the same process and only see their own enclaves.
- **Revoking access** takes one click: open the dashboard at `beta.enclavia.io`, find the active session for `enclavia-mcp` under your sessions list, and revoke it. Subsequent tool calls from that connector will fail with `unauthorized` and the agent will offer to re-authorize.

## Limitations

- `enclavia push` is **not** exposed as an MCP tool — pushing requires a Docker daemon and a local image, both of which live on your machine, not in the MCP server. Push from the CLI, then ask the agent to create the enclave from the resulting tag.
- The MCP server doesn't proxy traffic into running enclaves. To talk to an enclave's HTTP service you still use the [`enclavia` client library](/connect).
