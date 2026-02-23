# Cloudflare Deploy (Workers + Containers)

This folder contains an isolated Cloudflare deployment target for AssppWeb.

## Why Containers

AssppWeb backend needs:

- WebSocket upgrades (`/wisp/`)
- filesystem writes for compiled IPA output
- long-running Node.js runtime behavior

Cloudflare Containers runs the existing Dockerized app with minimal changes.

## Deploy

```bash
cd cloudflare
npm install
npx wrangler login
npm run deploy
```

For local preview on Cloudflare runtime:

```bash
cd cloudflare
npm install
npm run dev
```

## Notes

- `wrangler.jsonc` points at `./Dockerfile` and sets `image_build_context` to `..` so the container build still uses the repo-root app sources.
- The worker routes all HTTP and WebSocket traffic to one named container instance (`main`) to keep app state consistent.
- Container filesystem is ephemeral. Compiled packages may be lost when the container stops and restarts.
