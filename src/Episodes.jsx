import { useEffect, useState } from 'react'
import { sb, logActivity } from './cloud.js'
import { title } from './api.js'

// Same categories as show ratings, so episode scores line up with the rest of the app
export const EP_CATS = ['Story', 'Animation', 'Characters', 'Music', 'Peak moments']
const EMOJIS = ['🔥', '🤯', '😭', '😂', '😍', '💀', '😴', '😡']
const LOCAL = 'ranked.eprat'
const avg = s => +(EP_CATS.reduce((a, c) => a + (s?.[c] ?? 0), 0) / EP_CATS.length).toFixed(1)

function localAll() { try { return JSON.parse(localStorage.getItem(LOCAL)) || {} } catch { return {} } }

// All ratings for one show: online from Supabase (everyone's), offline from this browser.
export function useEpisodeRatings(mediaId, me) {
  const [rows, setRows] = useState([])
  const load = async () => {
    if (sb && me) {
      const { data } = await sb.from('episode_ratings').select('*').eq('media_id', mediaId)
      setRows(data || [])
    } else {
      setRows(Object.values(localAll()).filter(r => r.media_id === mediaId))
    }
  }
  useEffect(() => {
    load()
    if (!sb || !me) return
    const ch = sb.channel(`eprat-${mediaId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'episode_ratings', filter: `media_id=eq.${mediaId}` }, load).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [mediaId, me?.id])
  return { rows, reload: load }
}

// Episode grid + hype chart for the detail page
export function EpisodeSection({ m, me, friends, onRate, rows }) {
  const aired = m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : m.episodes || 0
  if (!aired) return null
  const myId = me?.id || 'local'
  const mine = Object.fromEntries(rows.filter(r => r.user_id === myId).map(r => [r.ep, r]))
  const squadAvg = ep => {
    const rs = rows.filter(r => r.ep === ep && r.overall != null)
    return rs.length ? (rs.reduce((a, r) => a + +r.overall, 0) / rs.length).toFixed(1) : null
  }
  const rated = Object.values(mine).sort((a, b) => a.ep - b.ep)
  const best = rated.length ? rated.reduce((a, b) => +b.overall > +a.overall ? b : a) : null
  return (
    <>
      <h3>Episodes <small className="muted">· tap one to rate it</small></h3>
      <div className="epgrid">
        {Array.from({ length: aired }, (_, i) => i + 1).map(ep => {
          const r = mine[ep], sq = squadAvg(ep)
          return <button key={ep} className={`epc ${r ? 'done' : ''} ${best?.ep === ep ? 'peak' : ''}`} onClick={() => onRate(ep)}>
            <span className="epn">EP {ep}</span>
            <b>{r ? r.overall : '–'}</b>
            <span className="epe">{r?.emoji || ''}</span>
            {sq && <small title="Squad average">👥 {sq}</small>}
          </button>
        })}
      </div>
      {rated.length > 1 && <>
        <h3>Your hype chart {best && <small className="muted">· peak: ep {best.ep} ({best.overall})</small>}</h3>
        <div className="card pad hype">
          {rated.map(r => <div key={r.ep} className="hb" title={`Ep ${r.ep}: ${r.overall}`} onClick={() => onRate(r.ep)}>
            <div style={{ height: `${r.overall * 10}%` }} className={best?.ep === r.ep ? 'peak' : ''} /><span>{r.ep}</span></div>)}
        </div>
      </>}
    </>
  )
}

// Rating window for one episode: the five categories, a reaction and a note, plus squad scores
export function EpisodeModal({ m, ep, me, friends = [], onClose, onSaved }) {
  const myId = me?.id || 'local'
  const [scores, setScores] = useState(() => Object.fromEntries(EP_CATS.map(c => [c, 7])))
  const [emoji, setEmoji] = useState('')
  const [note, setNote] = useState('')
  const [had, setHad] = useState(false)
  const [squad, setSquad] = useState([])
  const [busy, setBusy] = useState(false)
  const names = Object.fromEntries(friends.map(f => [f.id, f.username]))

  useEffect(() => {
    const apply = r => { if (r) { setScores({ ...Object.fromEntries(EP_CATS.map(c => [c, 7])), ...r.scores }); setEmoji(r.emoji || ''); setNote(r.note || ''); setHad(true) } }
    if (sb && me) {
      sb.from('episode_ratings').select('*').eq('media_id', m.id).eq('ep', ep).then(({ data }) => {
        apply((data || []).find(r => r.user_id === myId))
        setSquad((data || []).filter(r => r.user_id !== myId))
      })
    } else apply(localAll()[`${m.id}-${ep}`])
  }, [m.id, ep])

  async function save() {
    setBusy(true)
    const row = { media_id: m.id, ep, scores, overall: avg(scores), emoji: emoji || null, note: note.trim() || null, updated_at: new Date().toISOString() }
    if (sb && me) {
      const { error } = await sb.from('episode_ratings').upsert(row)
      if (error) { setBusy(false); return alert(error.message) }
      if (!had) logActivity('ep_rate', { title: title(m), cover: m.coverImage?.medium, ep, score: row.overall, emoji })
    } else {
      const all = localAll(); all[`${m.id}-${ep}`] = { ...row, user_id: 'local' }
      try { localStorage.setItem(LOCAL, JSON.stringify(all)) } catch {}
    }
    setBusy(false); onSaved?.(); onClose()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="card mbox epmodal" onClick={e => e.stopPropagation()}>
        <div className="mhead" style={{ backgroundImage: `url(${m.bannerImage || m.coverImage?.large})` }} />
        <div className="pad">
          <h2>{title(m)} · Ep {ep}</h2>
          {EP_CATS.map(c => (
            <label key={c} className="slider">
              <span>{c === 'Peak moments' ? 'Hype moments' : c}</span>
              <input type="range" min="0" max="10" step="0.5" value={scores[c]} onChange={e => setScores({ ...scores, [c]: +e.target.value })} />
              <b>{scores[c]}</b>
            </label>
          ))}
          <div className="emojis">{EMOJIS.map(e => <button key={e} className={emoji === e ? 'on' : ''} onClick={() => setEmoji(emoji === e ? '' : e)}>{e}</button>)}</div>
          <textarea className="search note" maxLength={500} placeholder="Thoughts on this episode… (squad only sees it after they rate it too)" value={note} onChange={e => setNote(e.target.value)} />
          {squad.length > 0 && <div className="epsquad">
            <div className="lbl">Squad</div>
            {squad.map(r => <div key={r.user_id} className="mini"><span className="grow">{names[r.user_id] || '?'}</span>
              <span>{r.emoji}</span><b className="blue">{r.overall}</b>
              {had ? (r.note && <div className="epnote">“{r.note}”</div>) : r.note && <div className="epnote muted">🔒 Rate it to see their note</div>}</div>)}
          </div>}
          <div className="row head"><div className="overall">Overall <b>{avg(scores)}</b></div>
            <div className="row gap"><button className="pill ghost" onClick={onClose}>{had ? 'Close' : 'Skip'}</button>
              <button className="pill" disabled={busy} onClick={save}>{had ? 'Update' : 'Save'}</button></div></div>
        </div>
      </div>
    </div>
  )
}
