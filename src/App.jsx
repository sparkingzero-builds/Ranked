import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ANILIST_CLIENT_ID, connectAniList, disconnectAniList, getToken, saveToAniList } from './anilistAuth.js'
import Stats from './Stats.jsx'
import Market from './Market.jsx'
import Detail from './Detail.jsx'
import HypeBracket from './HypeBracket.jsx'
import Fantasy from './Fantasy.jsx'
import { EpisodeModal } from './Episodes.jsx'
import Season, { currentSeason } from './Season.jsx'
import CharRank from './CharRank.jsx'
import { Bell, Squad, Profile } from './Social.jsx'
import { useAchievements } from './achievements.js'
import { renderTopList } from './shareImage.js'
import { useRankHistory, movement, Move, RankHistory } from './History.jsx'
import Lobby from './Lobby.jsx'
import { sb, useSession, ensureProfile, fetchProfiles, useRowSync, logActivity } from './cloud.js'
import { fetchUser, fetchList, fetchActivity, searchAnime, trending, title } from './api.js'

const CATS = ['Story', 'Animation', 'Characters', 'Music', 'Peak moments']
const SIZES = [10, 20, 30]
// Fortnite-style rarity from a 0-10 score
const tier = sc => !sc ? 'common' : sc >= 9.5 ? 'legend' : sc >= 8 ? 'epic' : sc >= 6.5 ? 'rare' : sc >= 5 ? 'uncommon' : 'common'
const TIER_NAME = { legend: 'Legendary', epic: 'Epic', rare: 'Rare', uncommon: 'Uncommon', common: 'Common' }

export function useStored(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init } catch { return init }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }, [key, v])
  return [v, setV]
}

