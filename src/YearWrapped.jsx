import { useEffect, useMemo, useState } from 'react'
import { title } from './api.js'
import { sb } from './cloud.js'
import { ACH } from './achievements.js'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// One year's slides, built from AniList completion dates plus your Ranked activity that year.
export default function YearWrapped({ list, user, me }) {
  const years = useMemo(() => {
    const ys = new Set(list.map(e => e.completedAt?.year).filter(Boolean))
    ys.add(new Date().getFullYear())
    return [...ys].sort((a, b) => b - a)
  }, [list])
  const [year, setYear] = useState(years[0])
  const [ranked, setRanked] = useState(null)

  useEffect(() => {
    setRanked(null)
    if (!sb || !me) return
    const from = `${year}-01-01`, to = `${year + 1}-01-01`
    sb.from('activity').select('kind, payload, created_at').eq('user_id', me.id).gte('created_at', from).lt('created_at', to).then(({ data }) => {
      const a = data || []
      const trades = a.filter(x => x.kind === 'trade')
      const best = trades.filter(t => t.payload.pnl != null).sort((x, y) => y.payload.pnl - x.payload.pnl)[0]
      setRanked({
        trades: trades.length, best,
        ratings: a.filter(x => x.kind === 'rate').length,
        achievements: a.filter(x => x.kind === 'achievement').map(x => ACH[x.payload.key]).filter(Boolean),
        bets: a.filter(x => x.kind === 'bet_won').length,
      })
    })
  }, [year, me?.id])

  const s = useMemo(() => {
    const done = list.filter(e => e.completedAt?.year === year)
    if (!done.length) return null
    const mins = done.reduce((a, e) => a + (e.media.episodes || e.progress) * (e.media.duration || 24), 0)
    const g = {}; done.forEach(e => e.media.genres.forEach(x => { g[x] = (g[x] || 0) + 1 }))
    const genres = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const months = Array(12).fill(0); done.forEach(e => { if (e.completedAt.month) months[e.completedAt.month - 1]++ })
    const peak = months.indexOf(Math.max(...months))
    const byDate = [...done].filter(e => e.completedAt.month).sort((a, b) => (a.completedAt.month * 40 + (a.completedAt.day || 0)) - (b.completedAt.month * 40 + (b.completedAt.day || 0)))
    const top = [...done].filter(e => e.score).sort((a, b) => b.score - a.score).slice(0, 5)
    const longest = [...done].sort((a, b) => (b.media.episodes || 0) * (b.media.duration || 24) - (a.media.episodes || 0) * (a.media.duration || 24))[0]
    const eps = done.reduce((a, e) => a + (e.media.episodes || e.progress), 0)
    return { done, hours: Math.round(mins / 60), eps, genres, months, peak, first: byDate[0], last: byDate[byDate.length - 1], top, longest }
  }, [list, year])

  const maxM = s ? Math.max(...s.months, 1) : 1
  return (
    <div className="wrapped">
      <div className="row gap yearpick">
        {years.map(y => <button key={y} className={`pill ${y === year ? '' : 'ghost'}`} onClick={() => setYear(y)}>{y}</button>)}
      </div>
      <div className="slide hero">
        <div className="kicker">{user?.name}'s</div>
        <div className="mega">{year}</div>
        <div className="sub">Your year in anime.</div>
      </div>
      {!s ? <div className="card pad muted">No anime finished in {year} yet (AniList completion dates). Go finish something!</div> : <>
        <div className="slide s-time">
          <div className="kicker">This year you finished</div>
          <div className="huge">{s.done.length}<small>SHOWS</small></div>
          <div className="sub"><b>{s.eps.toLocaleString()}</b> episodes, about <b>{s.hours.toLocaleString()} hours</b>. That's <b>{(s.hours / 24).toFixed(1)} days</b> of anime.</div>
          {s.longest && <div className="sub small">Biggest commitment: <b>{title(s.longest.media)}</b> ({s.longest.media.episodes} eps)</div>}
        </div>
        <div className="slide s-score">
          <div className="kicker">Your anime calendar</div>
          <div className="huge sm">{MONTH_NAMES[s.peak].toUpperCase()}</div>
          <div className="sub">was your biggest month with <b>{s.months[s.peak]}</b> finished.</div>
          <div className="hist10 hist12">
            {s.months.map((n, i) => <div key={i} className="hcol"><b>{n || ''}</b><div style={{ height: `${(n / maxM) * 100}%` }} className={i === s.peak ? 'legend' : 'epic'} /><span>{MONTHS[i]}</span></div>)}
          </div>
          {s.first && <div className="sub small">First finish: <b>{title(s.first.media)}</b>. Latest: <b>{title(s.last.media)}</b>.</div>}
        </div>
        <div className="slide s-class">
          <div className="kicker">Top genres of {year}</div>
          <div className="bars">{s.genres.map(([g, n], i) => <div key={g} className="barrow"><span>{g}</span>
            <div className="bartrack"><div className={i === 0 ? 'legend' : i < 3 ? 'epic' : 'rare'} style={{ width: `${(n / s.genres[0][1]) * 100}%` }} /></div><b>{n}</b></div>)}</div>
        </div>
        {s.top.length > 0 && <div className="slide s-takes">
          <div className="kicker">Best of {year}</div>
          <div className="yeartop">{s.top.map((e, i) => <div key={e.media.id} className="bcard">
            <div className="cover" style={{ backgroundImage: `url(${e.media.coverImage.large})` }}><span className="score">#{i + 1} · {e.score}</span></div>
            <div className="bt">{title(e.media)}</div></div>)}</div>
        </div>}
      </>}
      {ranked && (ranked.trades || ranked.ratings || ranked.achievements.length) > 0 && <div className="slide s-era">
        <div className="kicker">On Ranked</div>
        <div className="chips">
          <span className="chip ghost">{ranked.trades} trades</span>
          <span className="chip ghost">{ranked.ratings} ratings</span>
          <span className="chip ghost">{ranked.bets} bets won</span>
          <span className="chip ghost">{ranked.achievements.length} achievements</span>
        </div>
        {ranked.best && <div className="sub">Best trade: sold <b>{ranked.best.payload.sym}</b> for <b className="up">+{ranked.best.payload.pnl}</b> coins.</div>}
        {ranked.achievements.length > 0 && <div className="sub small">{ranked.achievements.map(a => `${a.icon} ${a.label}`).join('  ·  ')}</div>}
      </div>}
    </div>
  )
}
