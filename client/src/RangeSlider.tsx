import { useRef } from 'react'

interface Props {
  min: number
  max: number
  low: number
  high: number
  onChange: (low: number, high: number) => void
}

export function RangeSlider({ min, max, low, high, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)

  const pct = (v: number) => ((v - min) / (max - min)) * 100

  const valueFromClientX = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(min + ratio * (max - min))
  }

  const startDrag = (which: 'low' | 'high') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()

    const move = (ev: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in ev ? ev.touches[0].clientX : ev.clientX
      const v = valueFromClientX(clientX)
      if (which === 'low') onChange(Math.min(v, high), high)
      else onChange(low, Math.max(v, low))
    }

    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', move)
    window.addEventListener('touchend', up)
  }

  return (
    <div className="range-slider">
      <div className="range-track" ref={trackRef}>
        <div
          className="range-fill"
          style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }}
        />
        <div
          className="range-thumb"
          style={{ left: `${pct(low)}%` }}
          onMouseDown={startDrag('low')}
          onTouchStart={startDrag('low')}
        />
        <div
          className="range-thumb"
          style={{ left: `${pct(high)}%` }}
          onMouseDown={startDrag('high')}
          onTouchStart={startDrag('high')}
        />
      </div>
    </div>
  )
}
