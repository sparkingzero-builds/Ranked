import { useEffect, useState } from 'react'
import { sb, logActivity } from './cloud.js'
import { coins } from './market.js'

async function searchChars(q) {
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `query($q:String){ Page(perPage:18){ characters(search:$q, sort:FAVOURITES_DESC){ id name { full } image { large }
      media(perPage:1, sort:POPULARITY_DESC){ nodes { title { romaji english } } } } } }`, variables: { q } }),
  }).then(r => r.json()).catch(() => null)
  return (r?.data?.Page?.characters || []).map(c => ({ id: c.id, name: c.name.full, image: c.image.large, show: c.media.nodes[0] ? (c.media.nodes[0].title.english || c.media.nodes[0].title.romaji) : '' }))
}

// Top 10 characters, saved in user_state.extra.chars; shows each one's market price if it's listed.
export default function CharRank({ extra, setExtra }) {
  const chars = extra.chars || []
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [prices, setPrices] = useState({})
  const set = list => {
    if (list[0] && list[0].id !== chars[0]?.id) logActivity('char_top', { name: list[0].name, cover: list[0].image })
    setExtra({ ...extra, chars: list.slice(0, 10) })
  }
  useEffect(() => {
    const t = setTimeout(() => searchChars(q || null).then(setRes), 350)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    if (!sb || !chars.length) return
    sb.from('characters').select('id, sym, price').in('id', chars.map(c => c.id)).then(({ data }) => setPrices(Object.fromEntries((data || []).map(c => [c.id, c]))))
  }, [chars.length])
  const move = (i, d) => { const o = [...chars]; const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; set(o) }

  return (
    <div className="rank">
      <section>
        <div className="podium">
          {[1, 0, 2].map(i => {
            const c = chars[i]
            return <div key={i} className={`pod p${i + 1}`}>
              {c ? <div className="cover big" style={{ backgroundImage: `url(${c.image})` }} /> : <div className="cover big empty" />}
              <b>#{i + 1}</b><span>{c ? c.name : 'Pick a character'}</span>
            </div>
          })}
        </div>
        <div className="card">
          {chars.map((c, i) => (
            <div key={c.id} className="slot">
              <b className="num">#{i + 1}</b><img src={c.image} alt="" />
              <div className="grow">{c.name}<div className="muted small">{c.show}</div></div>
              {prices[c.id] && <span className="cprice" title="On the market">${prices[c.id].sym} {coins(prices[c.id].price)}</span>}
              <button className="x" onClick={() => move(i, -1)}>↑</button><button className="x" onClick={() => move(i, 1)}>↓</button>
              <button className="x" onClick={() => set(chars.filter(x => x.id !== c.id))}>×</button>
            </div>
          ))}
          {!chars.length && <div className="pad muted">Search for characters on the right and add up to 10.</div>}
        </div>
      </section>
      <aside>
        <h3>Find characters</h3>
        <input className="search" placeholder="Search characters…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="card pool">
          {res.map(c => {
            const inList = chars.some(x => x.id === c.id)
            return <div key={c.id} className="lrow drag" onClick={() => !inList && chars.length < 10 && set([...chars, c])}>
              <img src={c.image} alt="" /><div className="grow">{c.name}<div className="muted small">{c.show}</div></div>
              <button className="x plus">{inList ? '✓' : '+'}</button>
            </div>
          })}
        </div>
      </aside>
    </div>
  )
}
