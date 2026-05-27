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

---

## Deploying to Tatooine

The app runs in k3s on Tatooine, managed by **FluxCD**. The full pipeline looks like this:

```
You make code changes on your laptop
  → git push to activity-logger repo
    → ./deploy.sh builds image + pushes to ghcr.io
      → manifest in Tatooine-Configuration repo is updated + pushed
        → FluxCD on Tatooine polls GitHub every 5 minutes
          → detects new commit → applies updated manifest
            → Kubernetes pulls new image from ghcr.io → redeploys pod
              → version badge in the app shows the new version
```

You never need to SSH into Tatooine. Everything flows through GitHub.

---

### One-time setup (per machine)

**1. Clone both repos as siblings in the same folder:**

```bash
git clone https://github.com/skelstar/activity-logger.git
git clone https://github.com/skelstar/Tatooine-Configuration.git
```

The `deploy.sh` script updates the manifest in `Tatooine-Configuration`, so both repos need to be present side-by-side.

**2. Authenticate Docker with GitHub Container Registry:**

Create a [classic GitHub PAT](https://github.com/settings/tokens) with `write:packages` scope, then:

```bash
docker login ghcr.io -u skelstar
# paste your write:packages token when prompted
```

This is stored in `~/.docker/config.json` and only needs to be done once per machine.

---

### Releasing a new version

**1. Make your code changes, then commit and push:**

```bash
git add .
git commit -m "describe your change"
git push
```

**2. Run the deploy script:**

```bash
./deploy.sh          # auto-bumps minor version (e.g. 1.1.0 → 1.2.0)
./deploy.sh 2.0.0   # or specify a version explicitly (must be > current)
```

The script will:
1. Read the current version from the k8s manifest and validate the new version is higher
2. Build the Docker image for `linux/amd64` and push it to `ghcr.io/skelstar/activity-logger:<version>`
3. Update the image tag and `VERSION` env var in `Tatooine-Configuration/deployments/activity-logger/k8s/manifests.yaml`
4. Commit and push the manifest change to the Tatooine-Configuration repo

**3. Wait up to 5 minutes** for FluxCD to poll GitHub and redeploy — or trigger it immediately from Tatooine:

```bash
kubectl -n flux-system annotate gitrepository tatooine-config \
  reconcile.fluxcd.io/requestedAt="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite
```

The version badge in the top-right of the app will update to confirm the new version is live.

---

### How it works under the hood

- **ghcr.io** hosts the Docker images, tagged by version (e.g. `ghcr.io/skelstar/activity-logger:1.2.0`)
- **FluxCD** runs in the `flux-system` namespace on Tatooine and watches the `skelstar/Tatooine-Configuration` GitHub repo
- When FluxCD sees a new commit, it runs `kubectl apply` on the changed manifests
- The `VERSION` env var in the manifest is read by the Express server at runtime and displayed in the UI — it is not baked into the Docker image
- k3s pulls images using the `ghcr-pull-secret` (a Kubernetes secret with a `read:packages` GitHub PAT), created once on Tatooine per app namespace
