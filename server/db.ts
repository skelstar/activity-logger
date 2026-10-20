import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface StravaTokenRow {
  athlete_id: number
  firstname: string | null
  refresh_token: string
  access_token: string
  expires_at: number
}

// Swap this for a Postgres implementation when that lands.
export interface TokenStore {
  get(athleteId: number): StravaTokenRow | undefined
  upsert(row: StravaTokenRow): void
  delete(athleteId: number): void
}

export function createSqliteTokenStore(): TokenStore {
  const dataDir = process.env.DATA_DIR ?? join(__dirname, 'data')
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'app.db'))

  db.exec(`
    CREATE TABLE IF NOT EXISTS strava_tokens (
      athlete_id    INTEGER PRIMARY KEY,
      firstname     TEXT,
      refresh_token TEXT NOT NULL,
      access_token  TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const getStmt = db.prepare('SELECT athlete_id, firstname, refresh_token, access_token, expires_at FROM strava_tokens WHERE athlete_id = ?')
  const upsertStmt = db.prepare(`
    INSERT INTO strava_tokens (athlete_id, firstname, refresh_token, access_token, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(athlete_id) DO UPDATE SET
      firstname = excluded.firstname,
      refresh_token = excluded.refresh_token,
      access_token = excluded.access_token,
      expires_at = excluded.expires_at,
      updated_at = CURRENT_TIMESTAMP
  `)
  const deleteStmt = db.prepare('DELETE FROM strava_tokens WHERE athlete_id = ?')

  return {
    get: id => getStmt.get(id) as unknown as StravaTokenRow | undefined,
    upsert: r => { upsertStmt.run(r.athlete_id, r.firstname, r.refresh_token, r.access_token, r.expires_at) },
    delete: id => { deleteStmt.run(id) },
  }
}