const timeAgo = s => {
  const d = Date.now() / 1000 - s
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))} min ago`
  if (d < 86400) return `${Math.floor(d / 3600)} hours ago`
  if (d < 86400 * 14) return `${Math.floor(d / 86400)} days ago`
  if (d < 86400 * 60) return `${Math.floor(d / 604800)} weeks ago`
  return `${Math.floor(d / 2592000)} months ago`
}
const countdown = s => `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`
const verb = a => {
  const st = a.status.charAt(0).toUpperCase() + a.status.slice(1)
  return a.progress ? `${st} ${a.progress} of` : st
}

export default function App() {
  const session = useSession()
  const [me, setMe] = useState(null)
  const [authErr, setAuthErr] = useState('')
  useEffect(() => {
    setMe(null); setAuthErr('')
    if (session) ensureProfile(session.user).then(setMe).catch(e => setAuthErr(e.message))
  }, [session?.user.id])

  if (session === undefined) return <div className="loading">Loading…</div>
  if (sb && !session) return <Lobby />
  if (sb && !me) return <div className="loading">{authErr ? `Profile error: ${authErr}` : 'Entering the lobby…'}</div>
  return <Main me={me} setMe={setMe} />
}

function Main({ me, setMe }) {
  const [page, setPage] = useState('home')
  const [username, setUsername] = useStored('ranked.user', 'AspextPro')
  const [user, setUser] = useState(null)
  const [alList, setList] = useState([])
  const [activity, setActivity] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [rankings, setRankings] = useStored('ranked.rankings', { 10: [], 20: [], 30: [] })
  const [ratings, setRatings] = useStored('ranked.ratings', {})
  const [elo, setElo] = useStored('ranked.elo', {})
  const [history, setHistory] = useStored('ranked.history', {})
  const [extra, setExtra] = useStored('ranked.extra', {})
  // Your AniList list plus statuses set in Ranked (extra.entries); Ranked changes win over AniList
  const list = useMemo(() => {
    const own = extra.entries || {}
    const merged = alList.map(e => own[e.media.id] ? { ...e, ...own[e.media.id], media: e.media } : e).filter(e => e.status !== 'REMOVED')
    const have = new Set(alList.map(e => e.media.id))
    for (const [id, o] of Object.entries(own)) if (!have.has(+id) && o.status !== 'REMOVED') merged.push({ score: 0, progress: 0, ...o })
    return merged
  }, [alList, extra.entries])
  const setStatus = (m, status, prog) => {
    const cur = list.find(e => e.media.id === m.id)
    const snap = { id: m.id, title: m.title, coverImage: m.coverImage, episodes: m.episodes, duration: m.duration, genres: m.genres || [],
      averageScore: m.averageScore, format: m.format, seasonYear: m.seasonYear, nextAiringEpisode: m.nextAiringEpisode }
    const progress = prog ?? (status === 'COMPLETED' ? (m.episodes || cur?.progress || 0) : (cur?.progress || 0))
    const entries = { ...(extra.entries || {}), [m.id]: { status, progress, score: cur?.score || 0, media: cur?.media || snap, updatedAt: Date.now() } }
    setExtra({ ...extra, entries })
    if (status !== 'REMOVED' && prog == null) logActivity('status', { title: title(m), cover: m.coverImage?.medium, status })
    // Connected to AniList: write it there too, then let AniList be the source of truth for this show again
    if (getToken()) saveToAniList(m.id, status, progress).then(() => {
      setList(l => status === 'REMOVED' ? l.filter(e => e.media.id !== m.id)
        : l.some(e => e.media.id === m.id) ? l.map(e => e.media.id === m.id ? { ...e, status, progress } : e)
        : [...l, { status, progress, score: 0, media: cur?.media || snap }])
      setExtra(x => { const en = { ...(x.entries || {}) }; delete en[m.id]; return { ...x, entries: en } })
      flash(`Saved to AniList: ${title(m)}`)
    }).catch(e => flash(`AniList didn't save (${e.message}). Kept in Ranked.`))
  }
  const [flashMsg, setFlashMsg] = useState(null)
  const flash = t => { setFlashMsg(t); setTimeout(() => setFlashMsg(null), 3500) }
  const [profileId, setProfileId] = useState(null)
  const [toast, setToast] = useState(null)
  useRankHistory(rankings, history, setHistory)
  const synced = useRowSync('user_state', me?.id, [
    { col: 'rankings', value: rankings, set: setRankings },
    { col: 'ratings', value: ratings, set: setRatings },
    { col: 'elo', value: elo, set: setElo },
    { col: 'history', value: history, set: setHistory },
    { col: 'extra', value: extra, set: setExtra },
  ])
  const [friends, setFriends] = useState([])
  useEffect(() => { if (me) fetchProfiles().then(setFriends) }, [me?.id])
  useEffect(() => { if (me?.anilist_name && me.anilist_name !== username) setUsername(me.anilist_name) }, [me?.id])
  const prevTop = useRef(undefined)
  useEffect(() => {
    const top = rankings['10']?.[0]
    if (!synced) return
    if (prevTop.current !== undefined && top && top !== prevTop.current) {
      const m = list.find(e => e.media.id === top)?.media
      if (m) logActivity('top1', { title: title(m), cover: m.coverImage.medium })
    }
    prevTop.current = top ?? null
  }, [rankings['10']?.[0], synced])

  const season = currentSeason()
  const achLocal = useMemo(() => {
    const seen = list.filter(e => e.status !== 'PLANNING')
    const hours = seen.reduce((a, e) => a + (e.status === 'COMPLETED' ? (e.media.episodes || e.progress) : e.progress) * (e.media.duration || 24), 0) / 60
    return { hours, completed: list.filter(e => e.status === 'COMPLETED').length, ratings: Object.keys(ratings).length,
      top10: (rankings['10'] || []).length, charTop: (extra.chars || []).length, season: (extra.season?.[`${season.season}-${season.year}`] || []).length }
  }, [list, ratings, rankings, extra])
  useAchievements(me, achLocal, a => { setToast(a); setTimeout(() => setToast(null), 4500) }, [me?.id, page, list.length, achLocal.ratings, achLocal.top10, achLocal.charTop, achLocal.season])
  const openProfile = id => { setProfileId(id); setPage('profile') }
  const [animeId, setAnimeId] = useState(null)
  const openAnime = id => { setAnimeId(id); setPage('anime') }
  // +1 episode: finishing the last episode marks it Finished; starting a planned show marks it Watching
  const [epPrompt, setEpPrompt] = useState(null)
  const setProgress = (m, n) => {
    const cur = list.find(e => e.media.id === m.id)
    if (n > (cur?.progress || 0)) setEpPrompt({ m: cur?.media?.coverImage ? { ...cur.media, ...m } : m, ep: Math.min(n, m.episodes || cur?.media?.episodes || n) })
    const eps = m.episodes || cur?.media?.episodes
    let status = cur?.status && cur.status !== 'PLANNING' ? cur.status : 'CURRENT'
    if (eps && n >= eps) { status = 'COMPLETED'; n = eps }
    else if (status === 'COMPLETED') status = 'CURRENT'
    setStatus(m, status, n)
    if (status === 'COMPLETED' && cur?.status !== 'COMPLETED') logActivity('status', { title: title(m), cover: m.coverImage?.medium, status })
  }

  async function changeAnilist(name) {
    setUsername(name)
    if (me) { const { data } = await sb.from('profiles').update({ anilist_name: name }).eq('id', me.id).select().single(); if (data) setMe(data) }
  }
  const [rating, setRating] = useState(null)

  async function load(name) {
    setLoading(true); setErr('')
    try {
      const u = await fetchUser(name)
      setUser(u)
      const [l, a] = await Promise.all([fetchList(name), fetchActivity(u.id).catch(() => [])])
      setList(l); setActivity(a)
      if (l.__stale) setErr('AniList is busy right now, so this is your last saved list. It will refresh when AniList is back.')
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }
  useEffect(() => { load(username) }, [username])

  const media = useMemo(() => Object.fromEntries(list.map(e => [e.media.id, e.media])), [list])
  const overall = id => {
    const r = ratings[id]
    if (!r) return null
    const vals = CATS.map(c => r[c] ?? 0)
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }

  const ctx = { list, media, user, activity, rankings, setRankings, ratings, overall, openRating: setRating, elo, setElo, history, me, friends, extra, setExtra, openProfile, setStatus, setProgress, openAnime }

  return (
    <>
      <nav className="nav">
        <div className="logo" onClick={() => setPage('home')}>R<span>.</span></div>
        <div className="links">
          {[['home', 'Home'], ['browse', 'Browse'], ['list', 'Anime List'], ['rank', 'Rankings'], ['h2h', 'Head-to-Head'], ['season', 'Season'], ['league', 'League'], ['mates', 'Mates'], ['squad', 'Squad'], ['stats', 'Stats'], ['market', 'Market']].map(([k, l]) =>
            <button key={k} className={page === k ? 'on' : ''} onClick={() => setPage(k)}>{l}</button>)}
        </div>
        <UserBox user={user} onChange={changeAnilist} />
        <button className="navsearch" title="Search anime" onClick={() => setPage('browse')}>🔍</button>
        <Bell me={me} />
        {me && <div className="mebox" title="Your profile" onClick={() => openProfile(me.id)}><b>{me.username}</b><span>{synced ? 'synced' : 'syncing…'}</span></div>}
      </nav>
      <main className="wrap">
        {err && <div className="card error">{err.startsWith('AniList is busy') ? err : `Couldn't load your AniList: ${err}`}</div>}
        {loading && !list.length ? <div className="loading">Loading your AniList…</div> : <>
          {page === 'home' && <Home {...ctx} />}
          {page === 'list' && <ListPage {...ctx} />}
          {page === 'rank' && <Rankings {...ctx} />}
          {page === 'h2h' && <HeadToHead {...ctx} />}
          {page === 'mates' && <Mates {...ctx} />}
          {page === 'stats' && <Stats {...ctx} />}
          {page === 'market' && <Market me={me} friends={friends} />}
          {page === 'season' && <Season {...ctx} />}
          {page === 'league' && <Fantasy me={me} friends={friends} openProfile={openProfile} />}
          {page === 'squad' && <Squad me={me} friends={friends} openProfile={openProfile} />}
          {page === 'profile' && profileId && <Profile key={profileId} id={profileId} me={me} myList={list} friends={friends} openAnime={openAnime}
            onProfileSaved={p => { setMe(p); setFriends(fs => fs.map(x => x.id === p.id ? p : x)) }} />}
          {page === 'profile' && profileId === me?.id && <div className="center"><button className="pill ghost" onClick={() => confirm('Sign out?') && sb.auth.signOut()}>Sign out</button></div>}
          {page === 'browse' && <Browse {...ctx} />}
          {page === 'anime' && animeId && <Detail key={animeId} id={animeId} {...ctx} />}
        </>}
      </main>
      {flashMsg && <div className="flash">{flashMsg}</div>}
      {epPrompt && <EpisodeModal m={epPrompt.m} ep={epPrompt.ep} me={me} friends={friends} onClose={() => setEpPrompt(null)} />}
      {toast && <div className="toast"><span>{toast.icon}</span><div><b>Achievement unlocked</b>{toast.label}: {toast.desc}</div></div>}
      {rating && <RatingModal m={rating} value={ratings[rating.id] || {}} onClose={() => setRating(null)}
        onSave={v => {
          setRatings({ ...ratings, [rating.id]: v })
          const score = (CATS.reduce((a, c) => a + (v[c] ?? 0), 0) / CATS.length).toFixed(1)
          logActivity('rate', { title: title(rating), cover: rating.coverImage.medium, score })
          setRating(null)
        }} />}
    </>
  )
}

