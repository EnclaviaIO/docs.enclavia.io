# Authenticate

The CLI authenticates by asking the backend to mint a device code and pointing you at the web UI to approve it. There is no password to type into the terminal — the browser session is the source of trust.

## Sign in

```bash
enclavia auth login
```

The command will print a URL similar to:

```
Open this URL in a browser where you're already signed in to Enclavia:
  https://beta.enclavia.io/devices/approve?code=XXXXXXXX

Waiting for approval...
```

Open it in a browser that's already signed in to your Enclavia account. The page asks you to label the new session (a description of which machine or context this CLI is on) and click **Approve**. Once you do, the CLI receives the API token and writes it to `~/.config/enclavia/credentials.json`.

If you don't yet have an Enclavia account, the device-approval URL will redirect you through GitHub or Google sign-in first, then onboarding to choose a handle, then back to approval.

## Your handle

Your **handle** is the user-facing identifier you chose during onboarding. It scopes everything you push: image references resolve against `registry.beta.enclavia.io/<handle>/<repo>:<tag>`. Handles are not currently re-assignable, so pick one you're happy living with.

You can confirm which account is currently authenticated by listing your enclaves — the request fails with a clear error if the token is invalid:

```bash
enclavia enclave list
```

## Re-authenticate

Tokens are long-lived but revocable from the web UI. If a token is revoked or invalidated, any CLI command will print:

```
Error: unauthorized — run `enclavia auth login` to re-authenticate
```

Run `enclavia auth login` again and approve a new session.
