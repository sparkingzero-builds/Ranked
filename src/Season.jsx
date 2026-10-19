import { useEffect, useMemo, useState } from 'react'
import { sb } from './cloud.js'
import { title } from './api.js'

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
export function currentSeason(d = new Date()) {
  return { season: SEASONS[Math.floor(d.getMonth() / 3)], year: d.getFullYear() }
}
const countdown = s => s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`

async function fetchSeason({ season, year }) {
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `query($s:MediaSeason,$y:Int){ Page(perPage:40){ media(season:$s, seasonYear:$y, type:ANIME, isAdult:false, sort:POPULARITY_DESC){
      id title { romaji english } coverImage { large medium color } episodes averageScore genres format status nextAiringEpisode { episode timeUntilAiring } } } }`, variables: { s: season, y: year } }),
  }).then(r => r.json())
  return r.data.Page.media
}

// Rank this season's shows; your order is saved in user_state.extra.season[KEY], and the squad
// ranking is a points tally (1st = most points) across everyone's lists.
export default function Season({ list, extra, setExtra, me, openAnime }) {
  const [cur, setCur] = useState(currentSeason())
  const key = `${cur.season}-${cur.year}`
  const [shows, setShows] = useState(null)
  const [squad, setSquad] = useState([])
  const order = extra.season?.[key] || []
  const setOrder = o => setExtra({ ...extra, season: { ...(extra.season || {}), [key]: o } })

  useEffect(() => { setShows(null); fetchSeason(cur).then(setShows).catch(() => setShows([])) }, [key])
  useEffect(() => {
    if (!sb || !me) return
    sb.from('user_state').select('user_id, extra').then(({ data }) => {
      const pts = {}
      for (const r of data || []) {
        const o = r.extra?.season?.[key] || []
        o.forEach((id, i) => { pts[id] = (pts[id] || 0) + Math.max(1, 10 - i) })
      }
      setSquad(Object.entries(pts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, p]) => [Number(id), p]))
    })
  }, [key, order.length])

  const byId = useMemo(() => Object.fromEntries((shows || []).map(m => [m.id, m])), [shows])
  const status = useMemo(() => Object.fromEntries(list.map(e => [e.media.id, e])), [list])
  const shift = d => { const n = cur.year * 4 + SEASONS.indexOf(cur.season) + d; setCur({ season: SEASONS[n % 4], year: Math.floor(n / 4) }) }
  const move = (i, d) => { const o = [...order]; const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; setOrder(o) }

  return (
    <div className="rank">
      <section>
        <div className="row head">
          <div className="row gap">
            <button className="pill ghost" onClick={() => shift(-1)}>‹</button>
            <h3 className="m0">{cur.season} {cur.year}</h3>
            <button className="pill ghost" onClick={() => shift(1)}>›</button>
          </div>
          <span className="muted small">Tap + to add a show to your season ranking</span>
        </div>
        {!shows ? <div className="loading">Loading the season…</div> :
          <div className="seasongrid">
            {shows.map(m => {
              const e = status[m.id], ranked = order.indexOf(m.id)
              return (
                <div key={m.id} className="sshow">
                  <div className="cover linkish" onClick={() => openAnime(m.id)} style={{ backgroundImage: `url(${m.coverImage.large})` }}>
                    {m.nextAiringEpisode && <div className="air">Ep {m.nextAiringEpisode.episode}<br />{countdown(m.nextAiringEpisode.timeUntilAiring)}</div>}
                    {ranked >= 0 && <span className="score">#{ranked + 1}</span>}
                  </div>
                  <div className="bt">{title(m)}</div>
                  <div className="row smeta">
                    <span className="muted small">{e ? e.status.toLowerCase() : m.status === 'RELEASING' ? 'airing' : m.status.toLowerCase().replace(/_/g, ' ')}{m.averageScore ? ` · ${m.averageScore}%` : ''}</span>
                    <button className="x plus" onClick={() => ranked >= 0 ? setOrder(order.filter(x => x !== m.id)) : setOrder([...order, m.id])}>{ranked >= 0 ? '−' : '+'}</button>
                  </div>
                </div>
              )
            })}
          </div>}
      </section>
      <aside>
        <h3>Your season ranking</h3>
        <div className="card pad">
          {order.map((id, i) => byId[id] && <div key={id} className="mini sr">
            <b className={`r r${i + 1}`}>#{i + 1}</b><img src={byId[id].coverImage.medium} alt="" /><span className="grow">{title(byId[id])}</span>
            <button className="x" onClick={() => move(i, -1)}>↑</button><button className="x" onClick={() => move(i, 1)}>↓</button>
            <button className="x" onClick={() => setOrder(order.filter(x => x !== id))}>×</button>
          </div>)}
          {!order.length && <span className="muted">Add shows from the grid to rank this season.</span>}
        </div>
        {sb && me && <>
          <h3>Squad ranking</h3>
          <div className="card pad">
            {squad.map(([id, p], i) => byId[id] && <div key={id} className="mini">
              <b className={`r r${i + 1}`}>#{i + 1}</b><img src={byId[id].coverImage.medium} alt="" /><span className="grow">{title(byId[id])}</span><span className="muted">{p} pts</span>
            </div>)}
            {!squad.length && <span className="muted">Nobody has ranked this season yet.</span>}
          </div>
        </>}
      </aside>
    </div>
  )
}
