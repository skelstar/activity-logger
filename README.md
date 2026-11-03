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

The app runs in k3s on Tatooine, managed by **FluxCD**. Merging to `main` makes a **release**; it doesn't deploy anything. You deploy a release when you choose to, with Tatooine Deploy (`deploy.skelstar.io`).

```
PR merged to main
  → GitHub Actions typechecks and tests, then builds the image and pushes it to ghcr.io
    → publishes GitHub Release v<version> with release.json (version, commit, image digest)
      → you press Deploy in Tatooine Deploy
        → it commits the image to Tatooine-Configuration → Flux applies it → Kubernetes rolls out the pod
```

Until Tatooine Deploy is running on Tatooine, do the deploy step by hand: in Tatooine-Configuration, set the image line in `deployments/activity-logger/k8s/manifests.yaml` to `ghcr.io/skelstar/activity-logger:<version>@<digest>` (the digest is in the release's `release.json`) and push. See [TATOOINE-DEPLOY.md](TATOOINE-DEPLOY.md).

### Making a release

| How | What happens |
|---|---|
| Merge a PR to `main` | Minor version goes up by one (e.g. `1.16.0 → 1.17.0`). Changes to only `*.md`, `.claude/` or `.vscode/` don't make a release |
| Actions → Release → Run workflow, with a version | Releases that exact version (must be greater than the latest) |

Versions come from the git tags the workflow creates (`v1.16.0`, …). The first release is 1.16.0, continuing from 1.15.0, the last version deployed the old way.

### How it works under the hood

- **GitHub Actions** (`.github/workflows/release.yml`) needs no secrets of its own: it pushes to `ghcr.io` and creates the release with the built-in `GITHUB_TOKEN`
- If typecheck or tests fail, no image or release is made
- The version is baked into the image at build time (`VERSION` build arg), and the Express server serves it at `/api/version` for the badge in the UI
- **Kubernetes** pulls the image from `ghcr.io` using `ghcr-pull-secret` (a secret with a `read:packages` PAT, created once per app namespace on Tatooine)

### Force Flux to sync now (from Tatooine)

```bash
kubectl -n flux-system annotate gitrepository tatooine-config   reconcile.fluxcd.io/requestedAt="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite
```