function UserBox({ user, onChange }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState('')
  if (edit) return (
    <form className="userbox" onSubmit={e => { e.preventDefault(); if (v.trim()) onChange(v.trim()); setEdit(false) }}>
      <input autoFocus placeholder="AniList username" value={v} onChange={e => setV(e.target.value)} onBlur={() => setEdit(false)} />
    </form>
  )
  return (
    <div className="userbox" onClick={() => setEdit(true)} title="Switch AniList user">
      {user && <><span>{user.name}</span><img src={user.avatar.medium} alt="" /></>}
    </div>
  )
}

function Home({ activity, list, rankings, media }) {
  const progress = list.filter(e => e.status === 'CURRENT')
  const top = rankings[10].slice(0, 5).map(id => media[id]).filter(Boolean)
  return (
    <div className="home">
      <section>
        <h3>Activity</h3>
        {activity.map(a => (
          <div key={a.id} className="card act">
            <img src={a.media.coverImage.medium} alt="" />
            <div className="body">
              <div className="row"><span className="blue">{verb(a)}</span><span className="time">{timeAgo(a.createdAt)}</span></div>
              <div><span className="blue">{a.media.title.romaji}</span></div>
            </div>
          </div>
        ))}
        {!activity.length && <div className="card muted pad">No recent activity.</div>}
      </section>
      <aside>
        <h3>In Progress</h3>
        <div className="card grid4">
          {progress.map(e => (
            <div key={e.media.id} className="cover" style={{ backgroundImage: `url(${e.media.coverImage.large})` }}>
              {e.media.nextAiringEpisode && <div className="air">Ep {e.media.nextAiringEpisode.episode}<br />{countdown(e.media.nextAiringEpisode.timeUntilAiring)}</div>}
              <div className="bar" style={{ width: e.media.episodes ? `${(e.progress / e.media.episodes) * 100}%` : '30%' }} />
            </div>
          ))}
        </div>
        <h3>Your Top 5</h3>
        <div className="card pad">
          {top.length ? top.map((m, i) => (
            <div key={m.id} className="mini"><b className={`r r${i + 1}`}>#{i + 1}</b><img src={m.coverImage.medium} alt="" />{title(m)}</div>
          )) : <span className="muted">Build your Top 10 on the Rankings page.</span>}
        </div>
      </aside>
    </div>
  )
}

