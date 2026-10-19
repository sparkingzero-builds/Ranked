import { useMemo } from 'react'
import { title } from './api.js'

const CLASSES = {
  Action: ['Brawler', 'You live for the fight scenes.'],
  Adventure: ['Explorer', 'Always chasing the next arc.'],
  Comedy: ['Jester', "If it doesn't make you laugh, you're out."],
  Drama: ['Empath', 'You watch for the feels.'],
  Fantasy: ['Archmage', 'Magic systems are your love language.'],
  Romance: ['Heartthrob', 'Ship captain, certified.'],
  'Sci-Fi': ['Technomancer', 'Mechs, space and big ideas.'],
  'Slice of Life': ['Wanderer', 'Cosy vibes over chaos.'],
  Sports: ['Champion', 'Every match is the final.'],
  Mystery: ['Detective', 'You clocked the twist in episode 2.'],
  Psychological: ['Mind Breaker', 'The darker the better.'],
  Supernatural: ['Spirit Walker', 'Ghosts, curses and demons, all day.'],
  Horror: ['Survivor', 'Fear is just another genre.'],
}

export default function Stats({ list, user }) {
  const s = useMemo(() => compute(list), [list])
  if (!s) return <div className="loading">No anime to crunch yet.</div>
  const [cls, blurb] = CLASSES[s.genres[0]?.[0]] || ['Otaku', 'You watch a bit of everything.']
  const maxG = s.genres[0]?.[1] || 1
  const maxS = Math.max(...s.spread, 1)
  const maxD = Math.max(...s.decades.map(d => d[1]), 1)

  return (
    <div className="wrapped">
      <div className="slide hero">
        <div className="kicker">{user?.name}'s anime</div>
        <div className="mega">WRAPPED</div>
        <div className="sub">Everything you've ever watched, crunched into stats.</div>
      </div>

      <div className="slide s-time">
        <div className="kicker">Time in the anime world</div>
        <div className="huge">{s.hours.toLocaleString()}<small>HRS</small></div>
        <div className="sub">That's <b>{s.days} days</b> straight, across <b>{s.episodes.toLocaleString()}</b> episodes and <b>{s.watched}</b> shows.</div>
        <div className="chips">
          <span className="chip legend">{s.completed} completed</span>
          <span className="chip epic">{s.current} watching</span>
          <span className="chip rare">{s.paused} paused</span>
          <span className="chip bad">{s.dropped} dropped</span>
        </div>
        {s.longest && <div className="sub small">Longest grind: <b>{title(s.longest.media)}</b>, {Math.round(s.longest.progress * (s.longest.media.duration || 24) / 60)} hrs</div>}
      </div>

      <div className="slide s-class">
        <div className="kicker">Your class</div>
        <div className="huge">{cls.toUpperCase()}</div>
        <div className="sub">{blurb}</div>
        <div className="bars">
          {s.genres.slice(0, 7).map(([g, n], i) => (
            <div key={g} className="barrow">
              <span>{g}</span>
              <div className="bartrack"><div className={i === 0 ? 'legend' : i < 3 ? 'epic' : 'rare'} style={{ width: `${(n / maxG) * 100}%` }} /></div>
              <b>{n}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="slide s-score">
        <div className="kicker">Score spread</div>
        <div className="row2">
          <div><div className="huge">{s.mean}</div><div className="sub">your average score</div></div>
          <div className="verdict">{s.critic}</div>
        </div>
        <div className="hist10">
          {s.spread.map((n, i) => (
            <div key={i} className="hcol" title={`${n} anime scored ${i + 1}`}>
              <b>{n || ''}</b>
              <div style={{ height: `${(n / maxS) * 100}%` }} className={i >= 8 ? 'legend' : i >= 6 ? 'epic' : i >= 4 ? 'rare' : 'bad'} />
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="sub small">Most given score: <b>{s.mode}</b>. Perfect 10s: <b>{s.spread[9]}</b></div>
      </div>

      {(s.hotUp.length > 0 || s.hotDown.length > 0) && <div className="slide s-takes">
        <div className="kicker">Hot takes</div>
        <div className="huge sm">YOU vs THE WORLD</div>
        <div className="takes">
          <div>
            <h4>You rate higher</h4>
            {s.hotUp.map(t => <Take key={t.media.id} t={t} />)}
          </div>
          <div>
            <h4>You rate lower</h4>
            {s.hotDown.map(t => <Take key={t.media.id} t={t} />)}
          </div>
        </div>
      </div>}

      <div className="slide s-era">
        <div className="kicker">Your era</div>
        <div className="huge">{s.decades.length ? `${s.topDecade}s` : '?'}</div>
        <div className="sub">The decade you've watched the most from. Oldest show: <b>{s.oldest ? `${title(s.oldest)} (${s.oldest.seasonYear})` : '?'}</b></div>
        <div className="decades">
          {s.decades.map(([d, n]) => <div key={d} className="dcol"><div style={{ height: `${(n / maxD) * 100}%` }} /><span>{String(d).slice(2)}s</span></div>)}
        </div>
        <div className="chips">{s.formats.map(([f, n]) => <span key={f} className="chip ghost">{f.replace('_', ' ')} · {n}</span>)}</div>
      </div>
    </div>
  )
}

function Take({ t }) {
  return <div className="take">
    <img src={t.media.coverImage.medium} alt="" />
    <span className="grow">{title(t.media)}</span>
    <b className="you">{t.score}</b><span className="muted">vs</span><b className="them">{(t.media.averageScore / 10).toFixed(1)}</b>
  </div>
}

function compute(list) {
  const seen = list.filter(e => e.status !== 'PLANNING')
  if (!seen.length) return null
  const count = st => list.filter(e => e.status === st || (st === 'COMPLETED' && e.status === 'REPEATING')).length
  const progOf = e => e.status === 'COMPLETED' ? (e.media.episodes || e.progress) : e.progress
  const mins = seen.reduce((a, e) => a + progOf(e) * (e.media.duration || 24), 0)
  const episodes = seen.reduce((a, e) => a + progOf(e), 0)
  const longest = [...seen].sort((a, b) => progOf(b) * (b.media.duration || 24) - progOf(a) * (a.media.duration || 24))[0]

  const g = {}
  seen.forEach(e => e.media.genres.forEach(x => { g[x] = (g[x] || 0) + 1 }))
  const genres = Object.entries(g).sort((a, b) => b[1] - a[1])

  const scored = seen.filter(e => e.score)
  const spread = Array(10).fill(0)
  scored.forEach(e => { spread[Math.min(9, Math.max(0, Math.round(e.score) - 1))]++ })
  const mean = scored.length ? (scored.reduce((a, e) => a + e.score, 0) / scored.length).toFixed(1) : '–'
  const community = scored.filter(e => e.media.averageScore)
  const bias = community.length ? community.reduce((a, e) => a + e.score - e.media.averageScore / 10, 0) / community.length : 0
  const critic = bias > 0.6 ? 'GENEROUS HERO' : bias < -0.6 ? 'HARSH CRITIC' : 'FAIR JUDGE'
  const mode = spread.indexOf(Math.max(...spread)) + 1

  const diffs = community.map(e => ({ ...e, d: e.score - e.media.averageScore / 10 }))
  const hotUp = diffs.filter(x => x.d >= 1).sort((a, b) => b.d - a.d).slice(0, 4)
  const hotDown = diffs.filter(x => x.d <= -1).sort((a, b) => a.d - b.d).slice(0, 4)

  const dec = {}
  seen.forEach(e => { const y = e.media.seasonYear; if (y) dec[Math.floor(y / 10) * 10] = (dec[Math.floor(y / 10) * 10] || 0) + 1 })
  const decades = Object.entries(dec).map(([d, n]) => [Number(d), n]).sort((a, b) => a[0] - b[0])
  const topDecade = decades.length ? [...decades].sort((a, b) => b[1] - a[1])[0][0] : null
  const oldest = seen.map(e => e.media).filter(m => m.seasonYear).sort((a, b) => a.seasonYear - b.seasonYear)[0]
  const f = {}
  seen.forEach(e => { if (e.media.format) f[e.media.format] = (f[e.media.format] || 0) + 1 })
  const formats = Object.entries(f).sort((a, b) => b[1] - a[1])

  return {
    hours: Math.round(mins / 60), days: (mins / 1440).toFixed(1), episodes, watched: seen.length, longest,
    completed: count('COMPLETED'), current: count('CURRENT'), paused: count('PAUSED'), dropped: count('DROPPED'),
    genres, spread, mean, critic, mode, hotUp, hotDown, decades, topDecade, oldest, formats,
  }
}
