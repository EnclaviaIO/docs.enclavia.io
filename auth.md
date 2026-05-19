# Authenticate

The CLI authenticates with the backend over OAuth 2.1 (PKCE-S256) with a localhost loopback redirect. There is no password to type into the terminal; the browser session is the source of trust.

## Sign in

```bash
enclavia auth login
```

The command starts a tiny one-shot HTTP server on a random localhost port, prints the authorization URL, and tries to open it in your default browser:

```
Open this URL in your browser to authorize this device:
  https://api.beta.enclavia.io/oauth/authorize?response_type=code&client_id=enclavia-cli&redirect_uri=http://127.0.0.1:<port>/cb&code_challenge=...&code_challenge_method=S256&state=...

Waiting for the browser to redirect back...
```

If the auto-open fails (headless machine, no `xdg-open`, etc.) copy the URL into a browser that's signed in to your Enclavia account. Approve the consent screen and the browser redirects back to the loopback URL, which hands the authorization code to the CLI. The CLI exchanges the code for an access token + refresh token and writes both to `~/.config/enclavia/credentials.json`.

If you don't yet have an Enclavia account, the consent flow redirects you through GitHub or Google sign-in first, then onboarding to choose a handle, then back to consent.

## Your handle

Your **handle** is the user-facing identifier you chose during onboarding. It scopes every enclave's registry repo: each `enclavia enclave create` provisions a private repo at `registry.beta.enclavia.io/<handle>/<enclave-uuid>` that you then push to. Handles are not currently re-assignable, so pick one you're happy living with.

You can confirm which account is currently authenticated by listing your enclaves — the request fails with a clear error if the token is invalid:

```bash
enclavia enclave list
```

## Re-authenticate

Access tokens are short-lived and the CLI refreshes them silently using the refresh token in `credentials.json`. Sessions are revocable from the web UI; if a session is revoked, the next CLI command will print:

```
Error: unauthorized; run `enclavia auth login` to re-authenticate
```

Run `enclavia auth login` again and approve a new session.

### Upgrading from an older CLI

Earlier CLI builds wrote a single-field credentials file (`{"token": "..."}`). The current CLI rejects that shape on startup and reports `unauthorized`. If you see that after upgrading, delete the file and re-authenticate:

```bash
rm ~/.config/enclavia/credentials.json
enclavia auth login
```

## Different from the Claude / MCP login

`enclavia auth login` only authorizes the **CLI on this laptop**. It is *not* the same login as the OAuth flow you go through when wiring up the [MCP connector](/mcp) in Claude (or ChatGPT, Cursor, Codex). Both flows present the same consent screen at `api.beta.enclavia.io` and tie back to the same Enclavia account, but each client ends up with its own session and its own bearer token:

- **CLI** → token in `~/.config/enclavia/credentials.json`, used by every `enclavia` command (including `enclavia push`, which MCP intentionally doesn't expose).
- **MCP client** → token held by the client (Claude, ChatGPT, …), used for `enclave_list`/`create`/`status`/`stop`/`destroy` tool calls.

Authorizing one doesn't authorize the other. You can run the CLI without ever connecting an agent, or drive the management surface from an agent without installing the CLI. To go all the way from `create` to `running` you need both — the agent (or the CLI) creates the enclave, then `enclavia push` from your terminal uploads the image that flips it to `building`.
