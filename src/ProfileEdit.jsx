import { useEffect, useState } from 'react'
import { sb } from './cloud.js'
import { ACH } from './achievements.js'

const ACCENTS = ['#ffd60a', '#ff2e63', '#2be4ff', '#8cff5a', '#d76bff', '#ffb13b', '#4fd2ff', '#ffffff']

async function search(kind, q) {
  const query = kind === 'anime'
    ? `query($q:String){ Page(perPage:12){ media(search:$q, type:ANIME, sort:POPULARITY_DESC){ id title { romaji english } bannerImage coverImage { extraLarge large medium } } } }`
    : `query($q:String){ Page(perPage:12){ characters(search:$q, sort:FAVOURITES_DESC){ id name { full } image { large } } } }`
  const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { q: q || null } }) }).then(r => r.json()).catch(() => null)
  return kind === 'anime' ? r?.data?.Page?.media || [] : r?.data?.Page?.characters || []
}

// Edit your own profile: banner (any anime's banner), avatar (any character), bio, accent colour,
// featured achievement as a title, and up to 4 pinned anime.
export default function ProfileEdit({ me, unlocked, onClose, onSaved, songs = [] }) {
  const [f, setF] = useState({ banner: me.banner || '', avatar: me.avatar || '', bio: me.bio || '', accent: me.accent || '#ffd60a', title_key: me.title_key || '', showcase: me.showcase || [], anthem: me.anthem || '' })
  const [kind, setKind] = useState('anime')
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { const t = setTimeout(() => search(kind, q).then(setRes), 350); return () => clearTimeout(t) }, [q, kind])

  async function save() {
    setBusy(true); setErr('')
    const { data, error } = await sb.from('profiles').update(f).eq('id', me.id).select().single()
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved(data); onClose()
  }
  const pin = m => {
    if (f.showcase.some(x => x.id === m.id) || f.showcase.length >= 4) return
    setF({ ...f, showcase: [...f.showcase, { id: m.id, title: m.title.english || m.title.romaji, cover: m.coverImage.large }] })
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="card pedit" onClick={e => e.stopPropagation()}>
        <div className="pprev" style={{ '--acc': f.accent, backgroundImage: f.banner ? `url(${f.banner})` : undefined }}>
          {f.avatar && <img src={f.avatar} alt="" />}
          <div><b>{me.username}</b>{f.title_key && ACH[f.title_key] && <span className="ptitle">{ACH[f.title_key].icon} {ACH[f.title_key].label}</span>}</div>
        </div>
        <div className="pad pform">
          <label className="lbl">Bio</label>
          <textarea className="search note" maxLength={160} placeholder="Say something… (160 characters)" value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} />
          <label className="lbl">Accent colour</label>
          <div className="swatches">{ACCENTS.map(c => <button key={c} className={f.accent === c ? 'on' : ''} style={{ background: c }} onClick={() => setF({ ...f, accent: c })} />)}</div>
          <label className="lbl">Title (from your achievements)</label>
          <select className="search" value={f.title_key} onChange={e => setF({ ...f, title_key: e.target.value })}>
            <option value="">None</option>
            {[...unlocked].map(k => ACH[k] && <option key={k} value={k}>{ACH[k].icon} {ACH[k].label}</option>)}
          </select>
          {songs.length > 0 && <>
            <label className="lbl">Profile anthem (plays when someone taps it)</label>
            <select className="search" value={f.anthem} onChange={e => setF({ ...f, anthem: e.target.value })}>
              <option value="">None</option>
              {[...songs].sort((a, b) => a.anime.localeCompare(b.anime)).map(s => <option key={s.id} value={s.id}>{s.anime}: {s.title}</option>)}
            </select>
          </>}
          <label className="lbl">Pinned anime ({f.showcase.length}/4)</label>
          <div className="pins">{f.showcase.map(s => <div key={s.id} className="pin" style={{ backgroundImage: `url(${s.cover})` }}>
            <button className="x" onClick={() => setF({ ...f, showcase: f.showcase.filter(x => x.id !== s.id) })}>×</button></div>)}
            {!f.showcase.length && <span className="muted small">Search anime below and press Pin.</span>}</div>

          <div className="tabs pick2">
            <button className={kind === 'anime' ? 'on' : ''} onClick={() => setKind('anime')}>Anime: banner &amp; pins</button>
            <button className={kind === 'char' ? 'on' : ''} onClick={() => setKind('char')}>Character: avatar</button>
          </div>
          <input className="search" placeholder={kind === 'anime' ? 'Search anime…' : 'Search characters…'} value={q} onChange={e => setQ(e.target.value)} />
          <div className="presults">
            {res.map(r => kind === 'anime'
              ? <div key={r.id} className="pres"><img src={r.coverImage.medium} alt="" /><span className="grow">{r.title.english || r.title.romaji}</span>
                  <button className="pill ghost" onClick={() => setF({ ...f, banner: r.bannerImage || r.coverImage.extraLarge })}>Banner</button>
                  <button className="pill ghost" onClick={() => pin(r)}>Pin</button></div>
              : <div key={r.id} className="pres"><img src={r.image.large} alt="" /><span className="grow">{r.name.full}</span>
                  <button className="pill ghost" onClick={() => setF({ ...f, avatar: r.image.large })}>Avatar</button></div>)}
          </div>
          {err && <div className="error">{err}</div>}
          <div className="row gap end">
            <button className="pill ghost" onClick={onClose}>Cancel</button>
            <button className="pill" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
