# Activity Logger

A mobile-first web app for logging runs. Fill in the form and copy the result as formatted text or JSON to paste into an AI chat.

## Stack

- **Client** — React, TypeScript, Vite
- **Server** — Express, TypeScript, tsx
- **Monorepo** — Yarn workspaces

## Prerequisites

- Node.js 18+
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
