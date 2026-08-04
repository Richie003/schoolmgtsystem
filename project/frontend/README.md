# Frontend — School Management SPA (React + Vite)

The single-page app for the School Management System. It is a **static bundle**
that talks to the [backend](../backend) API over HTTP, so it deploys to any
static host (Netlify, Vercel, S3+CloudFront, Nginx…) independently of the API.

For product/architecture detail see the [system README](../README.md). This file
is just how to **run and deploy the SPA**.

## Prerequisites

- Node 18+
- The backend API running somewhere (locally on `:8000`, or a deployed URL)

## Run locally

```bash
cd project/frontend
npm install
npm run dev            # http://localhost:5173
```

In dev you don't need to configure anything: the Vite dev server **proxies**
`/api` and `/media` to `http://localhost:8000` (see [vite.config.ts](vite.config.ts)),
so requests are same-origin and there's no CORS to configure. Point the proxy at
a different backend with `VITE_DEV_PROXY_TARGET`.

## Configuration

Vite inlines env vars at **build time**. Copy [.env.example](.env.example) to
`.env` (or `.env.local`) if you need to override anything:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API base URL incl. `/api`, no trailing slash. **Unset in dev** (uses the proxy); **required in production**. |
| `VITE_DEV_PROXY_TARGET` | Where `vite dev` forwards `/api` + `/media`. Default `http://localhost:8000`. |

## Build & deploy (its own static host)

```bash
# Point the bundle at the deployed API — this is baked in at build time.
VITE_API_BASE_URL=https://api.your-school-domain.com/api npm run build
```

This emits a static `dist/`. Deploy it to any static host, with two requirements:

1. **SPA fallback** — rewrite unknown routes to `/index.html` (client-side
   routing). On Netlify: a `_redirects` file with `/* /index.html 200`; on Nginx:
   `try_files $uri /index.html;`.
2. **CORS** — the API's `CORS_ALLOWED_ORIGINS` must include this site's origin,
   since the SPA and API are on different domains.

Preview the production build locally:

```bash
npm run preview
```

## Checks

```bash
npm run lint
npx tsc --noEmit
```
