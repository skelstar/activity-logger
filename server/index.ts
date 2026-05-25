import express, { Request, Response } from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'

const app = express()
const PORT = isProd ? 3000 : 3001

if (!isProd) app.use(cors())
app.use(express.json())

const DEFAULT_ROUTES = ['Tip Track Commute', 'Waimapihi', 'Fenceline']
const customRoutes: string[] = []

const allRoutes = () => [...DEFAULT_ROUTES, ...customRoutes]

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
