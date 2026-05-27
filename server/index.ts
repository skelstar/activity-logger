import express, { Request, Response } from 'express'
import { dirname, join } from 'path'
import cors from 'cors'

const isProd = process.env.NODE_ENV === 'production'

const app = express()
const PORT = isProd ? 3000 : 3001

if (!isProd) app.use(cors())
app.use(express.json())

const DEFAULT_ROUTES = ['Tip Track Commute', 'Waimapihi', 'Fenceline']
const customRoutes: string[] = []

const allRoutes = () => [...DEFAULT_ROUTES, ...customRoutes]

app.get('/api/version', (_req: Request, res: Response) => {
  res.json({ version: process.env.VERSION ?? 'xx.xx.xx' })
})

app.get('/api/routes', (_req: Request, res: Response) => {
  res.json(allRoutes())
})

app.post('/api/routes', (req: Request, res: Response) => {
  const { name } = req.body as { name?: unknown }
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const trimmed = name.trim()
  if (!trimmed) {
    res.status(400).json({ error: 'name cannot be empty' })
    return
  }
  if (!allRoutes().includes(trimmed)) {
    customRoutes.push(trimmed)
  }
  res.json({ routes: allRoutes() })
})

let cachedAccessToken: string | null = null
let tokenExpiry = 0

async function getStravaAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) return cachedAccessToken
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
    throw new Error('Strava credentials not configured (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN)')
  }
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: STRAVA_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`)
  const data = await res.json() as { access_token: string; expires_at: number }
  cachedAccessToken = data.access_token
  tokenExpiry = data.expires_at * 1000
  return cachedAccessToken
}

app.get('/api/strava/latest-activity', async (_req: Request, res: Response) => {
  try {
    const token = await getStravaAccessToken()
    const r = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) { res.status(502).json({ error: `Strava API error: ${r.status}` }); return }
    const activities = await r.json() as Array<{ name: string; average_heartrate?: number; max_heartrate?: number; moving_time?: number; total_elevation_gain?: number }>
    if (!activities.length) { res.status(404).json({ error: 'No activities found' }); return }
    const { name, average_heartrate, max_heartrate, moving_time, total_elevation_gain } = activities[0]
    res.json({ name, avg_hr: average_heartrate ?? null, max_hr: max_heartrate ?? null, moving_time: moving_time ?? null, vert: total_elevation_gain ?? null })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

if (isProd) {
  const clientDist = join(__dirname, '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
