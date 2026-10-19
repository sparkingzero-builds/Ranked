import { useEffect, useState } from 'react'
import { fetchList, searchAnime, title } from './api.js'
import { useStored } from './App.jsx'
import { sb } from './cloud.js'

const EMOJIS = ['🔥', '😭', '😂', '🤯', '😍', '💀', '😴', '😡']

// Watch-alongs live in Supabase when signed in (shared with the mate, live updates),
// otherwise in localStorage. Both paths produce the same shape:
// { id, media, mate (AniList name), mateName, eps: {n: reaction}, mateEps: {n: reaction} }
function useWatches(me, friends) {
  const [local, setLocal] = useStored('ranked.watch', [])
  const [cloud, setCloud] = useState(null)
  const online = !!(sb && me)

  async function load() {
    const { data: ws } = await sb.from('watch_alongs').select('*').order('created_at', { ascending: false })
    const ids = (ws || []).map(w => w.id)
    const { data: rs } = ids.length ? await sb.from('reactions').select('*').in('watch_id', ids) : { data: [] }
    const byId = Object.fromEntries(friends.map(f => [f.id, f]))
    setCloud((ws || []).map(w => {
      const other = byId[w.owner === me.id ? w.mate : w.owner] || {}
      const eps = {}, mateEps = {}
      rs.filter(r => r.watch_id === w.id).forEach(r => {
        (r.user_id === me.id ? eps : mateEps)[r.ep] = { emoji: r.emoji || '', score: r.score ?? undefined, note: r.note || '' }
      })
      return { id: w.id, media: w.media, mate: other.anilist_name || '', mateName: other.username || '?', eps, mateEps }
    }))
  }

  useEffect(() => {
    if (!online || !friends.length) return
    load()
    const ch = sb.channel('reactions-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_alongs' }, load)
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [online, friends.length])

  if (!online) return {
    watches: local.map(w => ({ ...w, mateName: w.mate, mateEps: {} })),
    create: async ({ media, mate }) => { const w = { id: Date.now().toString(36), media, mate, created: Date.now(), eps: {} }; setLocal([w, ...local]); return w.id },
    remove: id => setLocal(local.filter(x => x.id !== id)),
    saveEp: (w, ep, r) => setLocal(ls => ls.map(x => {
      if (x.id !== w.id) return x
      const eps = { ...x.eps }; if (r) eps[ep] = r; else delete eps[ep]
      return { ...x, eps }
    })),
  }

  return {
    watches: cloud,
    create: async ({ media, mateId }) => {
      const m = { id: media.id, title: media.title, coverImage: media.coverImage, episodes: media.episodes, nextAiringEpisode: media.nextAiringEpisode }
      const { data, error } = await sb.from('watch_alongs').insert({ media: m, owner: me.id, mate: mateId }).select().single()
      if (error) { alert(error.message); return null }
      await load(); return data.id
    },
    remove: async id => { await sb.from('watch_alongs').delete().eq('id', id); load() },
    saveEp: async (w, ep, r) => {
      setCloud(cs => cs.map(x => {
        if (x.id !== w.id) return x
        const eps = { ...x.eps }; if (r) eps[ep] = r; else delete eps[ep]
        return { ...x, eps }
      }))
      if (r) await sb.from('reactions').upsert({ watch_id: w.id, user_id: me.id, ep, emoji: r.emoji || null, score: r.score ?? null, note: r.note || null, updated_at: new Date().toISOString() })
      else await sb.from('reactions').delete().match({ watch_id: w.id, user_id: me.id, ep })
    },
  }
}