function ListPage({ list, overall, openRating, setStatus, setProgress, openAnime }) {
  const [tab, setTab] = useState('COMPLETED')
  const tabs = ['CURRENT', 'COMPLETED', 'PAUSED', 'DROPPED', 'PLANNING']
  const shown = list.filter(e => e.status === tab).sort((a, b) => b.score - a.score)
  return (
    <>
      <AniListLink />
      <div className="tabs">{tabs.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
        {t.charAt(0) + t.slice(1).toLowerCase()} <small>{list.filter(e => e.status === t).length}</small></button>)}</div>
      <div className="roster">
        {shown.map(e => {
          const t = tier(e.score)
          const pct = e.media.episodes ? Math.min(100, (e.progress / e.media.episodes) * 100) : 0
          return (
            <div key={e.media.id} className={`rrow t-${t}`}>
              <div className="rcover linkish" onClick={() => openAnime(e.media.id)} style={{ backgroundImage: `url(${e.media.coverImage.large})` }} />
              <div className="rinfo">
                <div className="rtitle linkish" onClick={() => openAnime(e.media.id)}>{title(e.media)}</div>
                <div className="rmeta"><span className={`rtier ${t}`}>{TIER_NAME[t]}</span>{e.media.format?.replace('_', ' ')} · {e.media.seasonYear ?? '?'}</div>
                <div className="rprog"><div style={{ width: `${pct}%` }} /></div>
              </div>
              <div className="reps"><b>{e.progress}</b>/{e.media.episodes ?? '?'}<span>EPS</span>
                {e.status === 'CURRENT' && <button className="plus1" title="Watched another episode" onClick={() => setProgress(e.media, e.progress + 1)}>+1</button>}</div>
              <div className={`rscore ${t}`}>{e.score || '–'}</div>
              <button className="pill" onClick={() => openRating(e.media)}>{overall(e.media.id) ? `★ ${overall(e.media.id)}` : 'Rate'}</button>
              <StatusPicker m={e.media} status={e.status} setStatus={setStatus} />
            </div>
          )
        })}
        {!shown.length && <div className="card pad muted">Nothing here.</div>}
      </div>
    </>
  )
}

function Rankings(props) {
  const [kind, setKind] = useState('anime')
  return <>
    <div className="tabs kindtabs">
      <button className={kind === 'anime' ? 'on' : ''} onClick={() => setKind('anime')}>Anime</button>
      <button className={kind === 'chars' ? 'on' : ''} onClick={() => setKind('chars')}>Characters</button>
    </div>
    {kind === 'anime' ? <AnimeRankings {...props} /> : <CharRank extra={props.extra} setExtra={props.setExtra} />}
  </>
}

