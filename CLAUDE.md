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

The app is deployed to k3s on Tatooine via FluxCD. The k8s manifests live in the **Tatooine-Configuration repo** at `deployments/activity-logger/k8s/manifests.yaml` — not in this repo.

Images are published to `ghcr.io/skelstar/activity-logger` and tagged by version (e.g. `1.1.0`).

To release a new version, run from this directory:

```bash
./deploy.sh <version>
```

See [README.md](README.md) for full deploy instructions and one-time setup.

### How the version badge works

The app displays the running version in the top-right corner of the header. The version is injected at runtime via the `VERSION` environment variable set in the k8s manifest — it is not baked into the Docker image. This means:

- The image tag and `VERSION` env var are always kept in sync by `deploy.sh`
- Bumping the version requires a new image build and push (use `deploy.sh`)
- The badge reflects exactly what FluxCD has deployed

## Planned work

- Postgres persistence for activities (currently in-memory only)
- Custom routes entered via the "Other" field are stored in memory and lost on server restart — these will be persisted to the database