export default function WatchAlong({ list, me, friends = [] }) {
  const { watches, create, remove, saveEp } = useWatches(me, friends)
  const [mates] = useStored('ranked.mates', [])
  const [activeId, setActiveId] = useState(null)
  const [creating, setCreating] = useState(false)
  if (!watches) return <div className="loading">Loading watch-alongs…</div>
  const active = watches.find(w => w.id === activeId)
  const squad = friends.filter(f => f.id !== me?.id)

  return (
    <div className="rank">
      <section>
        {creating ? <NewWatch list={list} mates={mates} squad={sb && me ? squad : null} onCancel={() => setCreating(false)}
          onCreate={async w => { const id = await create(w); if (id) { setActiveId(id); setCreating(false) } }} />
          : active ? <WatchRoom w={active} list={list} saveEp={saveEp} />
          : <div className="card pad muted">Start a watch-along: pick a show and a mate, then you both react to every episode.</div>}
      </section>
      <aside>
        <div className="row"><h3>Watch-alongs</h3><button className="pill" onClick={() => setCreating(true)}>+ New</button></div>
        <div className="card">
          {watches.map(w => (
            <div key={w.id} className={`lrow drag ${activeId === w.id ? 'sel' : ''}`} onClick={() => { setActiveId(w.id); setCreating(false) }}>
              <img src={w.media.coverImage.medium} alt="" />
              <div className="grow">{title(w.media)}
                <div className="muted small">with {w.mateName} · you {Object.keys(w.eps).length} / them {Object.keys(w.mateEps).length} reacted</div></div>
              <button className="x" onClick={e => {
                e.stopPropagation()
                if (confirm('Delete this watch-along?')) { remove(w.id); if (activeId === w.id) setActiveId(null) }
              }}>×</button>
            </div>
          ))}
          {!watches.length && <div className="pad muted">None yet.</div>}
        </div>
      </aside>
    </div>
  )
}

