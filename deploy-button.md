# Deploy on Enclavia button

A **Deploy on Enclavia** button lets anyone launch your image inside an enclave from the browser, with no CLI and no local Docker. You add one badge to your README; a visitor clicks it, reviews the configuration on a prefilled create page, fills in any secrets, and creates the enclave.

It is the web counterpart to [`enclavia deploy`](/deploy): same result, but driven from a manifest you commit to your repo instead of from your terminal.

::: tip When to use which
Use the button for a public, one-click "try my app" flow in a README. Use [`enclavia deploy`](/deploy) or the [create](/create) / [push](/push) commands when you are deploying your own private image, or scripting.
:::

## How it works

1. You commit an `enclavia.json` manifest to your repo and add the badge, whose link points at the raw URL of that manifest.
2. A visitor clicks the badge and lands on `beta.enclavia.io/deploy`. They sign in if they are not already.
3. Enclavia fetches the manifest, inspects the public image it names, and renders the [create form](/create) prefilled from the manifest. Every field stays editable.
4. The visitor reviews the image (shown pinned to its exact digest), fills in any declared secrets, and clicks create. The image is mirrored into their own enclave's registry and the build starts. No `enclavia push` is needed.

The image is deployed **exactly as pinned by its digest** at review time, so a moved tag afterward can't change what a visitor already approved.

## Add the button

Put an `enclavia.json` at the root of your repo (see the [manifest](#the-manifest) below), then add the badge to your README. The link's `manifest` parameter is the raw URL of that file:

```markdown
[![Deploy on Enclavia](https://beta.enclavia.io/deploy-button.svg)](https://beta.enclavia.io/deploy?manifest=https://raw.githubusercontent.com/OWNER/REPO/HEAD/enclavia.json)
```

Replace `OWNER/REPO`. `HEAD` resolves to your repo's default branch; pin a tag or commit instead if you want the button to track a specific release.

::: tip Any host works
The flow is not GitHub-specific: `manifest` can be any public HTTPS URL that serves the raw JSON. For example, on GitLab:

```
https://beta.enclavia.io/deploy?manifest=https://gitlab.com/OWNER/REPO/-/raw/HEAD/enclavia.json
```

Plain static hosting works too. If your manifest URL itself contains query parameters, URL-encode it before dropping it into the `manifest=` value.
:::

## The manifest

`enclavia.json` is a small JSON document. Only `version` and `image` are required; every other field just prefills the corresponding control on the create form, and the visitor can change it before creating.

```json
{
  "version": 1,
  "image": "ghcr.io/OWNER/myapp:v1",
  "name": "myapp",
  "container_port": 8080,
  "instance_type": "small",
  "storage_mib": 1024,
  "upgradable": false,
  "visibility": "private",
  "egress_allowlist": {
    "version": 1,
    "resolvers": ["1.1.1.1"],
    "egress": [{ "host": "api.example.com", "port": 443, "protocol": "tcp" }]
  },
  "secrets": [
    { "name": "API_KEY", "description": "Upstream API key", "required": true }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `version` | yes | Must be `1`. |
| `image` | yes | Public image reference. Must be pullable anonymously from a supported registry (see [Image requirements](#image-requirements)). |
| `name` | no | Enclave name. 1 to 64 characters. |
| `container_port` | no | Port your container listens on. 1 to 65535. |
| `instance_type` | no | `small`, `medium`, or `large`. |
| `storage_mib` | no | Persistent storage size in MiB. 128 to 102400. Omit for no persistent storage. |
| `egress_allowlist` | no | The same outbound allowlist document the [egress](/egress) feature uses. Rendered into the form so the visitor reviews exactly what the workload may reach. |
| `upgradable` | no | `true` to create the enclave as [upgradable](/upgrades). |
| `visibility` | no | `private` (default) or `public`. |
| `secrets` | no | Up to 20 entries. Each is `{ "name", "description"?, "required"? }`. **Names only, never values.** |

### Secrets

The manifest declares which secrets your workload expects; it never carries their values. The deploy form renders one input per entry, marks `required: true` ones as blocking, and writes whatever the visitor enters into the new enclave's [secrets](/secrets) after it is created. Secret names must be 1 to 64 characters of `[A-Za-z0-9_]`; descriptions are shown as a hint under the input.

### Image requirements

The referenced image is inspected server-side before the form renders, and must be:

- **Publicly pullable** (anonymous pull) from a supported registry. Today that is Docker Hub and GitHub Container Registry (`ghcr.io`).
- **`linux/amd64`.** Multi-arch images are fine; their `linux/amd64` manifest is selected automatically.
- **Under the size limit** (2 GiB compressed).

If the manifest is valid but the image can't be used (private, wrong architecture, too large, or on an unsupported registry), the create form still opens prefilled from the manifest, with a notice that you'll need to push an image with the [CLI](/push) after creating the enclave. If the URL has no manifest at all, you get a plain create form.

## Notes

- The manifest is only ever read to **prefill and inform**; the backend re-validates everything at create time, so an edited form or a hand-crafted request can't get past the same checks.
- The enclave belongs to whoever clicks the button and creates it, in their own account and registry namespace. The manifest author does not need any relationship with the visitor.

## Next

- [Create an enclave](/create) — every field the button prefills, documented in full.
- [Per-enclave secrets](/secrets) — how the values collected on the form are stored and applied.
- [Outbound egress allowlist](/egress) — the `egress_allowlist` schema.
- [Deploy in one command](/deploy) — the CLI equivalent for your own images.
