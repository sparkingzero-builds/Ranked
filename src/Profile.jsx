import { useEffect, useMemo, useState } from 'react'
import { sb } from './cloud.js'
import { fetchUser, fetchList, fetchPassportMedia, fetchWatchDays, title } from './api.js'
import { ACH } from './achievements.js'
import { coins, pct, START_CASH } from './market.js'
import { MOMENT, thumb } from './moments.js'
import { SONG, SONGS } from './songs.js'
import { collections, streaks } from './Passport.jsx'
import { fantasySeason } from './Fantasy.jsx'
import { openChar } from './CharProfile.jsx'
import ProfileEdit from './ProfileEdit.jsx'

// Player card: banner + level, live ranks, 🔥 hype button, main character, highlights from every part of Ranked,
// head-to-head vs you when it's a mate's profile, and a profile anthem (an anime opening) that plays on tap.

const TIER_NAMES = ['', 'Bronze', 'Silver', 'Gold', 'Legendary']
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th')

async function anilistMedia(ids) {
  if (!ids.length) return {}
  const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `query($ids:[Int]){ Page(perPage:50){ media(id_in:$ids){ id title { romaji english } coverImage { extraLarge large } bannerImage } } }`, variables: { ids } }) })
    .then(r => r.json()).catch(() => null)
  return Object.fromEntries((r?.data?.Page?.media || []).map(m => [m.id, m]))
}

