import { useEffect, useState } from 'react'
import { sb } from './cloud.js'
import { coins, pct } from './market.js'
import { fantasySeason } from './Fantasy.jsx'

// Tap any character anywhere to open their profile: form art, market price, hype breakdown, league owner + moments.
export const openChar = id => window.dispatchEvent(new CustomEvent('ranked:char', { detail: id }))

const KIND = { episode: '📺 New episode', chapter: '📖 New chapter', wiki: '📈 Wikipedia spike', fans: '💜 New fans', trending: '🔥 Trending', break: '💤 On break',
  transform: '⚡ Power-up', win: '🏆 Won a fight', appear: '👀 Appeared', lose: '💥 Lost a fight', death: '💀 Died', revive: '✨ Came back' }

function Spark({ prices }) {
  if (prices.length < 2) return null
  const lo = Math.min(...prices), hi = Math.max(...prices), W = 300, H = 70
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * W},${H - ((p - lo) / (hi - lo || 1)) * (H - 6) - 3}`).join(' ')
  const up = prices[prices.length - 1] >= prices[0]
  return <svg viewBox={`0 0 ${W} ${H}`} className="cpspark" preserveAspectRatio="none">
    <polyline points={pts} fill="none" stroke={up ? '#3ddc97' : '#ff4d6d'} strokeWidth="2.5" />
  </svg>
}

export default function CharProfile({ friends = [] }) {
  const [id, setId] = useState(null)
  const [c, setC] = useState(null)
  const [ticks, setTicks] = useState([])
  const [owner, setOwner] = useState(null)
  const [moments, setMoments] = useState([])
  useEffect(() => {
    const on = e => setId(e.detail)
    window.addEventListener('ranked:char', on)
    return () => window.removeEventListener('ranked:char', on)
  }, [])
  useEffect(() => {
    if (!id || !sb) return
    setC(null); setTicks([]); setOwner(null); setMoments([])
    const S = fantasySeason()
    sb.from('characters').select('*').eq('id', id).maybeSingle().then(({ data }) => setC(data || { missing: true }))
    sb.from('price_ticks').select('t, price').eq('char_id', id).gt('t', new Date(Date.now() - 7 * 86400000).toISOString()).order('t').limit(1000)
      .then(({ data }) => setTicks((data || []).filter((_, i, a) => i % Math.ceil(a.length / 80 || 1) === 0).map(r => +r.price)))
    sb.from('fantasy_picks').select('user_id').eq('season', S.key).eq('char_id', id).maybeSingle().then(({ data }) => setOwner(data?.user_id || null))
    sb.from('fantasy_events').select('*').eq('season', S.key).eq('char_id', id).eq('status', 'confirmed').order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setMoments(data || []))
  }, [id])
  useEffect(() => {
    if (!id) return
    const esc = e => e.key === 'Escape' && setId(null)
    window.addEventListener('keydown', esc); document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [id])
  if (!id) return null

  const parts = Object.entries(c?.hype_parts || {}).filter(([, v]) => v && v.label)
  const total = moments.reduce((a, e) => a + e.points, 0)
  const change = c && c.base ? (c.price - c.base) / c.base : 0
  const ownerName = friends.find(f => f.id === owner)?.username
  return <div className="cpbg" onClick={() => setId(null)}>
    <div className="cp" onClick={e => e.stopPropagation()} style={{ '--c': c?.color || '#7b5cff' }}>
      <button className="cpx" onClick={() => setId(null)} aria-label="Close">✕</button>
      {!c ? <div className="pad muted">Loading…</div> : c.missing ? <div className="pad muted">This character isn't on the market or in the league yet.</div> : <>
        <div className="cphead">
          <div className="cpimg"><img src={c.image} alt="" referrerPolicy="origin" />{c.form && <i className="fform">{c.form}</i>}</div>
          <div className="cpwho">
            <div className="kicker">${c.sym}</div>
            <h2>{c.name}</h2>
            <div className="muted">{c.media_title}</div>
            <div className="cpstats">
              <div><b>{coins(c.price)}</b><span>price</span></div>
              <div><b className={change >= 0 ? 'up' : 'down'}>{pct(change)}</b><span>vs base</span></div>
              <div><b>{Math.round((c.hype || 0) * 100)}</b><span>hype</span></div>
              {c.favourites != null && <div><b>{c.favourites.toLocaleString()}</b><span>fans</span></div>}
            </div>
          </div>
        </div>
        <Spark prices={ticks} />
        {c.event_label && new Date(c.event_until) > new Date() && <div className="cpevent">🔥 {c.event_label}</div>}

        <h3>Fantasy League</h3>
        <div className="cpleague">
          {owner ? <><span>On <b>{ownerName || 'a squad'}</b>'s team</span><b className={total < 0 ? 'down' : 'up'}>{total} pts</b></> : <span className="muted">Free agent: nobody has drafted them this season</span>}
        </div>
        {moments.length > 0 && <div className="cpmoments">{moments.map(e => <div key={e.id} className="lrow">
          <div className="grow small"><b>{KIND[e.kind] || e.kind}</b><div className="muted">{e.note}{e.link && <> · <a href={e.link} target="_blank" rel="noreferrer">source</a></>}</div></div>
          <b className={e.points < 0 ? 'down' : 'up'}>{e.points > 0 ? '+' : ''}{e.points}</b>
        </div>)}</div>}

        {parts.length > 0 && <><h3>Why the hype</h3>
          <div className="cpparts">{parts.map(([k, v]) => <div key={k}><span>{k}</span><div className="cpbar"><div style={{ width: `${Math.max(3, Math.min(100, Math.abs(v.score) * 100))}%` }} /></div><em>{v.label}</em></div>)}</div></>}
      </>}
    </div>
  </div>
}
