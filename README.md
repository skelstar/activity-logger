# Activity Logger

A mobile-first web app for logging runs. Fill in the form and copy the result as formatted text or JSON to paste into an AI chat.

## Stack

- **Client** — React, TypeScript, Vite
- **Server** — Express, TypeScript, tsx
- **Monorepo** — Yarn workspaces

## Prerequisites

- Node.js 22.13+
- Yarn (`npm install -g yarn`)

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

To use "Connect with Strava" locally, create `server/.env` (git-ignored) with:

```
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
SESSION_SECRET=any-long-random-string
PUBLIC_URL=http://localhost:5173
```

Each user connects their own Strava account through OAuth (scope `activity:read_all`). Their tokens are stored in a SQLite database at `server/data/app.db` (git-ignored), or wherever `DATA_DIR` points.

In your [Strava API settings](https://www.strava.com/settings/api), set **Authorization Callback Domain** to `localhost` for local development (the production host when deployed). The app can only be authorized by as many athletes as your Strava app allows (shown on that settings page).

| Variable | Purpose |
|---|---|
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Identify this app to Strava |
| `SESSION_SECRET` | Signs the session cookie (required in production) |
| `PUBLIC_URL` | Public origin, used for the OAuth redirect URI (`<PUBLIC_URL>/api/strava/callback`). Default `http://localhost:5173` |
| `DATA_DIR` | Directory for the SQLite file. Default `server/data`; `/data` in the Docker image |

Requires Node 22.13+ (the server uses the built-in `node:sqlite`).

## Deployment
```
git push
./deploy.sh 1.2.1
```
`./deploy.sh` without the version number will just auto-increment the minor version number.

## Production

```bash
yarn build   # compile client → client/dist/
yarn start   # serve app + API on http://localhost:3000
```

`yarn start` runs Express with `NODE_ENV=production`. It serves the built client files and the API from a single process on port 3000.

The Docker image keeps the SQLite database in `/data`. In Kubernetes, mount a PersistentVolumeClaim there, run a single replica with the `Recreate` update strategy, and set `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SESSION_SECRET`, and `PUBLIC_URL` in the manifest.

## Other scripts

```bash
yarn typecheck   # type-check client and server
```

---

## Deploying to Tatooine

The app runs in k3s on Tatooine, managed by **FluxCD**. Deploys are triggered automatically by **GitHub Actions** on every merge to `main` — you never need to SSH into Tatooine or run anything manually.

```
PR merged to main
  → GitHub Actions builds image + pushes to ghcr.io
    → manifest in Tatooine-Configuration repo is updated + pushed
      → FluxCD on Tatooine polls GitHub every 5 minutes
        → detects new commit → applies updated manifest
          → Kubernetes pulls new image from ghcr.io → redeploys pod
            → version badge in the app shows the new version
```

---

### One-time setup (per repo)

**1. Create a fine-grained PAT** so GitHub Actions can write to `Tatooine-Configuration`:

- GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
- Name: `activity-logger-ci-tatooine-config-write`
- Repository access: Only select repositories → `Tatooine-Configuration`
- Permissions: **Contents → Read and write**
- Generate and copy the token

**2. Add secrets to this repo:**

- Go to this repo → Settings → Secrets and variables → Actions
- Add `TATOOINE_PAT` with the token from above
- `GITHUB_TOKEN` is automatic — GitHub provides it, nothing to add

**3. Enable branch protection on `main`** so the workflow only triggers on intentional merges (not direct pushes).

---

### Triggering a deploy

| How | What happens |
|---|---|
| Merge a PR to `main` | Minor version is auto-bumped (e.g. `1.1.0 → 1.2.0`) |
| Actions → Deploy → Run workflow → enter version | Deploys a specific version (must be greater than current) |

---

### Replicating this in another repo

When copying `.github/workflows/deploy.yml` to another app repo, update these values in the workflow file:

| Field | Change to |
|---|---|
| `ghcr.io/skelstar/activity-logger` | `ghcr.io/skelstar/<app-name>` |
| `deployments/activity-logger/k8s/manifests.yaml` | path for the new app in Tatooine-Configuration |
| `activity-logger: release` (commit message) | `<app-name>: release` |

Then repeat the one-time setup above for the new repo.

---

### How it works under the hood

- **GitHub Actions** (`.github/workflows/deploy.yml`) runs on merge to `main`, builds the Docker image for `linux/amd64`, pushes it to `ghcr.io/skelstar/activity-logger:<version>`, then commits the updated manifest to `Tatooine-Configuration`
- **FluxCD** runs in the `flux-system` namespace on Tatooine and watches the `skelstar/Tatooine-Configuration` GitHub repo every 5 minutes
- When FluxCD sees a new commit, it runs `kubectl apply` on the changed manifests
- **Kubernetes** pulls the new image from `ghcr.io` using `ghcr-pull-secret` (a secret with a `read:packages` PAT, created once per app namespace on Tatooine)
- The `VERSION` env var in the manifest is read by the Express server at runtime and displayed in the UI — it is not baked into the Docker image

### Force an immediate redeploy (from Tatooine)

```bash
kubectl -n flux-system annotate gitrepository tatooine-config \
  reconcile.fluxcd.io/requestedAt="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite
```
