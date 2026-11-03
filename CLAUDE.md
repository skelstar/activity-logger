# Activity Logger — Claude Context

## Spec

This app is built to the spec in [app-spec.md](app-spec.md). Read it before making changes to the schema, output format, or form fields. The spec defines the JSON shape, the human-readable text format, and the list of form fields.

## Documentation

Keep [README.md](README.md) up to date when making changes that affect how the app is run, built, or deployed — new scripts, changed ports, added prerequisites, etc.

## Architecture

Yarn workspaces monorepo with two packages:

- `client/` — React + TypeScript + Vite, mobile-first
- `server/` — Express + TypeScript, runs with `tsx`

### Key scripts

| Command | What it does |
|---|---|
| `yarn dev` | Client on :5173, API on :3001 (Vite proxies /api) |
| `yarn build` | Compiles client to `client/dist/` |
| `yarn start` | Production: Express serves app + API on :3000 |
| `yarn typecheck` | `tsc --noEmit` across both workspaces |

## Deployment

The app runs in k3s on Tatooine, managed by FluxCD. See [README.md](README.md) and [TATOOINE-DEPLOY.md](TATOOINE-DEPLOY.md).

**Short version:** merge a PR to `main` → GitHub Actions typechecks, tests, builds the image and publishes a GitHub Release with `release.json`. **Nothing deploys automatically.** Deploys happen in Tatooine Deploy (`deploy.skelstar.io`), or by hand by editing the image line in Tatooine-Configuration until that's running.

### Key facts
- Images are published to `ghcr.io/skelstar/activity-logger:<version>`, built for `linux/amd64`
- The k8s manifests live in the **Tatooine-Configuration** repo at `deployments/activity-logger/k8s/manifests.yaml` — not in this repo
- Merging to `main` bumps the minor version (from the latest `v*` git tag); a manual workflow run allows specifying an explicit version
- Strava is connected per user via OAuth; tokens are stored in SQLite at `DATA_DIR` (`/data` in the image), so the pod needs a PVC mounted there, 1 replica, `Recreate` strategy
- Required env in the manifest: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SESSION_SECRET`, `PUBLIC_URL`
- The version badge in the app UI reads `VERSION`, which is baked into the image at build time (`VERSION` build arg). Don't set it in the manifest: that would override it

## Planned work

- Postgres persistence for activities (currently in-memory only); Strava tokens are already in SQLite behind the `TokenStore` interface in `server/db.ts` and can move to Postgres too
- Custom routes entered via the "Other" field are stored in memory and lost on server restart — these will be persisted to the database