function AnimeRankings({ list, media, rankings, setRankings, overall, openRating, user, history }) {
  const [showHist, setShowHist] = useState(false)
  const [size, setSize] = useState(10)
  const [share, setShare] = useState(false)
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState(null)
  const ranked = rankings[size]
  const moves = movement(history[size])
  const pool = list.filter(e => e.status !== 'PLANNING' && !ranked.includes(e.media.id) &&
    title(e.media).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.score - a.score)

  const set = arr => setRankings({ ...rankings, [size]: arr.slice(0, size) })
  function dropAt(i) {
    if (!drag) return
    const arr = ranked.filter(id => id !== drag.id)
    arr.splice(Math.min(i, arr.length), 0, drag.id)
    set(arr); setDrag(null)
  }
  const add = id => ranked.length < size && set([...ranked, id])
  const remove = id => set(ranked.filter(x => x !== id))
  const autofill = () => set([...ranked, ...pool.map(e => e.media.id)])

  return (
    <div className="rank">
      <section>
        <div className="row head">
          <div className="tabs">{SIZES.map(s => <button key={s} className={size === s ? 'on' : ''} onClick={() => setSize(s)}>Top {s}</button>)}</div>
          <div className="row gap"><button className="pill" onClick={autofill}>Auto-fill from scores</button>
            <button className={`pill ghost ${showHist ? 'act' : ''}`} onClick={() => setShowHist(!showHist)}>History</button>
            <button className="pill share" disabled={!ranked.length} onClick={() => setShare(true)}>Share image</button>
            <button className="pill ghost" onClick={() => set([])}>Clear</button></div>
        </div>
        {share && <ShareModal items={ranked.map(id => media[id]).filter(Boolean)} size={size} userName={user?.name || 'My'}
          scores={Object.fromEntries(ranked.map(id => [id, overall(id)]).filter(([, v]) => v))} onClose={() => setShare(false)} />}
        {showHist && <RankHistory snaps={history[size]} size={size} media={media} />}
        <div className="podium">
          {[1, 0, 2].map(i => {
            const m = media[ranked[i]]
            return <div key={i} className={`pod p${i + 1}`} onDragOver={e => e.preventDefault()} onDrop={() => dropAt(i)}>
              {m ? <div className="cover big" draggable onDragStart={() => setDrag({ id: m.id })} style={{ backgroundImage: `url(${m.coverImage.large})` }} /> : <div className="cover big empty" />}
              <b>#{i + 1} {m && <Move m={moves[m.id]} />}</b><span>{m ? title(m) : 'Drop here'}</span>
            </div>
          })}
        </div>
        <div className="card">
          {Array.from({ length: size }, (_, i) => i).slice(3).map(i => {
            const m = media[ranked[i]]
            return (
              <div key={i} className={`slot ${m ? '' : 'empty'}`} draggable={!!m} onDragStart={() => m && setDrag({ id: m.id })}
                onDragOver={e => e.preventDefault()} onDrop={() => dropAt(i)}>
                <b className="num">#{i + 1}</b>
                {m ? <>
                  <img src={m.coverImage.medium} alt="" /><div className="grow">{title(m)}</div>
                  <Move m={moves[m.id]} />
                  <button className="pill" onClick={() => openRating(m)}>{overall(m.id) ? `★ ${overall(m.id)}` : 'Rate'}</button>
                  <button className="x" onClick={() => remove(m.id)}>×</button>
                </> : <span className="muted">Drag an anime here</span>}
              </div>
            )
          })}
        </div>
      </section>
      <aside>
        <h3>Your anime ({pool.length})</h3>
        <input className="search" placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="card pool">
          {pool.map(e => (
            <div key={e.media.id} className="lrow drag" draggable onDragStart={() => setDrag({ id: e.media.id })} onDoubleClick={() => add(e.media.id)}>
              <img src={e.media.coverImage.medium} alt="" /><div className="grow">{title(e.media)}</div>
              <span className="muted">{e.score || ''}</span>
              <button className="x plus" onClick={() => add(e.media.id)}>+</button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

function HeadToHead(props) {
  const [mode, setMode] = useState('hype')
  return <>
    <div className="tabs kindtabs">
      <button className={mode === 'hype' ? 'on' : ''} onClick={() => setMode('hype')}>🔥 Hypest Moment Ever</button>
      <button className={mode === 'anime' ? 'on' : ''} onClick={() => setMode('anime')}>Anime vs Anime</button>
    </div>
    {mode === 'hype' ? <HypeBracket me={props.me} friends={props.friends} /> : <AnimeH2H {...props} />}
  </>
}

function AnimeH2H({ list, elo, setElo }) {
  const pool = list.filter(e => e.status === 'COMPLETED' || e.status === 'CURRENT').map(e => e.media)
  const pick = () => {
    if (pool.length < 2) return []
    const a = Math.floor(Math.random() * pool.length)
    let b = Math.floor(Math.random() * (pool.length - 1)); if (b >= a) b++
    return [pool[a], pool[b]]
  }
  const [pair, setPair] = useState(pick)
  useEffect(() => { if (!pair.length) setPair(pick()) }, [list])
  const r = id => elo[id]?.r ?? 1500

  function choose(win, lose) {
    const ea = 1 / (1 + 10 ** ((r(lose.id) - r(win.id)) / 400)), k = 32
    setElo({
      ...elo,
      [win.id]: { r: r(win.id) + k * (1 - ea), n: (elo[win.id]?.n ?? 0) + 1 },
      [lose.id]: { r: r(lose.id) - k * (1 - ea), n: (elo[lose.id]?.n ?? 0) + 1 },
    })
    setPair(pick())
  }
  const board = pool.filter(m => elo[m.id]).sort((a, b) => r(b.id) - r(a.id)).slice(0, 20)
  const votes = Object.values(elo).reduce((a, b) => a + b.n, 0) / 2

  return (
    <div className="rank">
      <section>
        <h3>Which is better?</h3>
        {pair.length === 2 && <div className="vs arena">
          {pair.map((m, i) => (
            <button key={m.id} className={`choice side-${i ? 'b' : 'a'}`} onClick={() => choose(m, pair[1 - i])}>
              <div className="fighter">
                <div className="cover big" style={{ backgroundImage: `url(${m.coverImage.large})` }} />
                <div className="frating">{Math.round(r(m.id))}<small>ELO</small></div>
              </div>
              <span>{title(m)}</span>
              <em>Pick {i ? 'right' : 'left'}</em>
            </button>
          ))}
          <div className="vsbadge">VS</div>
        </div>}
        <div className="center"><button className="pill ghost" onClick={() => setPair(pick())}>Skip round</button></div>
      </section>
      <aside>
        <h3>True Ranking <small className="muted">· {votes} picks</small></h3>
        <div className="card pad">
          {board.map((m, i) => <div key={m.id} className={`mini lb ${i < 3 ? 'top' : ''}`}><b className={`r r${i + 1}`}>#{i + 1}</b><img src={m.coverImage.medium} alt="" />
            <span className="grow">{title(m)}</span><span className="elo">{Math.round(r(m.id))}</span></div>)}
          {!board.length && <span className="muted">Pick a few matchups to build it.</span>}
        </div>
      </aside>
    </div>
  )
}

function Browse({ openRating, list, setStatus, openAnime }) {
  const statusOf = Object.fromEntries(list.map(e => [e.media.id, e.status]))
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  useEffect(() => {
    const t = setTimeout(() => (q ? searchAnime(q) : trending()).then(setRes).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [q])
  return (
    <>
      <AniListLink />
      <input className="search big" placeholder="Search anime…" value={q} onChange={e => setQ(e.target.value)} />
      <h3>{q ? 'Results' : 'Trending now'}</h3>
      <div className="browse">
        {res.map(m => (
          <div key={m.id} className={`shop t-${tier(m.averageScore / 10)}`} onClick={() => openAnime(m.id)}>
            <div className="shopimg" style={{ backgroundImage: `url(${m.coverImage.large})` }}>
              {m.averageScore && <span className="score">{m.averageScore}%</span>}
            </div>
            <div className="shopband">
              <div className="bt">{title(m)}</div>
              <div className="shopmeta">{m.format?.replace('_', ' ')} · {m.seasonYear ?? '?'}</div>
              <StatusPicker m={m} status={statusOf[m.id]} setStatus={setStatus} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function RatingModal({ m, value, onClose, onSave }) {
  const [v, setV] = useState(() => Object.fromEntries(CATS.map(c => [c, value[c] ?? 7])))
  const avg = (CATS.reduce((a, c) => a + v[c], 0) / CATS.length).toFixed(1)
  return (
    <div className="modal" onClick={onClose}>
      <div className="card mbox" onClick={e => e.stopPropagation()}>
        <div className="mhead" style={{ backgroundImage: `url(${m.coverImage.large})` }} />
        <div className="pad">
          <h2>{title(m)}</h2>
          {CATS.map(c => (
            <label key={c} className="slider">
              <span>{c}</span>
              <input type="range" min="0" max="10" step="0.5" value={v[c]} onChange={e => setV({ ...v, [c]: +e.target.value })} />
              <b>{v[c]}</b>
            </label>
          ))}
          <div className="row head"><div className="overall">Overall <b>{avg}</b></div>
            <div className="row gap"><button className="pill ghost" onClick={onClose}>Cancel</button><button className="pill" onClick={() => onSave(v)}>Save</button></div></div>
        </div>
      </div>
    </div>
  )
}

function Mates({ list, rankings, user, friends = [], me }) {
  const squad = friends.filter(f => f.id !== me?.id && f.anilist_name)
  const [mates, setMates] = useStored('ranked.mates', [])
  const [active, setActive] = useState(null)
  const [data, setData] = useState(null)
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')

  async function open(name) {
    setActive(name); setData(null); setErr('')
    try {
      const [u, l] = await Promise.all([fetchUser(name), fetchList(name)])
      setData({ u, l })
      if (!mates.some(m => m.toLowerCase() === name.toLowerCase())) setMates([...mates, u.name])
    } catch (e) { setErr(e.message); setActive(null) }
  }

  const cmp = useMemo(() => {
    if (!data) return null
    const theirs = new Map(data.l.map(e => [e.media.id, e]))
    const mine = new Map(list.map(e => [e.media.id, e]))
    const shared = list.filter(e => e.score && theirs.get(e.media.id)?.score)
      .map(e => ({ m: e.media, a: e.score, b: theirs.get(e.media.id).score }))
    let match = null
    if (shared.length >= 3) {
      const avgDiff = shared.reduce((s, x) => s + Math.abs(x.a - x.b), 0) / shared.length
      match = Math.round(Math.max(0, 100 - avgDiff * 12))
    }
    const seen = (map, id) => { const e = map.get(id); return e && e.status !== 'PLANNING' }
    const myOrder = [...new Set([...rankings[30], ...rankings[20], ...rankings[10],
      ...list.filter(e => e.score).sort((a, b) => b.score - a.score).map(e => e.media.id)])]
    const recommend = myOrder.filter(id => mine.get(id) && !seen(theirs, id)).slice(0, 12).map(id => mine.get(id).media)
    const forYou = data.l.filter(e => e.score >= 8 && !seen(mine, e.media.id)).sort((a, b) => b.score - a.score).slice(0, 12)
    const fights = [...shared].sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).filter(x => Math.abs(x.a - x.b) >= 2).slice(0, 6)
    const agree = shared.filter(x => x.a >= 8 && x.b >= 8).sort((x, y) => (y.a + y.b) - (x.a + x.b)).slice(0, 6)
    return { match, shared: shared.length, recommend, forYou, fights, agree }
  }, [data, list, rankings])

  const label = p => p >= 85 ? 'Soulmates' : p >= 70 ? 'Great match' : p >= 50 ? 'Decent overlap' : 'Opposites'

  return (
    <div className="rank">
      <section>
        {!active && <div className="card pad muted">Add a mate's AniList username to compare your taste.</div>}
        {active && !data && <div className="loading">Loading {active}…</div>}
        {cmp && <>
          <div className="card pad matchcard">
            <img src={user?.avatar.medium} alt="" />
            <div className="ring" style={{ '--p': cmp.match ?? 0 }}><b>{cmp.match ?? '?'}%</b></div>
            <img src={data.u.avatar.medium} alt="" />
            <div className="grow">
              <div className="big">{cmp.match == null ? 'Not enough shared scores' : label(cmp.match)}</div>
              <div className="muted">{cmp.shared} anime you've both scored</div>
            </div>
          </div>
          <h3>Your top picks {data.u.name} hasn't watched</h3>
          <CoverRow items={cmp.recommend} empty="They've seen everything you rate highly." />
          <h3>{data.u.name}'s favourites you haven't watched</h3>
          <CoverRow items={cmp.forYou.map(e => e.media)} scores={cmp.forYou.map(e => e.score)} empty="Nothing new from them." />
          <div className="two">
            <div><h3>You both love</h3><div className="card pad">
              {cmp.agree.map(x => <Duel key={x.m.id} x={x} />)}{!cmp.agree.length && <span className="muted">None yet.</span>}</div></div>
            <div><h3>Biggest arguments</h3><div className="card pad">
              {cmp.fights.map(x => <Duel key={x.m.id} x={x} />)}{!cmp.fights.length && <span className="muted">You agree on everything.</span>}</div></div>
          </div>
        </>}
      </section>
      <aside>
        {squad.length > 0 && <>
          <h3>Squad on Ranked</h3>
          <div className="card squad">
            {squad.map(f => <div key={f.id} className={`lrow drag ${active === f.anilist_name ? 'sel' : ''}`} onClick={() => open(f.anilist_name)}>
              <div className="grow">{f.username}<div className="muted small">AniList: {f.anilist_name}</div></div></div>)}
          </div>
        </>}
        <h3>Mates</h3>
        <form onSubmit={e => { e.preventDefault(); if (input.trim()) open(input.trim()); setInput('') }}>
          <input className="search" placeholder="Add AniList username…" value={input} onChange={e => setInput(e.target.value)} />
        </form>
        {err && <div className="error">Couldn't find that user: {err}</div>}
        <div className="card">
          {mates.map(m => (
            <div key={m} className={`lrow drag ${active === m ? 'sel' : ''}`} onClick={() => open(m)}>
              <div className="grow">{m}</div>
              <button className="x" onClick={e => { e.stopPropagation(); setMates(mates.filter(x => x !== m)); if (active === m) { setActive(null); setData(null) } }}>×</button>
            </div>
          ))}
          {!mates.length && <div className="pad muted">No mates added yet.</div>}
        </div>
      </aside>
    </div>
  )
}

function CoverRow({ items, scores, empty }) {
  if (!items.length) return <div className="card pad muted">{empty}</div>
  return <div className="coverrow">{items.map((m, i) => (
    <div key={m.id} className="bcard">
      <div className="cover" style={{ backgroundImage: `url(${m.coverImage.large})` }}>{scores && <span className="score">{scores[i]}/10</span>}</div>
      <div className="bt">{title(m)}</div>
    </div>))}</div>
}

function Duel({ x }) {
  return <div className="mini"><img src={x.m.coverImage.medium} alt="" /><span className="grow">{title(x.m)}</span>
    <b className="blue">{x.a}</b><span className="muted">vs</span><b className="pink">{x.b}</b></div>
}

function ShareModal({ items, size, userName, scores, onClose }) {
  const [url, setUrl] = useState(null)
  const [blob, setBlob] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    let live = true
    renderTopList(items, { userName, size, scores }).then(cv => cv.toBlob(b => {
      if (!live) return
      setBlob(b); setUrl(URL.createObjectURL(b))
    }, 'image/png')).catch(e => setMsg(`Couldn't render: ${e.message}`))
    return () => { live = false }
  }, [])
  const file = `${userName}-top-${size}.png`
  async function copy() {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); setMsg('Copied! Paste it into WhatsApp, Discord or wherever.') }
    catch { setMsg('Copy not supported here, so use Download instead.') }
  }
  async function shareNative() {
    try { await navigator.share({ files: [new File([blob], file, { type: 'image/png' })], title: `My Top ${size} anime` }) } catch {}
  }
  const canShare = blob && navigator.canShare?.({ files: [new File([blob], file, { type: 'image/png' })] })
  return (
    <div className="modal" onClick={onClose}>
      <div className="card sharebox" onClick={e => e.stopPropagation()}>
        <div className="shareimg">{url ? <img src={url} alt={`Top ${size}`} /> : <div className="loading">Drawing your Top {size}…</div>}</div>
        <div className="pad">
          {msg && <div className="muted small">{msg}</div>}
          <div className="row end gap">
            <button className="pill ghost" onClick={onClose}>Close</button>
            {canShare && <button className="pill ghost" onClick={shareNative}>Share…</button>}
            <button className="pill ghost" disabled={!blob} onClick={copy}>Copy</button>
            <a className={`pill ${url ? '' : 'off'}`} href={url || undefined} download={file}>Download PNG</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export const STATUSES = [['CURRENT', 'Watching', '▶'], ['PLANNING', 'Plan to watch', '🕒'], ['COMPLETED', 'Finished', '✅'], ['PAUSED', 'On hold', '⏸'], ['DROPPED', 'Dropped', '✖']]
const STATUS_LABEL = Object.fromEntries(STATUSES.map(([k, l, i]) => [k, `${i} ${l}`]))

export function StatusPicker({ m, status, setStatus }) {
  // the menu is portalled to <body> and fixed-positioned so slanted card edges (clip-path) and hover transforms can't clip or shift it
  const [pos, setPos] = useState(null)
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('click', close); window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [pos])
  const toggle = e => {
    if (pos) return setPos(null)
    const r = e.currentTarget.getBoundingClientRect(), h = status ? 250 : 215
    setPos({ left: Math.min(r.left, innerWidth - 200), top: r.bottom + h > innerHeight ? r.top - h - 4 : r.bottom + 4, width: Math.max(r.width, 190) })
  }
  return (
    <div className="spick" onClick={e => e.stopPropagation()}>
      <button className={`spbtn ${status ? 's-' + status : ''}`} onClick={toggle}>{status ? STATUS_LABEL[status] : '+ Add to list'} ▾</button>
      {pos && createPortal(<div className="spmenu" style={pos} onClick={e => e.stopPropagation()}>
        {STATUSES.map(([k, l, i]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => { setStatus(m, k); setPos(null) }}>{i} {l}</button>)}
        {status && <button className="rm" onClick={() => { setStatus(m, 'REMOVED'); setPos(null) }}>🗑 Remove from list</button>}
      </div>, document.body)}
    </div>
  )
}

function AniListLink() {
  const [on, setOn] = useState(!!getToken())
  if (!ANILIST_CLIENT_ID) return null
  return on
    ? <div className="allink on">✓ Connected to AniList: list changes save to your AniList too
        <button onClick={() => { disconnectAniList(); setOn(false) }}>Disconnect</button></div>
    : <div className="allink">List changes only save in Ranked right now.
        <button className="pill" onClick={connectAniList}>🔗 Connect AniList</button></div>
}
