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

## Planned work

- Postgres persistence for activities (currently in-memory only)
- Custom routes entered via the "Other" field are stored in memory and lost on server restart — these will be persisted to the database
