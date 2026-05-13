# docs.enclavia.io

VitePress-powered documentation for [Enclavia](https://enclavia.io).

## Develop

```bash
nix shell nixpkgs#nodejs_22 --command npm install
nix shell nixpkgs#nodejs_22 --command npm run dev
```

The dev server prints a local URL (typically `http://localhost:5173/`).

## Build

```bash
nix shell nixpkgs#nodejs_22 --command npm run build
```

Output lands in `.vitepress/dist/`. A machine-readable index is generated at `.vitepress/dist/llms.txt` by [`vitepress-plugin-llms`](https://github.com/okineadev/vitepress-plugin-llms).

## Preview the production build

```bash
nix shell nixpkgs#nodejs_22 --command npm run preview
```

## Layout

- `index.md` — landing page.
- `install.md`, `auth.md`, `create.md`, `push.md`, `connect.md` — getting-started flow.
- `.vitepress/config.mjs` — site config, sidebar, llms plugin.
- `.vitepress/theme/custom.css` — design-system tokens applied to VitePress vars.
- `public/fonts/` — Lora, Inter, JetBrains Mono webfonts.
- `public/mark.svg` — chamfered "En" brand mark used in the navbar.
