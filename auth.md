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

Your **handle** is the user-facing identifier you chose during onboarding. It scopes everything you push: image references resolve against `registry.beta.enclavia.io/<handle>/<repo>:<tag>`. Handles are not currently re-assignable, so pick one you're happy living with.

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
