# public-ui

Public landing site for smart-actuator, including the WebAssembly-powered actuator demo.

## What this app does

- Hosts the public homepage for jogactuators.com.
- Runs the actuator simulation demo in a Web Worker using Rust compiled to WebAssembly.
- Provides onboarding paths (`/get-started`) and a docs hub entry (`/docs`).

## Prerequisites

- Node.js 22+
- Rust toolchain
- wasm-pack

Install `wasm-pack` if needed:

```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

## Local development

From repository root:

```bash
make public-ui-dev
```

This will:

1. Build `actuator-wasm` into `smart-actuator/pkg-wasm`
2. Install npm dependencies for `public-ui`
3. Start Vite dev server

## Production build

From repository root:

```bash
make public-ui-build
```

Or from `public-ui` directly:

```bash
npm install
npm run build
```

## Preview production bundle

```bash
make public-ui-preview
```

## Deployment

### Manual deploy

```bash
make deploy-public-ui
```

### CI deploy

GitHub Actions workflow deploys to Cloudflare Pages when a bare semver tag is pushed:

- Example tag: `1.2.3`
- Workflow file: `.github/workflows/public-ui-pages-deploy.yml`

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Routing notes

This app uses lightweight path-based rendering without a router dependency.

Cloudflare Pages deep-link support is handled by:

- `public/_redirects` with `/* /index.html 200`

## Key paths

- `src/App.tsx` - top-level page rendering and route handling
- `src/components/ActuatorDemo.tsx` - demo composition
- `src/workers/actuator.worker.ts` - worker simulation loop
- `public/_headers` - response headers including wasm content type
- `public/_redirects` - SPA fallback for deep links
