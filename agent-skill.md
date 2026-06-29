# Drive enclavia from a local AI agent (CLI skill)

There are two ways to let an AI agent manage your enclaves, and they trade off in opposite directions:

1. **The hosted [MCP server](/mcp)** at `mcp.beta.enclavia.io`. Zero local setup, OAuth in the client, a per-request bearer token. Best for agents that run in someone else's runtime (Claude on the web, ChatGPT) and have no shell of their own.
2. **The `enclavia` CLI with `--json` plus the agent skill** (this page). The agent runs the `enclavia` binary locally and reads a short skill file that teaches it the command surface. It needs a shell and a seeded credentials file, but it is more token-efficient than the MCP server for the same operations (one CLI call returns one JSON value, instead of an MCP tool round-trip), and it exposes the local-tool commands the hosted MCP server cannot offer: `push` (needs local Docker), `reproduce` (needs the local builder and Nix), and `secret` management. The MCP server conversely offers `enclave logs`, which the CLI has no command for; both cover the enclave lifecycle and `upgrade`.

If your agent already has a terminal, prefer this path. If it does not, use the MCP server.

## The `--json` contract

`--json` is a global flag: it works on every subcommand and in either position (`enclavia --json enclave list` or `enclavia enclave list --json`). It turns the CLI into a clean, scriptable surface. The contract an agent relies on:

- **Success**: a single JSON value (object or array) is printed to **stdout** and the process exits `0`.
- **Failure**: a single `{"error": "<message>", "kind": "<kind>"}` object is printed to stdout and the process exits **non-zero**. `kind` is one of `not_logged_in`, `unauthorized`, or `error`.
- **Progress and prompts** (including the OAuth login URL) and any diagnostics go to **stderr**, never stdout. So stdout is always exactly one parseable JSON value.

The agent therefore parses stdout once and branches on the **exit code**, not on prose:

```bash
out=$(enclavia enclave list --json)   # capture stdout
if [ $? -eq 0 ]; then
  # $out is the success array of enclave objects
else
  # $out is {"error": ..., "kind": ...}; inspect .kind
fi
```

### The `reproduce` exception

[`enclavia reproduce`](/reproduce) is a verification command, so its PCR verdict maps onto the exit code the way `diff` or `test` do:

| Exit code | Meaning |
|---|---|
| `0` | Reproducible: the local rebuild's PCRs match the recorded build. |
| `2` | Diverged: the build ran but the PCRs do not match. |
| `1` | Operational error (the usual `{"error", "kind"}` shape). |

On both `0` and `2` the full reproduce payload (including `reproducible` and the `mismatches` array) is printed to stdout, so a field-reading agent gets the detail while an exit-code-only caller still fails closed. Gate on exit `0` (or `reproducible == true`).

## The agent skill

The skill is a [Claude Code skill](https://docs.claude.com/en/docs/claude-code/skills): a single `SKILL.md` file with YAML frontmatter that an agent loads when a task matches its description. It teaches the agent the `enclavia` command surface, the `--json` rule above, and the per-command output shapes, so the agent does not have to rediscover them.

It lives in the public workspace at [`skills/enclavia/SKILL.md`](https://github.com/EnclaviaIO/enclavia/blob/master/skills/enclavia/SKILL.md) in the [`EnclaviaIO/enclavia`](https://github.com/EnclaviaIO/enclavia) repo, next to the CLI source it documents.

### Install it for your agent

Copy the file into your agent's skills directory. For Claude Code that is `~/.claude/skills/enclavia/`:

```bash
mkdir -p ~/.claude/skills/enclavia
curl -fsSL https://raw.githubusercontent.com/EnclaviaIO/enclavia/master/skills/enclavia/SKILL.md \
  -o ~/.claude/skills/enclavia/SKILL.md
```

If you already have the repo checked out, copy it from there instead:

```bash
mkdir -p ~/.claude/skills/enclavia
cp path/to/enclavia/skills/enclavia/SKILL.md ~/.claude/skills/enclavia/SKILL.md
```

The agent picks the skill up on its next run. From then on, asking it to "deploy", "list", or "inspect" an Enclavia enclave routes through the skill and the `--json` CLI.

## Authentication for headless agents

The CLI reads credentials from `~/.config/enclavia/credentials.json` (honouring `$XDG_CONFIG_HOME`). That file holds an OAuth access token plus a refresh token; the CLI auto-refreshes on expiry and rewrites the file, so once it exists an agent keeps working with no further interaction.

The catch is how the file gets created. `enclavia auth login` is **interactive**: it opens a browser (OAuth 2.1 + PKCE) and prints the approval URL to stderr. A headless agent cannot complete it. The flow is therefore:

1. A human runs `enclavia auth login` once on a machine with a browser (see [Authenticate](/auth)).
2. Copy the resulting `~/.config/enclavia/credentials.json` to the agent's `~/.config/enclavia/` if the agent runs somewhere else.
3. Run the agent with that file present.

If no credentials exist, every command fails with `{"kind": "not_logged_in"}`.

To target a non-production backend, set `ENCLAVIA_BACKEND_URL` (default `https://api.beta.enclavia.io`), for example `http://localhost:3000`. Note that the credentials file also records the backend it was minted against and uses it as the base URL, so keep the two consistent: a credentials file from one backend will not authenticate against another.

## Which should I use?

| | [MCP server](/mcp) | CLI + `--json` + skill |
|---|---|---|
| **Setup** | None local; paste a URL, OAuth in the client | Install the `enclavia` binary, seed credentials, drop in the skill |
| **Auth** | Per-request bearer token, OAuth in the client | Human-seeded `credentials.json`, auto-refreshed |
| **Best for** | Hosted agents with no shell (Claude web, ChatGPT) | Local agents that already have a terminal |
| **Token overhead** | Higher (MCP tool round-trips) | Lower (one CLI call, one JSON value) |
| **Surface** | Enclave lifecycle (`create`/`list`/`status`/`start`/`stop`/`destroy`), `logs`, and `upgrade` | Enclave lifecycle (plus `restart`) and `upgrade`, plus `push`, `secret`, and `reproduce`; no `logs` command |

In short: reach for the **MCP server** when you want a hosted connector with no local setup, and for the **CLI + skill** when your agent already has a shell and you want the lower token overhead plus the local-tool commands (`push`, `reproduce`, `secret`).

## See also

- [Connect an AI agent with the MCP server](/mcp) — the hosted alternative to this page.
- [Authenticate](/auth) — the interactive login that seeds the credentials file.
- [Reproduce a build](/reproduce) — the verification command whose exit codes the skill special-cases.
