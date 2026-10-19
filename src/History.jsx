import { useEffect } from 'react'
import { title } from './api.js'

const MERGE_MS = 10 * 60 * 1000 // edits within 10 min count as one change

// Records a snapshot whenever a ranking changes.
export function useRankHistory(rankings, history, setHistory) {
  useEffect(() => {
    let changed = false
    const next = { ...history }
    for (const size of ['10', '20', '30']) {
      const ids = rankings[size] || []
      const snaps = history[size] || []
      const last = snaps[snaps.length - 1]
      if (!ids.length || (last && last.ids.join() === ids.join())) continue
      const snap = { t: Date.now(), ids: [...ids] }
      next[size] = last && Date.now() - last.t < MERGE_MS ? [...snaps.slice(0, -1), snap] : [...snaps, snap]
      changed = true
    }
    if (changed) setHistory(next)
  }, [rankings])
}

// Movement of each id vs the previous snapshot: number (+ up / - down), 'new', or 0.
export function movement(snaps) {
  if (!snaps || snaps.length < 2) return {}
  const prev = snaps[snaps.length - 2].ids, cur = snaps[snaps.length - 1].ids
  return Object.fromEntries(cur.map((id, i) => {
    const p = prev.indexOf(id)
    return [id, p < 0 ? 'new' : p - i]
  }))
}

export function Move({ m }) {
  if (m === 'new') return <span className="mv new">NEW</span>
  if (!m) return <span className="mv same">–</span>
  return <span className={`mv ${m > 0 ? 'up' : 'down'}`}>{m > 0 ? '▲' : '▼'}{Math.abs(m)}</span>
}

const fmt = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function RankHistory({ snaps = [], size, media }) {
  if (snaps.length < 2) return <div className="card pad muted">Your history starts now. Each time you change your Top {size}, I'll save a snapshot so you can see who climbs and who drops.</div>

  const shown = snaps.slice(-10)
  const n = Number(size)
  const ids = [...new Set(shown.flatMap(s => s.ids))]
  const latest = shown[shown.length - 1].ids
  const W = 760, top = 20, left = 40, right = 200, rowH = n > 10 ? 18 : 30
  const H = top * 2 + rowH * (n - 1)
  const x = i => left + (shown.length === 1 ? 0 : (i * (W - left - right)) / (shown.length - 1))
  const y = r => top + r * rowH
  const color = id => media[id]?.coverImage.color || '#3db4f2'

  // biggest climber / faller across the shown window
  const first = shown[0].ids
  const deltas = latest.map(id => ({ id, d: first.indexOf(id) < 0 ? null : first.indexOf(id) - latest.indexOf(id) })).filter(x => x.d)
  const climber = deltas.sort((a, b) => b.d - a.d)[0]
  const dropped = first.filter(id => !latest.includes(id))

  return (
    <div className="card pad hist">
      <div className="histstats">
        <div><b>{snaps.length}</b><span>snapshots</span></div>
        <div><b>{fmt(snaps[0].t)}</b><span>tracking since</span></div>
        {climber && <div><b className="up">▲{climber.d}</b><span>{title(media[climber.id] || { title: {} })}</span></div>}
        {dropped.length > 0 && <div><b className="down">{dropped.length}</b><span>dropped out</span></div>}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 10}`} className="bump">
        {shown.map((s, i) => <g key={s.t}>
          <line x1={x(i)} x2={x(i)} y1={top - 10} y2={H - top + 10} stroke="#1f2a3c" />
          <text x={x(i)} y={H} textAnchor="middle" className="bx">{fmt(s.t)}</text>
        </g>)}
        {Array.from({ length: n }, (_, r) => <text key={r} x={10} y={y(r) + 4} className="by">#{r + 1}</text>)}
        {ids.map(id => {
          const pts = shown.map((s, i) => [i, s.ids.indexOf(id)]).filter(([, r]) => r >= 0)
          const on = latest.includes(id)
          const path = pts.map(([i, r], k) => {
            const prev = pts[k - 1]
            return prev && prev[0] === i - 1 ? `L${x(i)},${y(r)}` : `M${x(i)},${y(r)}`
          }).join(' ')
          return <g key={id} opacity={on ? 1 : 0.3}>
            <path d={path} fill="none" stroke={color(id)} strokeWidth={on ? 3 : 2} strokeLinejoin="round" />
            {pts.map(([i, r]) => <circle key={i} cx={x(i)} cy={y(r)} r={on ? 4.5 : 3} fill={color(id)} />)}
            {on && <text x={x(shown.length - 1) + 12} y={y(latest.indexOf(id)) + 4} className="bl">
              {(t => t.length > 24 ? t.slice(0, 23) + '…' : t)(title(media[id] || { title: { romaji: '?' } }))}</text>}
          </g>
        })}
      </svg>
      {dropped.length > 0 && <div className="muted small">Dropped out: {dropped.map(id => title(media[id] || { title: { romaji: '?' } })).join(', ')}</div>}
    </div>
  )
}
