import { useState, useEffect } from 'react'
import './App.css'
import { RangeSlider } from './RangeSlider'

const DEFAULT_ROUTES = ['Tip Track Commute', 'Waimapihi', 'Fenceline']
const TERRAINS = ['trail', 'road', 'treadmill'] as const
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Terrain = typeof TERRAINS[number]
type DateOption = 'today' | 'yesterday' | 'custom'

interface FormState {
  date: DateOption
  dateCustom: string
  route: string
  routeOther: string
  duration: string
  vert: string
  terrain: Terrain
  avgHr: string
  maxHr: string
  hipStart: string
  hipEnd: string
  hipBehavior: string
  recovery: string
  notes: string
}

interface ActivityJSON {
  date: string
  route: string
  duration: string
  vert: number | null
  terrain: string
  avg_hr: number | null
  max_hr: number | null
  hip: {
    start: number | null
    end: number | null
    behaviour: string[]
  }
  recovery: string[]
  notes: string
}

function getDayLabel(dateStr: string): string {
  const today = new Date()
  if (dateStr === 'today') return `today (${DAYS[today.getDay()]})`
  if (dateStr === 'yesterday') {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    return `yesterday (${DAYS[d.getDay()]})`
  }
  if (!dateStr) return 'today'
  const d = new Date(dateStr + 'T12:00:00')
  return isNaN(d.getTime()) ? dateStr : `on ${dateStr} (${DAYS[d.getDay()]})`
}

function getISODate(dateStr: string): string {
  const today = new Date()
  if (!dateStr || dateStr === 'today') return today.toISOString().split('T')[0]
  if (dateStr === 'yesterday') {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }
  return dateStr
}

