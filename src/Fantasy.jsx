import { useEffect, useMemo, useState } from 'react'
import { sb, fetchAll, logActivity } from './cloud.js'

// Fantasy League: pick 5 characters per anime season, score points from real-world hype + squad-logged moments.
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
export function fantasySeason(d = new Date()) {
  const q = Math.floor(d.getUTCMonth() / 3), y = d.getUTCFullYear()
  const start = Date.UTC(y, q * 3, 1), end = Date.UTC(q === 3 ? y + 1 : y, (q * 3 + 3) % 12, 1)
  return { key: `${SEASONS[q]}-${y}`, label: `${SEASONS[q][0] + SEASONS[q].slice(1).toLowerCase()} ${y}`, week: Math.floor((d - start) / 604800000) + 1, end }
}
const seasonLabel = k => { const [s, y] = k.split('-'); return `${s[0] + s.slice(1).toLowerCase()} ${y}` }

const KINDS = {
  episode: ['📺', 'New episode'], chapter: ['📖', 'New chapter'], wiki: ['📈', 'Wikipedia spike'], fans: ['💜', 'New AniList fans'],
  trending: ['🔥', 'Show trending'], break: ['💤', 'On break'], vote: ['🗳️', 'Won the squad vote'],
  transform: ['⚡', 'Transformation / power-up'], win: ['🏆', 'Won a fight'], appear: ['👀', 'Appeared'], lose: ['💥', 'Lost a fight'],
  death: ['💀', 'Died'], revive: ['✨', 'Came back'],
}
const LOGGABLE = [['transform', 20], ['win', 15], ['appear', 3], ['lose', -5], ['death', -20], ['revive', 0]]
const pts = n => (n > 0 ? '+' : '') + n

// round-robin pairing that rotates every week
function matchups(ids, week) {
  const list = [...ids].sort()
  if (list.length < 2) return []
  if (list.length % 2) list.push(null)
  const fixed = list[0], rest = list.slice(1), r = (week - 1) % rest.length
  const rot = [fixed, ...rest.slice(r), ...rest.slice(0, r)]
  const out = []
  for (let i = 0; i < rot.length / 2; i++) { const a = rot[i], b = rot[rot.length - 1 - i]; if (a && b) out.push([a, b]) }
  return out
}

