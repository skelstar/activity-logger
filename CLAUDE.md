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

The app runs in k3s on Tatooine, managed by FluxCD. See [README.md](README.md) for the full deploy workflow.

**Short version:** make changes, `git push`, run `./deploy.sh` — Tatooine redeploys automatically within 5 minutes. No SSH required.

### Key facts
- Images are published to `ghcr.io/skelstar/activity-logger:<version>`, built for `linux/amd64`
- The k8s manifests live in the **Tatooine-Configuration** repo at `deployments/activity-logger/k8s/manifests.yaml` — not in this repo
- `./deploy.sh` with no argument auto-bumps the minor version; pass a version explicitly to override
- The version badge in the app UI reads `VERSION` from the environment at runtime — it is not baked into the image

## Planned work

- Postgres persistence for activities (currently in-memory only)
- Custom routes entered via the "Other" field are stored in memory and lost on server restart — these will be persisted to the database
