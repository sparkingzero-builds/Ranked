import { useEffect, useState } from 'react'
import { fetchMediaDetail, title } from './api.js'
import { sb } from './cloud.js'
import { coins } from './market.js'
import { StatusPicker } from './App.jsx'
import { useEpisodeRatings, EpisodeSection, EpisodeModal } from './Episodes.jsx'

const CATS = ['Story', 'Animation', 'Characters', 'Music', 'Peak moments']
const clean = html => (html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim()
const countdown = s => s < 86400 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`

export default function Detail({ id, list, setStatus, setProgress, openRating, overall, friends = [], openAnime, openProfile, me }) {
  const { rows: epRows, reload: reloadEps } = useEpisodeRatings(id, me)
  const [rateEp, setRateEp] = useState(null)
  const [m, setM] = useState(null)
  const [err, setErr] = useState('')
  const [more, setMore] = useState(false)
  const [prices, setPrices] = useState({})
  const [squad, setSquad] = useState([])

  useEffect(() => {
    setM(null); setErr(''); setMore(false); window.scrollTo(0, 0)
    fetchMediaDetail(id).then(setM).catch(e => setErr(e.message))
  }, [id])
  useEffect(() => {
    if (!m || !sb) return
    const ids = m.characters.edges.map(e => e.node.id)
    sb.from('characters').select('id, sym, price, price_24h').in('id', ids).then(({ data }) => setPrices(Object.fromEntries((data || []).map(c => [c.id, c]))))
    sb.from('user_state').select('user_id, ratings').then(({ data }) => {
      const names = Object.fromEntries(friends.map(f => [f.id, f.username]))
      setSquad((data || []).map(r => {
        const v = r.ratings?.[id]
        return v ? { name: names[r.user_id] || '?', uid: r.user_id, score: (CATS.reduce((a, c) => a + (v[c] ?? 0), 0) / CATS.length).toFixed(1) } : null
      }).filter(Boolean).sort((a, b) => b.score - a.score))
    })
  }, [m])

  if (err) return <div className="card pad error">Couldn't load this anime: {err}</div>
  if (!m) return <div className="loading">Loading…</div>
  const entry = list.find(e => e.media.id === m.id)
  const eps = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : null)
  const desc = clean(m.description)
  const streams = m.externalLinks.filter(l => l.type === 'STREAMING')
  const squadAvg = squad.length ? (squad.reduce((a, s) => a + +s.score, 0) / squad.length).toFixed(1) : null

  return (
    <div className="detail">
      {rateEp && <EpisodeModal m={m} ep={rateEp} me={me} friends={friends} onClose={() => setRateEp(null)} onSaved={reloadEps} />}
      <div className="dbanner" style={{ backgroundImage: `url(${m.bannerImage || m.coverImage.large})` }} />
      <div className="dhead">
        <img className="dcover" src={m.coverImage.large} alt="" />
        <div className="dinfo">
          <h1>{title(m)}</h1>
          {m.title.english && m.title.romaji !== m.title.english && <div className="muted">{m.title.romaji}</div>}
          <div className="dmeta">
            {[m.format?.replace('_', ' '), m.season && `${m.season} ${m.seasonYear}`, eps && `${eps} eps`, m.duration && `${m.duration} min`,
              m.studios.nodes[0]?.name, m.status?.replace(/_/g, ' ')].filter(Boolean).map(x => <span key={x}>{x}</span>)}
          </div>
          <div className="dgenres">{m.genres.map(g => <span key={g}>{g}</span>)}</div>
          <div className="dscores">
            {m.averageScore && <div><b>{m.averageScore}%</b><span>AniList</span></div>}
            {squadAvg && <div><b>★ {squadAvg}</b><span>Squad</span></div>}
            {overall(m.id) && <div><b>★ {overall(m.id)}</b><span>You</span></div>}
            {m.nextAiringEpisode && <div><b>{countdown(m.nextAiringEpisode.timeUntilAiring)}</b><span>Ep {m.nextAiringEpisode.episode}</span></div>}
          </div>
          <div className="dactions">
            <StatusPicker m={m} status={entry?.status} setStatus={setStatus} />
            {entry && entry.status !== 'PLANNING' && <div className="prog">
              <button className="pill ghost" onClick={() => setProgress(m, Math.max(0, entry.progress - 1))}>−</button>
              <span><b>{entry.progress}</b>/{eps ?? '?'} eps</span>
              <button className="pill" disabled={eps && entry.progress >= eps} onClick={() => setProgress(m, entry.progress + 1)}>+1 ep</button>
            </div>}
            <button className="pill" onClick={() => openRating(m)}>{overall(m.id) ? `★ ${overall(m.id)} · Re-rate` : '★ Rate'}</button>
          </div>
        </div>
      </div>

      <div className="dgrid">
        <section>
          {desc && <>
            <h3>Synopsis</h3>
            <div className={`card pad dsyn ${more ? 'open' : ''}`}>{desc}</div>
            {desc.length > 420 && <button className="linkbtn" onClick={() => setMore(!more)}>{more ? 'Show less' : 'Read more'}</button>}
          </>}
          {m.trailer?.site === 'youtube' && <>
            <h3>Trailer</h3>
            <div className="dtrailer"><iframe src={`https://www.youtube-nocookie.com/embed/${m.trailer.id}`} title="Trailer" allowFullScreen loading="lazy" /></div>
          </>}
          <EpisodeSection m={m} me={me} friends={friends} rows={epRows} onRate={setRateEp} />
          <h3>Characters</h3>
          <div className="dchars">
            {m.characters.edges.map(({ role, node }) => {
              const p = prices[node.id]
              return <div key={node.id} className="dchar">
                <img src={node.image.large} alt="" />
                <div><b>{node.name.full}</b><span>{role.toLowerCase()}</span>
                  {p && <em className={p.price >= (p.price_24h || p.price) ? 'up' : 'down'}>${p.sym} {coins(p.price)}</em>}</div>
              </div>
            })}
          </div>
        </section>
        <aside>
          {streams.length > 0 && <>
            <h3>Where to watch</h3>
            <div className="card pad dlinks">{streams.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ '--lc': l.color || '#ffd60a' }}>▶ {l.site}</a>)}</div>
          </>}
          <h3>Squad ratings</h3>
          <div className="card pad">
            {squad.map(s => <div key={s.uid} className="mini"><span className="grow linkish" onClick={() => openProfile(s.uid)}>{s.name}</span><b className="blue">★ {s.score}</b></div>)}
            {!squad.length && <span className="muted">Nobody in the squad has rated this yet.</span>}
          </div>
          {m.relations.edges.filter(e => e.node.type === 'ANIME').length > 0 && <>
            <h3>Related</h3>
            <div className="card pad">
              {m.relations.edges.filter(e => e.node.type === 'ANIME').slice(0, 8).map(({ relationType, node }) =>
                <div key={node.id} className="mini linkish" onClick={() => openAnime(node.id)}>
                  <img src={node.coverImage.large} alt="" /><span className="grow">{title(node)}</span><span className="muted small">{relationType.toLowerCase().replace(/_/g, ' ')}</span></div>)}
            </div>
          </>}
        </aside>
      </div>

      {m.recommendations.nodes.filter(n => n.mediaRecommendation).length > 0 && <>
        <h3>If you like this</h3>
        <div className="coverrow">
          {m.recommendations.nodes.filter(n => n.mediaRecommendation).map(({ mediaRecommendation: r }) =>
            <div key={r.id} className="bcard" onClick={() => openAnime(r.id)}>
              <div className="cover" style={{ backgroundImage: `url(${r.coverImage.large})` }}>{r.averageScore && <span className="score">{r.averageScore}%</span>}</div>
              <div className="bt">{title(r)}</div>
            </div>)}
        </div>
      </>}
    </div>
  )
}