export default function Fantasy({ me, friends, openProfile }) {
  const S = fantasySeason()
  const [chars, setChars] = useState([])
  const [picks, setPicks] = useState([])
  const [events, setEvents] = useState([])
  const [votes, setVotes] = useState([])
  const [swaps, setSwaps] = useState([])
  const [tab, setTab] = useState('table')
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const reload = () => setTick(t => t + 1)

  useEffect(() => {
    if (!sb) return
    fetchAll(() => sb.from('characters').select('id, name, image, media_title, color').order('favourites', { ascending: false })).then(setChars).catch(() => {})
  }, [])
  useEffect(() => {
    if (!sb) return
    sb.from('fantasy_picks').select('*').eq('season', S.key).then(({ data }) => setPicks(data || []))
    fetchAll(() => sb.from('fantasy_events').select('*').order('created_at', { ascending: false })).then(setEvents).catch(() => {})
    sb.from('fantasy_votes').select('*').eq('season', S.key).eq('week', S.week).then(({ data }) => setVotes(data || []))
    sb.from('fantasy_swaps').select('*').eq('season', S.key).then(({ data }) => setSwaps(data || []))
  }, [tick])
  useEffect(() => {
    if (!sb) return
    const ch = sb.channel('fantasy').on('postgres_changes', { event: '*', schema: 'public', table: 'fantasy_events' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fantasy_picks' }, reload).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])

  const byId = useMemo(() => Object.fromEntries(chars.map(c => [c.id, c])), [chars])
  const who = id => friends.find(f => f.id === id)
  const name = id => who(id)?.username || 'someone'
  const run = async (fn, args, after) => {
    setErr('')
    const { error } = await sb.rpc(fn, args)
    if (error) setErr(error.message); else { after?.(); reload() }
  }

  const live = events.filter(e => e.status === 'confirmed')
  const cur = live.filter(e => e.season === S.key)
  const teams = useMemo(() => {
    const t = {}
    for (const p of picks) (t[p.user_id] ||= { user: p.user_id, chars: [], total: 0, week: 0 }).chars.push(p.char_id)
    for (const e of cur) { const x = t[e.team_user]; if (!x) continue; x.total += e.points; if (e.week === S.week) x.week += e.points }
    return Object.values(t).sort((a, b) => b.total - a.total)
  }, [picks, events])
  const charPts = useMemo(() => { const m = {}; for (const e of cur) if (e.char_id) m[e.char_id] = (m[e.char_id] || 0) + e.points; return m }, [events])
  const dead = useMemo(() => {
    const m = {}
    for (const e of [...cur].reverse()) if (e.kind === 'death') m[e.char_id] = true; else if (e.kind === 'revive') delete m[e.char_id]
    return m
  }, [events])
  const mine = teams.find(t => t.user === me?.id)
  const takenBy = Object.fromEntries(picks.map(p => [p.char_id, p.user_id]))
  const pending = events.filter(e => e.status === 'pending' && e.season === S.key)

  if (!sb || !me) return <div className="card pad muted">Sign in to play the Fantasy League.</div>
  const daysLeft = Math.ceil((S.end - Date.now()) / 86400000)

  return (
    <div className="fantasy">
      <div className="fhero">
        <div>
          <div className="kicker">Fantasy League · {S.label}</div>
          <h1 className="mega sm">Week {S.week}</h1>
          <div className="muted">{daysLeft} days left in the season · {teams.length} team{teams.length === 1 ? '' : 's'}</div>
        </div>
        {mine && <div className="fscore"><b>{mine.total}</b><span>your points</span><em>{pts(mine.week)} this week</em></div>}
      </div>
      {err && <div className="card pad ferr">{err}</div>}

      {!mine ? <Picker chars={chars} takenBy={takenBy} name={name} onLock={ids => run('fantasy_pick', { p_chars: ids }, () =>
        logActivity('fantasy_team', { season: S.label, names: ids.map(i => byId[i]?.name), cover: byId[ids[0]]?.image }))} /> : <>
        <div className="tabs squadtabs">
          {[['table', 'Standings'], ['team', 'My team'], ['log', `Log a moment${pending.length ? ` (${pending.length})` : ''}`], ['vote', "Who's hyper?"], ['rules', 'Scoring']].map(([k, l]) =>
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'table' && <Standings teams={teams} byId={byId} who={who} me={me} charPts={charPts} dead={dead} openProfile={openProfile} events={live} S={S} />}
        {tab === 'team' && <MyTeam team={mine} byId={byId} chars={chars} takenBy={takenBy} name={name} charPts={charPts} dead={dead}
          events={cur.filter(e => e.team_user === me.id)} swapped={swaps.some(s => s.user_id === me.id && s.week === S.week)}
          onSwap={(o, i) => run('fantasy_swap', { p_out: o, p_in: i })} />}
        {tab === 'log' && <LogTab picks={picks} byId={byId} name={name} me={me} pending={pending}
          onLog={(c, k, note, link) => run('fantasy_log', { p_char: c, p_kind: k, p_note: note, p_link: link })}
          onReview={(id, ok) => run('fantasy_review', { p_id: id, p_ok: ok })} />}
        {tab === 'vote' && <Vote S={S} teams={teams} byId={byId} name={name} me={me} votes={votes} reload={reload} setErr={setErr} />}
        {tab === 'rules' && <Rules />}
      </>}
    </div>
  )
}

function CharTile({ c, sub, on, off, onClick, children }) {
  if (!c) return null
  return <div className={`fchar ${on ? 'on' : ''} ${off ? 'off' : ''}`} onClick={off ? undefined : onClick} style={{ '--c': c.color || '#7b5cff' }}>
    <img src={c.image} alt="" loading="lazy" />
    <div><b>{c.name}</b><span>{sub ?? c.media_title}</span></div>
    {children}
  </div>
}

function Picker({ chars, takenBy, name, onLock }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState([])
  const shown = chars.filter(c => !q || (c.name + ' ' + (c.media_title || '')).toLowerCase().includes(q.toLowerCase())).slice(0, 120)
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 5 ? [...s, id] : s)
  const byId = Object.fromEntries(chars.map(c => [c.id, c]))
  return <div className="fpick">
    <div className="card pad">
      <h2>Draft your 5</h2>
      <p className="muted">Pick any 5 characters from any anime. Each character can only be on one team, so first come first served. They score all season from new episodes, chapters, hype and big moments. You get one swap a week.</p>
      <div className="fslots">
        {[0, 1, 2, 3, 4].map(i => { const c = byId[sel[i]]; return <div key={i} className="fslot" onClick={() => c && toggle(c.id)}>
          {c ? <><img src={c.image} alt="" /><b>{c.name}</b></> : <span>{i + 1}</span>}</div> })}
        <button className="btn primary" disabled={sel.length !== 5} onClick={() => onLock(sel)}>Lock in team</button>
      </div>
    </div>
    <input className="search" placeholder="Search characters or anime…" value={q} onChange={e => setQ(e.target.value)} />
    <div className="fgrid">
      {shown.map(c => <CharTile key={c.id} c={c} on={sel.includes(c.id)} off={!!takenBy[c.id]}
        sub={takenBy[c.id] ? `taken by ${name(takenBy[c.id])}` : c.media_title} onClick={() => toggle(c.id)} />)}
    </div>
  </div>
}

function Standings({ teams, byId, who, me, charPts, dead, openProfile, events, S }) {
  // hall of fame: winner of each finished season
  const past = {}
  for (const e of events) if (e.season !== S.key) ((past[e.season] ||= {})[e.team_user] = (past[e.season][e.team_user] || 0) + e.points)
  const champs = Object.entries(past).map(([s, t]) => { const [u, p] = Object.entries(t).sort((a, b) => b[1] - a[1])[0]; return { s, u, p } }).sort((a, b) => b.s.localeCompare(a.s))
  const feed = events.filter(e => e.season === S.key).slice(0, 25)
  return <div className="rank">
    <section>
      {teams.map((t, i) => { const p = who(t.user); return <div key={t.user} className={`card fteam ${t.user === me.id ? 'me' : ''}`}>
        <div className="fpos">{i === 0 ? '👑' : i + 1}</div>
        <div className="grow">
          <div className="row"><b className="fname" onClick={() => openProfile(t.user)}>{p?.username || '?'}</b><span className="muted small">{pts(t.week)} this week</span></div>
          <div className="fmini">{t.chars.map(id => { const c = byId[id]; return c && <span key={id} className={dead[id] ? 'dead' : ''} title={`${c.name}: ${charPts[id] || 0} pts`}>
            <img src={c.image} alt="" />{charPts[id] || 0}</span> })}</div>
        </div>
        <div className="ftotal">{t.total}<small>pts</small></div>
      </div> })}
      {!teams.length && <div className="card pad muted">No teams yet.</div>}
    </section>
    <aside>
      <h3>Latest points</h3>
      <div className="card">{feed.map(e => <div key={e.id} className="lrow">
        <span>{KINDS[e.kind]?.[0]}</span>
        <div className="grow small"><b>{byId[e.char_id]?.name || who(e.team_user)?.username}</b> {KINDS[e.kind]?.[1].toLowerCase()}<div className="muted">{e.note}</div></div>
        <b className={e.points < 0 ? 'down' : 'up'}>{pts(e.points)}</b>
      </div>)}{!feed.length && <div className="pad muted small">Points land as episodes and chapters drop.</div>}</div>
      <h3>Hall of fame</h3>
      <div className="card">{champs.map(c => <div key={c.s} className="lrow"><span>🏆</span><div className="grow">{who(c.u)?.username}<div className="muted small">{seasonLabel(c.s)}</div></div><b>{c.p}</b></div>)}
        {!champs.length && <div className="pad muted small">The first champion is crowned when {S.label} ends.</div>}</div>
    </aside>
  </div>
}

function MyTeam({ team, byId, chars, takenBy, name, charPts, dead, events, swapped, onSwap }) {
  const [out, setOut] = useState(null)
  const [q, setQ] = useState('')
  return <div className="rank">
    <section>
      <div className="fgrid five">
        {team.chars.map(id => <CharTile key={id} c={byId[id]} on={out === id} sub={dead[id] ? '💀 dead: scores 0 until they return' : `${charPts[id] || 0} pts`}>
          {!swapped && <button className="btn sm" onClick={() => setOut(out === id ? null : id)}>{out === id ? 'Cancel' : 'Swap'}</button>}
        </CharTile>)}
      </div>
      {swapped && <p className="muted small">You've used this week's swap.</p>}
      {out && <div className="card pad">
        <h3>Swap out {byId[out]?.name} for…</h3>
        <input className="search" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="fgrid">{chars.filter(c => !takenBy[c.id] && (!q || (c.name + c.media_title).toLowerCase().includes(q.toLowerCase()))).slice(0, 40).map(c =>
          <CharTile key={c.id} c={c} onClick={() => { onSwap(out, c.id); setOut(null) }} />)}</div>
      </div>}
    </section>
    <aside>
      <h3>Your points log</h3>
      <div className="card">{events.slice(0, 40).map(e => <div key={e.id} className="lrow">
        <span>{KINDS[e.kind]?.[0]}</span><div className="grow small"><b>{byId[e.char_id]?.name || 'Team'}</b> {KINDS[e.kind]?.[1].toLowerCase()}<div className="muted">wk {e.week} · {e.note}</div></div>
        <b className={e.points < 0 ? 'down' : 'up'}>{pts(e.points)}</b></div>)}
        {!events.length && <div className="pad muted small">Nothing yet. Points come in as your characters' shows air.</div>}</div>
    </aside>
  </div>
}

function LogTab({ picks, byId, name, me, pending, onLog, onReview }) {
  const [c, setC] = useState('')
  const [k, setK] = useState('win')
  const [note, setNote] = useState('')
  const [link, setLink] = useState('')
  return <div className="rank">
    <section>
      <div className="card pad">
        <h2>Log a moment</h2>
        <p className="muted">Saw a character on someone's team transform, win, lose or die? Log it. It counts once a squad mate who didn't log it confirms.</p>
        <select value={c} onChange={e => setC(e.target.value)}>
          <option value="">Choose a character…</option>
          {picks.map(p => byId[p.char_id] && <option key={p.char_id} value={p.char_id}>{byId[p.char_id].name} ({name(p.user_id)})</option>)}
        </select>
        <div className="fkinds">{LOGGABLE.map(([kk, p]) => <button key={kk} className={`btn sm ${k === kk ? 'primary' : ''}`} onClick={() => setK(kk)}>{KINDS[kk][0]} {KINDS[kk][1]} {p ? pts(p) : ''}</button>)}</div>
        <input placeholder="What happened? e.g. Ep 12, beats Sukuna" maxLength={200} value={note} onChange={e => setNote(e.target.value)} />
        <input placeholder="Proof link (optional)" maxLength={300} value={link} onChange={e => setLink(e.target.value)} />
        <button className="btn primary" disabled={!c} onClick={() => { onLog(+c, k, note, link); setNote(''); setLink('') }}>Log it</button>
      </div>
    </section>
    <aside>
      <h3>Waiting for a second opinion</h3>
      <div className="card">{pending.map(e => <div key={e.id} className="lrow">
        <span>{KINDS[e.kind]?.[0]}</span>
        <div className="grow small"><b>{byId[e.char_id]?.name}</b> {KINDS[e.kind]?.[1].toLowerCase()} <b>{pts(e.points)}</b>
          <div className="muted">{e.note}{e.link && <> · <a href={e.link} target="_blank" rel="noreferrer">proof</a></>} · logged by {name(e.logged_by)}</div></div>
        {e.logged_by !== me.id ? <><button className="btn sm primary" onClick={() => onReview(e.id, true)}>✓</button><button className="btn sm" onClick={() => onReview(e.id, false)}>✗</button></>
          : <span className="muted small">yours</span>}
      </div>)}{!pending.length && <div className="pad muted small">Nothing waiting.</div>}</div>
    </aside>
  </div>
}

function Vote({ S, teams, byId, name, me, votes, reload, setErr }) {
  const games = matchups(teams.map(t => t.user), S.week)
  const team = id => teams.find(t => t.user === id)
  const cast = async (a, b, pick) => {
    const { error } = await sb.from('fantasy_votes').upsert({ season: S.key, week: S.week, a_user: a, b_user: b, voter: me.id, pick })
    if (error) setErr(error.message); else reload()
  }
  return <div>
    <p className="muted">This week's matchups. Vote for whose 5 have been more hyped. The winner of each gets +5 when the week ends. You can't vote in your own matchup.</p>
    {games.map(([a, b]) => { const mineVote = votes.find(v => v.a_user === a && v.b_user === b && v.voter === me.id)?.pick
      const n = u => votes.filter(v => v.a_user === a && v.b_user === b && v.pick === u).length
      const inIt = me.id === a || me.id === b
      return <div key={a + b} className="card fmatch">
        {[a, b].map((u, i) => <div key={u} className={`fside ${mineVote === u ? 'on' : ''}`}>
          <b>{name(u)}</b>
          <div className="fmini">{team(u).chars.map(id => byId[id] && <span key={id}><img src={byId[id].image} alt="" title={byId[id].name} /></span>)}</div>
          {inIt ? <span className="muted small">{n(u)} vote{n(u) === 1 ? '' : 's'}</span> : <button className="btn sm primary" onClick={() => cast(a, b, u)}>{mineVote === u ? 'Voted ✓' : 'Hyper'} · {n(u)}</button>}
        </div>)}
        <div className="bvs">VS</div>
      </div> })}
    {!games.length && <div className="card pad muted">Needs at least 2 teams.</div>}
  </div>
}

function Rules() {
  const auto = [['📺', 'Their show airs a new episode', '+10'], ['📖', 'Their manga drops a new chapter', '+8'], ['📈', 'Wikipedia hype spike (weekly)', 'up to +15'],
    ['💜', 'New AniList fans vs their usual (weekly)', 'up to +10'], ['🔥', 'Their show is trending (weekly)', '+5'], ['💤', 'No episode or chapter for 2+ weeks (weekly)', '−5']]
  const squad = [['⚡', 'Transformation or power-up', '+20'], ['🏆', 'Wins a fight', '+15'], ['👀', 'Appears in a new episode/chapter', '+3'], ['💥', 'Loses a fight', '−5'], ['💀', 'Dies (then scores 0 until they come back)', '−20']]
  const T = (title, rows) => <div className="card pad"><h3>{title}</h3>{rows.map(([i, l, p]) => <div key={l} className="lrow"><span>{i}</span><div className="grow">{l}</div><b>{p}</b></div>)}</div>
  return <div className="frules">
    {T('Automatic', auto)}
    {T('Logged by the squad (needs a second person)', squad)}
    {T('Squad vote', [['🗳️', "Win your weekly \"who's hyper?\" matchup", '+5']])}
    <p className="muted small">Seasons follow the anime seasons. Teams lock for the season with one swap a week. Most points when the season ends takes the crown and a spot in the hall of fame.</p>
  </div>
}
