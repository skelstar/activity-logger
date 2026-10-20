# Plan: Strava OAuth for multiple users

Goal: replace the single hard-coded `STRAVA_REFRESH_TOKEN` with a per-user "Connect with Strava" OAuth flow, storing each athlete's tokens in SQLite on a persistent volume. Strava currently allows 10 connected athletes for this app.

## Decisions

- **Auth model:** your app, their login. `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` stay as env vars; refresh tokens become per-user data.
- **Storage:** SQLite file on a PVC, behind a small `TokenStore` interface so Postgres can replace it later.
- **Sessions:** signed, httpOnly cookie holding the Strava athlete id. Needs a new `SESSION_SECRET` env var.
- **Scope:** `activity:read_all`.

## Steps

### 1. Server: storage (`server/db.ts`)
- Add `better-sqlite3` (+ types). Alpine/musl prebuilds exist; if the image build compiles from source, add `python3 make g++` to the builder stage. Alternative: bump the Docker base to Node 22+ and use built-in `node:sqlite`.
- DB path from `DATA_DIR` env (default `server/data/` locally, `/data` in k8s). Create the dir and table on startup.
- Table `strava_tokens(athlete_id PK, firstname, refresh_token, access_token, expires_at, updated_at)`.
- Export `TokenStore { get(athleteId), upsert(row) }`.

### 2. Server: OAuth routes (`server/index.ts`, possibly split into `server/strava.ts`)
- `GET /api/strava/login` — set a random `state` cookie, redirect to `https://www.strava.com/oauth/authorize` with `client_id`, `redirect_uri`, `response_type=code`, `scope=activity:read_all`, `state`.
- `GET /api/strava/callback` — verify `state`, handle `error=access_denied`, exchange `code` at `/oauth/token`, upsert tokens, set the session cookie, redirect to `/`.
- `GET /api/strava/me` — `{ connected, firstname }` for the UI.
- `POST /api/strava/logout` — clear the cookie (optionally call Strava deauthorize and delete the row).
- Replace `getStravaAccessToken()` with a per-athlete version: use the cached access token if valid, otherwise refresh and persist the rotated refresh token. Remove the global cache and the `.env` rewrite hack.
- `/api/strava/activities` — read the athlete id from the session; return 401 `{ error: 'not_connected' }` if missing; on a Strava 401 from refresh, delete the row and return 401.
- `REDIRECT_URI` / `PUBLIC_URL` env var for the callback (differs dev vs prod).
- Dependency: `cookie-parser` or signed cookies via `cookie-session`.

### 3. Client (`client/src/App.tsx`, `App.css`)
- On load call `/api/strava/me`.
- Not connected → the "Get from Strava" button becomes the official "Connect with Strava" button (link to `/api/strava/login`).
- Connected → existing picker; on 401 show the connect button again.
- Small "Disconnect" action and a "Powered by Strava" footer/attribution.
- Vite dev proxy already covers `/api`; the OAuth redirect must come back via the Vite origin (`localhost:5173`) in dev.

### 4. Docker (`Dockerfile`)
- Native build deps if needed (see step 1). Create `/data` and declare `VOLUME`/`DATA_DIR=/data`.

### 5. Docs
- README: new env vars (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SESSION_SECRET`, `PUBLIC_URL`, `DATA_DIR`), remove `STRAVA_REFRESH_TOKEN`, document Strava app setup (Authorization Callback Domain) and the persistent volume.
- CLAUDE.md: update Planned work / key facts.

### 6. Out of this repo (Tatooine-Configuration `manifests.yaml`) — do before merging
- Add a PVC (`local-path`) and mount at `/data`.
- Deployment `strategy: Recreate`, `replicas: 1`.
- Add secret/env: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SESSION_SECRET`, `PUBLIC_URL`, `DATA_DIR=/data`; drop `STRAVA_REFRESH_TOKEN`.

### 7. Strava app settings — manual, on strava.com
- Set Authorization Callback Domain to the production host (and `localhost` for dev).

## Verification
- `yarn typecheck`.
- Local: `yarn dev`, run through connect → pick activity → restart server → still connected → disconnect.
- Confirm a second Strava account can connect (counts against the 10-athlete limit).
- After deploy: restart the pod and confirm users stay connected (PVC works).

## Risks / open questions
- The existing single-user setup stops working until you reconnect once through the new flow.
- Tokens in SQLite are plaintext; acceptable for a hobby app, but the PVC should not be shared.
- No user accounts beyond Strava identity: clearing cookies means reconnecting (Strava does not re-prompt if already authorized).
- Beyond 10 athletes requires a capacity increase from Strava.