function NewWatch({ list, mates, squad, onCreate, onCancel }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [media, setMedia] = useState(null)
  const [mate, setMate] = useState(squad ? squad[0]?.id || '' : mates[0] || '')
  const mine = list.filter(e => ['CURRENT', 'PLANNING', 'PAUSED'].includes(e.status)).map(e => e.media)
  useEffect(() => {
    if (!q) { setRes([]); return }
    const t = setTimeout(() => searchAnime(q).then(setRes).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [q])
  const shown = q ? res : mine
  return (
    <div className="card pad">
      <h2 className="h2">New watch-along</h2>
      <label className="lbl">Watching with</label>
      {squad ? (squad.length
        ? <select className="search" value={mate} onChange={e => setMate(e.target.value)}>{squad.map(f => <option key={f.id} value={f.id}>{f.username}</option>)}</select>
        : <div className="muted pad">No friends have joined yet. Send them the link!</div>)
        : <>
          <input className="search" list="matelist" placeholder="Mate's AniList username" value={mate} onChange={e => setMate(e.target.value)} />
          <datalist id="matelist">{mates.map(m => <option key={m} value={m} />)}</datalist>
        </>}
      <label className="lbl">Show {media && <b className="blue">· {title(media)}</b>}</label>
      <input className="search" placeholder="Search, or pick from your watching / planning list below" value={q} onChange={e => setQ(e.target.value)} />
      <div className="coverrow pick">
        {shown.slice(0, 18).map(m => (
          <div key={m.id} className={`bcard ${media?.id === m.id ? 'chosen' : ''}`} onClick={() => setMedia(m)}>
            <div className="cover" style={{ backgroundImage: `url(${m.coverImage.large})` }} />
            <div className="bt">{title(m)}</div>
          </div>
        ))}
      </div>
      <div className="row gap end">
        <button className="pill ghost" onClick={onCancel}>Cancel</button>
        <button className="pill" disabled={!media || !String(mate).trim()} onClick={() =>
          onCreate(squad ? { media, mateId: mate } : { media, mate: mate.trim() })}>Start watching</button>
      </div>
    </div>
  )
}

function WatchRoom({ w, list, saveEp }) {
  const [alProg, setAlProg] = useState(null)
  const [sel, setSel] = useState(null)
  useEffect(() => {
    setAlProg(null); setSel(null)
    if (!w.mate) { setAlProg(0); return }
    fetchList(w.mate).then(l => setAlProg(l.find(e => e.media.id === w.media.id)?.progress ?? 0)).catch(() => setAlProg(0))
  }, [w.id])

  const reacted = Object.keys(w.eps).map(Number)
  const mateReacted = Object.keys(w.mateEps).map(Number)
  const total = w.media.episodes || (w.media.nextAiringEpisode ? w.media.nextAiringEpisode.episode - 1 : 0) || Math.max(12, ...reacted, ...mateReacted)
  const myAl = list.find(e => e.media.id === w.media.id)?.progress ?? 0
  const myProg = Math.max(myAl, ...reacted, 0)
  const mate = Math.max(alProg || 0, ...mateReacted, 0)
  const diff = myProg - mate
  const plural = n => `${n} ep${n > 1 ? 's' : ''}`
  const status = alProg == null ? 'Checking progress…' :
    diff > 0 ? `You're ${plural(diff)} ahead. No spoilers!` : diff < 0 ? `${w.mateName} is ${plural(-diff)} ahead. Catch up!` : 'Neck and neck'
  const ep = sel ? (w.eps[sel] || {}) : null
  const setEp = patch => saveEp(w, sel, { ...ep, ...patch })
  const scored = reacted.filter(n => w.eps[n].score).sort((a, b) => a - b)
  const best = scored.length ? scored.reduce((a, b) => w.eps[b].score > w.eps[a].score ? b : a) : null
  const spoiler = n => n > mate
  const theirs = sel && w.mateEps[sel]
  const canSeeTheirs = sel && (w.eps[sel] || sel <= myProg)

  return (
    <>
      <div className="card room" style={{ '--c': w.media.coverImage.color || '#ffd60a' }}>
        <div className="roomhead" style={{ backgroundImage: `url(${w.media.coverImage.large})` }} />
        <div className="pad">
          <h2 className="h2">{title(w.media)}</h2>
          <div className="race">
            <span>You</span><div className="track"><div style={{ width: `${Math.min(100, (myProg / total) * 100)}%` }} /></div><b>{myProg}</b>
            <span className="ellip">{w.mateName}</span><div className="track mate"><div style={{ width: `${Math.min(100, (mate / total) * 100)}%` }} /></div><b>{mate}</b>
          </div>
          <div className="status">{status}</div>
        </div>
      </div>

      <h3>Episodes</h3>
      <div className="eps">
        {Array.from({ length: total }, (_, i) => i + 1).map(n => (
          <button key={n} className={`ep ${w.eps[n] ? 'done' : ''} ${sel === n ? 'on' : ''} ${spoiler(n) ? 'ahead' : ''}`}
            onClick={() => setSel(n)} title={spoiler(n) ? `${w.mateName} hasn't seen this yet` : ''}>
            <span className="n">{n}</span><span className="e">{w.eps[n]?.emoji || ''}</span>
            {w.mateEps[n]?.emoji && (w.eps[n] || n <= myProg) && <span className="me2">{w.mateEps[n].emoji}</span>}
          </button>
        ))}
      </div>

      {sel && <div className="card pad react">
        <div className="row"><h3 className="m0">Episode {sel}</h3>{spoiler(sel) && <span className="tag">{w.mateName} hasn't seen this, so keep it spoiler-free</span>}</div>
        {theirs && (canSeeTheirs
          ? <div className="theirs"><b>{w.mateName}</b> {theirs.emoji} {theirs.score ? <span className="blue">hype {theirs.score}/10</span> : ''}{theirs.note && <div>"{theirs.note}"</div>}</div>
          : <div className="theirs muted">{w.mateName} reacted to this one. Watch it to unlock their reaction 🔒</div>)}
        <div className="emojis">{EMOJIS.map(em =>
          <button key={em} className={ep.emoji === em ? 'on' : ''} onClick={() => setEp({ emoji: ep.emoji === em ? '' : em })}>{em}</button>)}</div>
        <label className="slider"><span>Hype</span>
          <input type="range" min="1" max="10" value={ep.score ?? 5} onChange={e => setEp({ score: +e.target.value })} /><b>{ep.score ?? '–'}</b></label>
        <NoteBox key={`${w.id}-${sel}`} value={ep.note || ''} onSave={note => setEp({ note })} />
        <div className="row end gap">
          {w.eps[sel] && <button className="pill ghost" onClick={() => { saveEp(w, sel, null); setSel(null) }}>Clear</button>}
          <button className="pill" onClick={() => { if (!w.eps[sel]) setEp({}); setSel(sel < total ? sel + 1 : null) }}>
            {sel < total ? 'Next episode →' : 'Done'}</button>
        </div>
      </div>}

      {scored.length > 1 && <>
        <h3>Hype chart {best && <small className="muted">· peak: ep {best}</small>}</h3>
        <div className="card pad hype">
          {scored.map(n => (
            <div key={n} className="hb" title={`Ep ${n}: ${w.eps[n].score}`} onClick={() => setSel(n)}>
              <div style={{ height: `${w.eps[n].score * 10}%` }} className={n === best ? 'peak' : ''} /><span>{n}</span>
            </div>
          ))}
        </div>
      </>}
    </>
  )
}

// Saves notes on pause/blur instead of on every keystroke (avoids a DB write per letter)
function NoteBox({ value, onSave }) {
  const [v, setV] = useState(value)
  useEffect(() => {
    if (v === value) return
    const t = setTimeout(() => onSave(v), 800)
    return () => clearTimeout(t)
  }, [v])
  return <textarea className="search note" placeholder="Thoughts on this episode…" value={v} onChange={e => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
}
