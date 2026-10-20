import { Router, Request, Response } from 'express'
import { randomBytes } from 'crypto'
import type { TokenStore } from './db.js'

const SESSION_COOKIE = 'session'
const STATE_COOKIE = 'strava_state'
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365
const REFRESH_MARGIN_MS = 60_000

class NotConnectedError extends Error {}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; firstname?: string }
}

interface StravaSummary {
  id: number
  name: string
  start_date_local: string
  sport_type?: string
  average_heartrate?: number
  max_heartrate?: number
  moving_time?: number
  total_elevation_gain?: number
}

export function createStravaRouter(store: TokenStore, opts: { publicUrl: string }): Router {
  const router = Router()
  const secure = opts.publicUrl.startsWith('https://')
  const redirectUri = `${opts.publicUrl}/api/strava/callback`
  const cookieBase = { httpOnly: true, sameSite: 'lax', secure } as const

  const credentials = () => {
    const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = process.env
    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
      throw new Error('Strava credentials not configured (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET)')
    }
    return { clientId: STRAVA_CLIENT_ID, clientSecret: STRAVA_CLIENT_SECRET }
  }

  const tokenRequest = async (params: Record<string, string>): ReturnType<typeof fetch> => {
    const { clientId, clientSecret } = credentials()
    return fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
    })
  }

  const sessionAthleteId = (req: Request): number | null => {
    const raw = req.signedCookies?.[SESSION_COOKIE]
    const id = typeof raw === 'string' ? parseInt(raw, 10) : NaN
    return Number.isFinite(id) ? id : null
  }

  async function getAccessToken(athleteId: number): Promise<string> {
    const row = store.get(athleteId)
    if (!row) throw new NotConnectedError()
    if (Date.now() < row.expires_at * 1000 - REFRESH_MARGIN_MS) return row.access_token

    const res = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token })
    if (res.status === 400 || res.status === 401) {
      store.delete(athleteId)
      throw new NotConnectedError()
    }
    if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`)
    const data = await res.json() as TokenResponse
    store.upsert({
      athlete_id: athleteId,
      firstname: row.firstname,
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_at: data.expires_at,
    })
    return data.access_token
  }

  router.get('/login', (_req: Request, res: Response) => {
    try {
      const { clientId } = credentials()
      const state = randomBytes(16).toString('hex')
      res.cookie(STATE_COOKIE, state, { ...cookieBase, maxAge: 10 * 60 * 1000, signed: true })
      const url = new URL('https://www.strava.com/oauth/authorize')
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        approval_prompt: 'auto',
        scope: 'activity:read_all',
        state,
      }).toString()
      res.redirect(url.toString())
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.get('/callback', async (req: Request, res: Response) => {
    const { code, state, scope, error } = req.query as Record<string, string | undefined>
    const expectedState = req.signedCookies?.[STATE_COOKIE]
    res.clearCookie(STATE_COOKIE, cookieBase)

    if (error) { res.redirect('/?strava=denied'); return }
    if (!code || !state || !expectedState || state !== expectedState) {
      res.redirect('/?strava=error')
      return
    }
    // The user can untick the activity permission on Strava's consent screen
    if (!scope?.split(',').some(s => s.startsWith('activity:read'))) {
      res.redirect('/?strava=scope')
      return
    }

    try {
      const tokenRes = await tokenRequest({ grant_type: 'authorization_code', code })
      if (!tokenRes.ok) { res.redirect('/?strava=error'); return }
      const data = await tokenRes.json() as TokenResponse
      if (!data.athlete?.id) { res.redirect('/?strava=error'); return }
      store.upsert({
        athlete_id: data.athlete.id,
        firstname: data.athlete.firstname ?? null,
        refresh_token: data.refresh_token,
        access_token: data.access_token,
        expires_at: data.expires_at,
      })
      res.cookie(SESSION_COOKIE, String(data.athlete.id), { ...cookieBase, maxAge: SESSION_MAX_AGE_MS, signed: true })
      res.redirect('/')
    } catch {
      res.redirect('/?strava=error')
    }
  })

  router.get('/me', (req: Request, res: Response) => {
    const id = sessionAthleteId(req)
    const row = id != null ? store.get(id) : undefined
    res.json({ connected: !!row, firstname: row?.firstname ?? null })
  })

  router.post('/logout', (req: Request, res: Response) => {
    const id = sessionAthleteId(req)
    if (id != null) store.delete(id)
    res.clearCookie(SESSION_COOKIE, cookieBase)
    res.json({ ok: true })
  })

  router.get('/activities', async (req: Request, res: Response) => {
    const athleteId = sessionAthleteId(req)
    if (athleteId == null) { res.status(401).json({ error: 'not_connected' }); return }
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
      const perPage = Math.min(50, Math.max(1, parseInt(String(req.query.per_page ?? '15'), 10) || 15))
      const token = await getAccessToken(athleteId)
      const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.status === 401) {
        store.delete(athleteId)
        res.status(401).json({ error: 'not_connected' })
        return
      }
      if (!r.ok) { res.status(502).json({ error: `Strava API error: ${r.status}` }); return }
      const activities = await r.json() as StravaSummary[]
      res.json({
        activities: activities.map(a => ({
          id: a.id,
          name: a.name,
          date: a.start_date_local.slice(0, 10),
          type: a.sport_type ?? null,
          avg_hr: a.average_heartrate ?? null,
          max_hr: a.max_heartrate ?? null,
          moving_time: a.moving_time ?? null,
          vert: a.total_elevation_gain ?? null,
        })),
        hasMore: activities.length === perPage,
      })
    } catch (err) {
      if (err instanceof NotConnectedError) { res.status(401).json({ error: 'not_connected' }); return }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  return router
}