function toSnakeArray(text: string): string[] {
  if (!text) return []
  return text
    .split(',')
    .map(s => s.trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .filter(Boolean)
}

type ResolvedFormState = Omit<FormState, 'date'> & { date: string }

function toText(form: ResolvedFormState): string {
  const route = form.route === 'other' ? form.routeOther : form.route
  const terrain = form.terrain
    ? form.terrain.charAt(0).toUpperCase() + form.terrain.slice(1)
    : ''
  const lines: string[] = []

  lines.push(`I went for a run ${getDayLabel(form.date)}`)
  if (route) lines.push(route)

  const dv = [form.duration, form.vert ? `${form.vert}m` : ''].filter(Boolean)
  if (dv.length) lines.push(dv.join(' / '))

  if (terrain) lines.push(terrain)

  const hr = [
    form.avgHr ? `${form.avgHr} avg` : '',
    form.maxHr ? `${form.maxHr} max` : '',
  ].filter(Boolean)
  if (hr.length) lines.push(hr.join(' / '))

  const hs = form.hipStart !== '' ? form.hipStart : null
  const he = form.hipEnd !== '' ? form.hipEnd : null
  if (hs !== null || he !== null) lines.push(`Hip ${hs ?? '?'}→${he ?? '?'}`)
  if (form.hipBehavior) lines.push(form.hipBehavior)
  if (form.recovery) lines.push(form.recovery)
  if (form.notes) {
    lines.push('Notes:')
    lines.push(form.notes)
  }

  return lines.join('\n')
}

function toJSON(form: ResolvedFormState): ActivityJSON {
  const route = form.route === 'other' ? form.routeOther : form.route
  return {
    date: getISODate(form.date),
    route: route || '',
    duration: form.duration || '',
    vert: form.vert ? Number(form.vert) : null,
    terrain: form.terrain || '',
    avg_hr: form.avgHr ? Number(form.avgHr) : null,
    max_hr: form.maxHr ? Number(form.maxHr) : null,
    hip: {
      start: form.hipStart !== '' ? Number(form.hipStart) : null,
      end: form.hipEnd !== '' ? Number(form.hipEnd) : null,
      behaviour: toSnakeArray(form.hipBehavior),
    },
    recovery: toSnakeArray(form.recovery),
    notes: form.notes || '',
  }
}

const INITIAL: FormState = {
  date: 'today',
  dateCustom: '',
  route: 'Tip Track Commute',
  routeOther: '',
  duration: '',
  vert: '',
  terrain: 'trail',
  avgHr: '132',
  maxHr: '148',
  hipStart: '0',
  hipEnd: '2',
  hipBehavior: '',
  recovery: '',
  notes: '',
}

export default function App() {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [routes, setRoutes] = useState<string[]>(DEFAULT_ROUTES)
  const [copied, setCopied] = useState<'text' | 'json' | null>(null)
  const [tab, setTab] = useState<'text' | 'json'>('text')
  const [editedText, setEditedText] = useState<string | null>(null)
  const [editedJson, setEditedJson] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/routes')
      .then(r => r.json())
      .then((data: string[]) => setRoutes(data))
      .catch(() => {})
  }, [])

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [field]: value }))

  const effectiveDate = form.date === 'custom' ? form.dateCustom : form.date
  const formData: ResolvedFormState = { ...form, date: effectiveDate }
  const textOut = toText(formData)
  const jsonOut = JSON.stringify(toJSON(formData), null, 2)
  const displayText = editedText ?? textOut
  const displayJson = editedJson ?? jsonOut

  const copy = async (type: 'text' | 'json') => {
    await navigator.clipboard.writeText(type === 'text' ? displayText : displayJson)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const saveCustomRoute = async () => {
    if (!form.routeOther.trim()) return
    const res = await fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.routeOther.trim() }),
    })
    if (res.ok) {
      const { routes: updated } = (await res.json()) as { routes: string[] }
      setRoutes(updated)
      set('route', form.routeOther.trim())
      set('routeOther', '')
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">Activity Logger</h1>
        <p className="header-sub">Log a run</p>
      </header>

      <div className="layout">
        <form className="form card" onSubmit={e => e.preventDefault()}>

          {/* Date */}
          <div className="field">
            <label className="label">Date</label>
            <div className="pill-group">
              {(['today', 'yesterday', 'custom'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  className={`pill ${form.date === d ? 'active' : ''}`}
                  onClick={() => set('date', d)}
                >
                  {d === 'today' ? 'Today' : d === 'yesterday' ? 'Yesterday' : 'Custom'}
                </button>
              ))}
            </div>
            {form.date === 'custom' && (
              <input
                className="input mt"
                type="date"
                value={form.dateCustom}
                onChange={e => set('dateCustom', e.target.value)}
              />
            )}
          </div>

          {/* Route */}
          <div className="field">
            <label className="label">Route</label>
            <select
              className="input"
              value={form.route}
              onChange={e => set('route', e.target.value)}
            >
              {routes.map(r => <option key={r} value={r}>{r}</option>)}
              <option value="other">Other…</option>
            </select>
            {form.route === 'other' && (
              <div className="other-row mt">
                <input
                  className="input"
                  type="text"
                  placeholder="Route name"
                  value={form.routeOther}
                  onChange={e => set('routeOther', e.target.value)}
                />
                <button type="button" className="save-btn" onClick={saveCustomRoute}>
                  Save
                </button>
              </div>
            )}
          </div>

          {/* Duration + Vert */}
          <div className="row-2">
            <div className="field">
              <label className="label">Duration</label>
              <input
                className="input"
                type="text"
                placeholder="1h52m"
                value={form.duration}
                onChange={e => set('duration', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Vert (m)</label>
              <input
                className="input"
                type="number"
                placeholder="620"
                value={form.vert}
                onChange={e => set('vert', e.target.value)}
              />
            </div>
          </div>

          {/* Terrain */}
          <div className="field">
            <label className="label">Terrain</label>
            <div className="pill-group">
              {TERRAINS.map(t => (
                <button
                  key={t}
                  type="button"
                  className={`pill ${form.terrain === t ? 'active' : ''}`}
                  onClick={() => set('terrain', t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Heart Rate */}
          <div className="hr-box">
            <div className="hr-box-title">Heartrate</div>
            <div className="hr-values">
              {(['avgHr', 'maxHr'] as const).map((key, i) => {
                const val = Number(form[key]) || (key === 'avgHr' ? 132 : 148)
                const pct = ((val - 120) / (160 - 120)) * 100
                return (
                  <div key={key} className="hr-handle-label" style={{ left: `${pct}%` }}>
                    <span className="slider-value">{i === 0 ? 'AVG' : 'MAX'} [{form[key]}]</span>
                  </div>
                )
              })}
            </div>
            <RangeSlider
              min={120}
              max={160}
              low={Number(form.avgHr) || 132}
              high={Number(form.maxHr) || 148}
              onChange={(low, high) => { set('avgHr', String(low)); set('maxHr', String(high)) }}
            />
          </div>

          {/* Hip */}
          <div className="hr-box">
            <div className="hr-box-title">Hip</div>
            <RangeSlider
              min={0}
              max={5}
              low={Number(form.hipStart)}
              high={Number(form.hipEnd)}
              onChange={(low, high) => { set('hipStart', String(low)); set('hipEnd', String(high)) }}
            />
            <div className="hip-values">
              <span className="slider-value">Start - {form.hipStart}</span>
              <span className="slider-value">End - {form.hipEnd}</span>
            </div>
            <input
              className="input mt"
              type="text"
              placeholder="Behavior (e.g. stable, downhill-sensitive)"
              value={form.hipBehavior}
              onChange={e => set('hipBehavior', e.target.value)}
            />
          </div>

          {/* Recovery */}
          <div className="field">
            <label className="label">Recovery</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. strong finish, could continue"
              value={form.recovery}
              onChange={e => set('recovery', e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="field">
            <label className="label">Notes</label>
            <textarea
              className="input textarea"
              rows={3}
              placeholder="Anything else worth noting…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

        </form>

        {/* Preview */}
        <div className="preview card">
          <div className="preview-header">
            <div className="tabs">
              <button
                className={`tab ${tab === 'text' ? 'active' : ''}`}
                onClick={() => setTab('text')}
              >
                Text
              </button>
              <button
                className={`tab ${tab === 'json' ? 'active' : ''}`}
                onClick={() => setTab('json')}
              >
                JSON
              </button>
            </div>
          </div>
          <textarea
            className="preview-body"
            value={tab === 'text' ? displayText : displayJson}
            onChange={e => {
              if (tab === 'text') setEditedText(e.target.value)
              else setEditedJson(e.target.value)
            }}
          />
          <div className="preview-actions">
            <button className="copy-btn primary" onClick={() => copy(tab)}>
              {copied === tab ? '✓ Copied!' : `Copy ${tab === 'text' ? 'Text' : 'JSON'}`}
            </button>
            <button
              className="copy-btn ghost"
              onClick={() => {
                if (tab === 'text') setEditedText(null)
                else setEditedJson(null)
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