// numbers count up when the card loads
function Count({ to, fmt = n => Math.round(n).toLocaleString() }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf, t0
    const step = t => { t0 ??= t; const k = Math.min(1, (t - t0) / 900); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{fmt(v)}</>
}

// everything a player card needs, for any player (also used for "you" in the rivalry panel)
async function loadPlayer(f) {
  const S = fantasySeason()
  const [st, ach, act, hy, br] = await Promise.all([
    sb.from('user_state').select('rankings, extra').eq('user_id', f.id).maybeSingle(),
    sb.from('achievements').select('key').eq('user_id', f.id),
    sb.from('activity').select('*').eq('user_id', f.id).order('created_at', { ascending: false }).limit(8),
    sb.from('profile_hypes').select('from_user, day').eq('target', f.id),
    sb.from('hype_brackets').select('kind, champion').eq('user_id', f.id),
  ])
  const user = f.anilist_name ? await fetchUser(f.anilist_name).catch(() => null) : null
  const [list, days] = await Promise.all([
    f.anilist_name ? fetchList(f.anilist_name).catch(() => []) : [],
    user?.id ? fetchWatchDays(user.id).catch(() => new Set()) : new Set(),
  ])
  const done = list.filter(e => e.status === 'COMPLETED' || e.status === 'REPEATING')
  const extra = done.length ? await fetchPassportMedia(done.map(e => e.media.id)).catch(() => ({})) : {}
  const streak = streaks(days)
  const cols = collections(done, extra, streak)
  return { f, st: st.data || {}, ach: ach.data || [], act: act.data || [], hypes: hy.data || [], brackets: br.data || [], user, list, done, streak, cols, S }
}

export default function Profile({ id, me, friends, onProfileSaved, openAnime }) {
  const f = friends.find(x => x.id === id)
  const meF = friends.find(x => x.id === me.id)
  const [p, setP] = useState(null)
  const [mine, setMine] = useState(null)
  const [world, setWorld] = useState(null)   // squad-wide: wallets, league, characters
  const [editing, setEditing] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [hypeErr, setHypeErr] = useState('')
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    if (!f) return
    setP(null); setPlaying(false)
    loadPlayer(f).then(setP)
    if (id !== me.id && meF) loadPlayer(meF).then(setMine)
  }, [id])
  useEffect(() => {
    const S = fantasySeason()
    Promise.all([
      sb.from('wallets').select('user_id, cash, holdings'),
      sb.from('fantasy_picks').select('*').eq('season', S.key),
      sb.from('fantasy_events').select('team_user, char_id, points, week').eq('season', S.key).eq('status', 'confirmed'),
      sb.from('fantasy_captains').select('*').eq('season', S.key),
    ]).then(async ([w, pk, ev, cp]) => {
      const ids = [...new Set([...(w.data || []).flatMap(x => Object.keys(x.holdings || {}).map(Number)), ...(pk.data || []).map(x => x.char_id)])]
      const ch = ids.length ? await sb.from('characters').select('id, name, sym, image, form, price, price_24h, base').in('id', ids) : { data: [] }
      setWorld({ wallets: w.data || [], picks: pk.data || [], events: ev.data || [], caps: cp.data || [], chars: Object.fromEntries((ch.data || []).map(c => [c.id, c])) })
    })
  }, [])

  const derive = (pl) => {
    if (!pl || !world) return null
    const uid = pl.f.id, C = world.chars
    const worthOf = w => Number(w?.cash ?? START_CASH) + Object.entries(w?.holdings || {}).reduce((a, [cid, h]) => a + (Number(C[cid]?.price) || 0) * h.qty, 0)
    const board = world.wallets.map(w => ({ u: w.user_id, worth: worthOf(w) })).sort((a, b) => b.worth - a.worth)
    const w = world.wallets.find(x => x.user_id === uid)
    const worth = worthOf(w)
    const holdings = Object.entries(w?.holdings || {}).map(([cid, h]) => ({ c: C[cid], ...h })).filter(x => x.c)
    const best = holdings.map(x => ({ ...x, g: x.c.price / x.avg - 1 })).sort((a, b) => b.g - a.g)[0]
    const pts = {}; for (const e of world.events) pts[e.team_user] = (pts[e.team_user] || 0) + e.points
    const teams = [...new Set(world.picks.map(x => x.user_id))].map(u => ({ u, p: pts[u] || 0 })).sort((a, b) => b.p - a.p)
    const team = world.picks.filter(x => x.user_id === uid).map(x => x.char_id)
    const cap = world.caps.filter(c => c.user_id === uid && c.week <= pl.S.week).sort((a, b) => b.week - a.week)[0]?.char_id
    const charPts = {}; for (const e of world.events) if (e.team_user === uid && e.char_id) charPts[e.char_id] = (charPts[e.char_id] || 0) + e.points
    const eps = pl.done.reduce((a, e) => a + (e.media.episodes || e.progress || 0), 0)
    const legend = pl.cols.filter(c => c.lvl === 4).length, tiers = pl.cols.reduce((a, c) => a + c.lvl, 0)
    const xp = pl.done.length * 10 + Math.round(eps / 5) + tiers * 15 + Math.max(0, pts[uid] || 0) + pl.hypes.length * 20 + pl.ach.length * 10
    const lvl = Math.floor(Math.sqrt(xp / 40)) + 1, lo = 40 * (lvl - 1) ** 2, hi = 40 * lvl ** 2
    const scores = pl.list.filter(e => e.score)
    return { worth, marketRank: board.findIndex(b => b.u === uid) + 1, marketN: board.length, best, holdings,
      leaguePts: pts[uid] || 0, leagueRank: team.length ? teams.findIndex(t => t.u === uid) + 1 : 0, leagueN: teams.length, team, cap, charPts,
      eps, hours: Math.round(pl.done.reduce((a, e) => a + (e.media.episodes || e.progress || 0) * (e.media.duration || 24), 0) / 60),
      avg: scores.length ? (scores.reduce((a, e) => a + e.score, 0) / scores.length).toFixed(1) : '–', legend, tiers, xp, lvl, lvlPct: (xp - lo) / (hi - lo) }
  }
  const D = useMemo(() => derive(p), [p, world])
  const M = useMemo(() => derive(mine), [mine, world])

  if (!f) return <div className="card pad muted">Unknown player.</div>
  if (!p || !D) return <div className="pcard-loading"><div className="pcl-name">{f.username}</div><div className="loading">Loading player card…</div></div>

  const today = new Date().toISOString().slice(0, 10)
  const hypedToday = p.hypes.some(h => h.from_user === me.id && h.day === today)
  const acc = f.accent || '#ffd60a'
  const main = (p.st.extra?.chars || [])[0]
  const mainRow = main && world?.chars[main.id]
  const top = (p.st.rankings?.['10'] || []).slice(0, 10)
  const anthem = SONG[f.anthem]
  const momentChamp = MOMENT[p.brackets.find(b => b.kind === 'moment')?.champion]
  const songChamp = SONG[p.brackets.find(b => b.kind === 'song')?.champion]
  const topCols = p.cols.filter(c => c.lvl > 0).slice(0, 6)
  const titleAch = f.title_key && ACH[f.title_key]

  async function hype() {
    setHypeErr('')
    const { error } = await sb.rpc('hype_profile', { p_target: id })
    if (error) return setHypeErr(error.message)
    setBurst(b => b + 1)
    setP(x => ({ ...x, hypes: [...x.hypes, { from_user: me.id, day: today }] }))
  }

  return <div className="hp" style={{ '--acc': acc }}>
    <div className="hphero" style={{ backgroundImage: f.banner ? `url(${f.banner})` : undefined }}>
      <div className="hpshade" />
      <div className="hpstripes" />
      <div className="hpinner">
        <div className="hpava">
          {(f.avatar || p.user?.avatar?.medium) ? <img src={f.avatar || p.user.avatar.medium} alt="" /> : <div className="blank">{f.username[0]}</div>}
          <div className="hplvl"><b>{D.lvl}</b><span>LVL</span></div>
        </div>
        <div className="hpwho">
          {titleAch && <div className="hptitle">{titleAch.icon} {titleAch.label}</div>}
          <h1>{f.username}</h1>
          {f.bio && <div className="hpbio">{f.bio}</div>}
          <div className="hpxp"><div style={{ width: `${Math.round(D.lvlPct * 100)}%` }} /><span>{D.xp.toLocaleString()} XP · level {D.lvl + 1} at {(40 * D.lvl ** 2).toLocaleString()}</span></div>
          <div className="hpchips">
            {D.leagueRank > 0 && <span className={`r${D.leagueRank}`}>🏆 {ord(D.leagueRank)} in League · {D.leaguePts} pts</span>}
            {D.marketRank > 0 && <span className={`r${D.marketRank}`}>📈 {ord(D.marketRank)} richest · {coins(D.worth)}</span>}
            <span className={p.streak.cur ? 'fire' : ''}>🔥 {p.streak.cur} day streak</span>
            {D.legend > 0 && <span>💎 {D.legend} Legendary collection{D.legend > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className="hpside">
          <button className={`hphype ${hypedToday ? 'done' : ''}`} disabled={id === me.id || hypedToday} onClick={hype} key={burst}>
            <span className="hpflame">🔥</span><b><Count to={p.hypes.length} /></b><em>{id === me.id ? 'hypes' : hypedToday ? 'hyped today' : 'HYPE'}</em>
            {burst > 0 && <i className="hpburst">+1</i>}
          </button>
          {hypeErr && <small className="down">{hypeErr}</small>}
          {anthem && <button className="hpanthem" onClick={() => setPlaying(x => !x)}>{playing ? '⏹' : '▶'} <span>Anthem<b>{anthem.title}</b><em>{anthem.anime}</em></span></button>}
          {id === me.id && <button className="pill" onClick={() => setEditing(true)}>✏️ Edit card</button>}
        </div>
      </div>
      {playing && anthem && <div className="hpplayer"><iframe src={`https://www.youtube-nocookie.com/embed/${anthem.clips[0]}?autoplay=1&rel=0`} allow="autoplay; encrypted-media" title="anthem" /></div>}
    </div>
    {editing && <ProfileEdit me={f} unlocked={new Set(p.ach.map(a => a.key))} onClose={() => setEditing(false)} onSaved={x => { onProfileSaved(x) }} songs={SONGS} />}

    <div className="hpstats">
      {[[p.done.length, 'shows finished'], [D.eps, 'episodes'], [D.hours, 'hours watched'], [D.avg, 'avg score', true], [p.streak.best, 'best streak'], [D.tiers, 'collection tiers']].map(([v, l, raw]) =>
        <div key={l}><b>{raw ? v : <Count to={+v || 0} />}</b><span>{l}</span></div>)}
    </div>

    <div className="hpgrid">
      {main && <div className="hpmain" onClick={() => mainRow && openChar(main.id)} style={{ cursor: mainRow ? 'pointer' : 'default' }}>
        <img src={mainRow?.image || main.image} alt="" referrerPolicy="origin" />
        <div className="hpmaincap"><span>MAIN</span><b>{main.name}</b>{mainRow?.form && <em>{mainRow.form}</em>}{mainRow && <small>${mainRow.sym} · {coins(mainRow.price)}</small>}</div>
      </div>}

      <div className="hpcard hpleague">
        <h4>🏆 Fantasy League <small>{p.S.label}</small></h4>
        {D.team.length ? <>
          <div className="hpteam">{D.team.map(cid => world.chars[cid] && <div key={cid} className={D.cap === cid ? 'cap' : ''} onClick={() => openChar(cid)}>
            <img src={world.chars[cid].image} alt="" referrerPolicy="origin" /><em>{D.charPts[cid] || 0}</em>{D.cap === cid && <i>C</i>}</div>)}</div>
          <div className="hpbig"><b>{D.leaguePts}</b> pts · <span>{ord(D.leagueRank)} of {D.leagueN}</span></div>
        </> : <div className="muted small">Hasn't drafted a team yet.</div>}
      </div>

      <div className="hpcard">
        <h4>📈 Market</h4>
        <div className="hpbig"><b>{coins(D.worth)}</b> <span className={D.worth >= START_CASH ? 'up' : 'down'}>{pct(D.worth / START_CASH - 1)}</span></div>
        <div className="muted small">{ord(D.marketRank)} richest of {D.marketN} · {D.holdings.length} stocks held</div>
        {D.best && <div className="hpbest" onClick={() => openChar(D.best.c.id)}><img src={D.best.c.image} alt="" referrerPolicy="origin" /><span>Best call<b>${D.best.c.sym}</b></span><em className={D.best.g >= 0 ? 'up' : 'down'}>{pct(D.best.g)}</em></div>}
      </div>

      <div className="hpcard">
        <h4>🛂 Passport</h4>
        <div className="hpbig"><b>{p.done.length}</b> stamps · <span>{D.tiers} tiers</span></div>
        <div className="hpcols">{topCols.map(c => <span key={c.id} className={`t${c.lvl}`} title={`${c.name}: ${TIER_NAMES[c.lvl]}`}>{c.icon}<em>{c.name}</em></span>)}</div>
      </div>

      <div className="hpcard hpchamps">
        <h4>👑 Champions</h4>
        {momentChamp ? <div className="hpchamp"><img src={thumb(momentChamp)} alt="" /><span>Hypest moment<b>{momentChamp.title}</b></span></div> : <div className="muted small">No Hypest Moment champion yet.</div>}
        {songChamp ? <div className="hpchamp"><img src={thumb(songChamp)} alt="" /><span>Greatest song<b>{songChamp.title} · {songChamp.anime}</b></span></div> : <div className="muted small">No song champion yet.</div>}
      </div>
    </div>

    {M && <Rivalry them={{ ...D, p }} me={{ ...M, p: mine }} name={f.username} />}

    {top.length > 0 && <TopTen ids={top} openAnime={openAnime} />}

    {p.act.length > 0 && <><h3>Recently</h3>
      <div className="hpact">{p.act.map(a => <div key={a.id}>{a.payload?.cover && <img src={a.payload.cover} alt="" />}<span>{actText(a)}</span></div>)}</div></>}
  </div>
}

function TopTen({ ids, openAnime }) {
  const [media, setMedia] = useState({})
  useEffect(() => { anilistMedia(ids).then(setMedia) }, [ids.join()])
  const m = i => media[ids[i]]
  return <>
    <h3>Top 10</h3>
    <div className="hptop">
      {[1, 0, 2].map(i => m(i) && <div key={i} className={`hppod p${i + 1}`} onClick={() => openAnime?.(ids[i])}>
        <img src={m(i).coverImage.extraLarge || m(i).coverImage.large} alt="" /><b>#{i + 1}</b><span>{title(m(i))}</span></div>)}
    </div>
    <div className="hprest">{ids.slice(3).map((mid, k) => media[mid] && <div key={mid} onClick={() => openAnime?.(mid)}>
      <img src={media[mid].coverImage.large} alt="" /><b>#{k + 4}</b><span>{title(media[mid])}</span></div>)}</div>
  </>
}

// head-to-head: you vs them across everything
function Rivalry({ them, me, name }) {
  const rows = [
    ['League points', me.leaguePts, them.leaguePts], ['Net worth', Math.round(me.worth), Math.round(them.worth)],
    ['Shows finished', me.p.done.length, them.p.done.length], ['Episodes', me.eps, them.eps], ['Best streak', me.p.streak.best, them.p.streak.best],
    ['Collection tiers', me.tiers, them.tiers], ['Hypes received', me.p.hypes.length, them.p.hypes.length], ['Level', me.lvl, them.lvl],
  ]
  const myW = rows.filter(r => r[1] > r[2]).length, theirW = rows.filter(r => r[2] > r[1]).length
  return <div className="hprival">
    <div className="hprhead"><span>YOU</span><b>{myW} – {theirW}</b><span>{name.toUpperCase()}</span></div>
    <div className="hprverdict">{myW > theirW ? `You're winning this rivalry 😤` : myW < theirW ? `${name} is clearing you right now 💀` : 'Dead even. Settle it.'}</div>
    {rows.map(([l, a, b]) => <div key={l} className="hprrow">
      <b className={a > b ? 'win' : ''}>{a.toLocaleString()}</b>
      <div className="hprbar"><div className="l" style={{ width: `${(a / ((a + b) || 1)) * 100}%` }} /><span>{l}</span></div>
      <b className={b > a ? 'win' : ''}>{b.toLocaleString()}</b>
    </div>)}
  </div>
}

function actText(a) {
  const p = a.payload || {}
  switch (a.kind) {
    case 'rate': return <>rated <b>{p.title}</b> {p.score}/10</>
    case 'top1': return <>made <b>{p.title}</b> their #1</>
    case 'char_top': return <>made <b>{p.name}</b> their #1 character</>
    case 'status': return <>{p.status?.toLowerCase?.() || 'updated'} <b>{p.title}</b></>
    case 'trade': return <>{p.qty > 0 ? 'bought' : 'sold'} {Math.abs(p.qty)} <b>${p.sym}</b></>
    case 'hype_champ': return <>crowned <b>{p.title}</b> {p.mode === 'song' ? 'the greatest anime song 🎵' : 'the hypest moment ever 🔥'}</>
    case 'fantasy_team': return <>drafted their {p.season} fantasy team</>
    case 'ep_rate': return <>rated an episode of <b>{p.title}</b></>
    case 'achievement': return <>unlocked <b>{p.label || 'an achievement'}</b></>
    default: return <>{a.kind.replace('_', ' ')}</>
  }
}
