# Activity Logger

A mobile-first web app for logging runs. Fill in the form and copy the result as formatted text or JSON to paste into an AI chat.

## Stack

- **Client** — React, TypeScript, Vite
- **Server** — Express, TypeScript, tsx
- **Monorepo** — Yarn workspaces

## Prerequisites

- Node.js 18+
- Yarn (`npm install -g yarn`)
- Docker (for building and deploying)

## Getting started

```bash
yarn install
```

## Development

```bash
yarn dev
```

Starts both servers concurrently:

| Service | URL |
|---|---|
| App (Vite) | http://localhost:5173 |
| API (Express) | http://localhost:3001 |

## Production

```bash
yarn build   # compile client → client/dist/
yarn start   # serve app + API on http://localhost:3000
```

`yarn start` runs Express with `NODE_ENV=production`. It serves the built client files and the API from a single process on port 3000.

## Other scripts

```bash
yarn typecheck   # type-check client and server
```

## Deploying

The app runs in k3s on Tatooine, managed by FluxCD. Images are published to `ghcr.io/skelstar/activity-logger`.

### One-time setup

Authenticate Docker with GitHub Container Registry (needs a PAT with `write:packages` scope):

```bash
docker login ghcr.io -u skelstar --password-stdin <<< "$GITHUB_TOKEN"
```

### Releasing a new version

```bash
./deploy.sh <version>   # e.g. ./deploy.sh 1.1.0
```

This script:
1. Builds the Docker image and tags it `ghcr.io/skelstar/activity-logger:<version>`
2. Pushes the image to ghcr.io
3. Updates the image tag and `VERSION` env var in `../k8s/manifests.yaml`
4. Commits and pushes the manifest change to the Tatooine-Configuration repo
5. FluxCD detects the change and redeploys the pod within 5 minutes

The version number is displayed in the top-right of the app UI, read at runtime from the `VERSION` environment variable set in the k8s manifest.

### Forcing an immediate redeploy

```bash
kubectl -n flux-system annotate gitrepository tatooine-config \
  reconcile.fluxcd.io/requestedAt="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite
```
