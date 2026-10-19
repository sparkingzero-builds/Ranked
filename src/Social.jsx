import { useEffect, useMemo, useState } from 'react'
import { sb, logActivity } from './cloud.js'
import { fetchUser, fetchList, title } from './api.js'
import { ACH, ACHIEVEMENTS } from './achievements.js'
import { coins, pct, START_CASH } from './market.js'

const ago = t => {
  const m = Math.round((Date.now() - new Date(t)) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`
}

async function anilistMedia(ids) {
  if (!ids.length) return {}
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `query($ids:[Int]){ Page(perPage:50){ media(id_in:$ids){ id title { romaji english } coverImage { large medium } } } }`, variables: { ids } }),
  }).then(r => r.json()).catch(() => null)
  return Object.fromEntries((r?.data?.Page?.media || []).map(m => [m.id, m]))
}

// ---------- notification bell (order fills, price alerts) ----------
export function Bell({ me }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const load = () => sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(25).then(({ data }) => setItems(data || []))
  useEffect(() => {
    if (!sb || !me) return
    load()
    const ch = sb.channel('my-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` }, load).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [me?.id])
  if (!sb || !me) return null
  const unread = items.filter(n => !n.read).length
  async function toggle() {
    setOpen(!open)
    if (!open && unread) {
      await sb.from('notifications').update({ read: true }).eq('user_id', me.id).eq('read', false)
      setTimeout(load, 300)
    }
  }
  return (
    <div className="bell" onClick={toggle} title="Notifications">🔔{unread > 0 && <span className="dot">{unread}</span>}
      {open && <div className="bellpop" onClick={e => e.stopPropagation()}>
        {items.map(n => <div key={n.id} className={n.read ? '' : 'unread'}>{n.text}<small>{ago(n.created_at) === 'just now' ? 'just now' : `${ago(n.created_at)} ago`}</small></div>)}
        {!items.length && <div>No notifications yet. Set a price alert or limit order on the Market.</div>}
      </div>}
    </div>
  )
}

// ---------- Squad page: activity feed, polls, friends ----------
export function Squad({ me, friends, openProfile }) {
  const [tab, setTab] = useState('feed')
  if (!sb || !me) return <div className="card pad muted">Sign in to see your squad.</div>
  return (
    <div className="rank">
      <section>
        <div className="tabs squadtabs">
          <button className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>Activity</button>
          <button className={tab === 'polls' ? 'on' : ''} onClick={() => setTab('polls')}>Hot takes</button>
        </div>
        {tab === 'feed' ? <Feed friends={friends} openProfile={openProfile} /> : <Polls me={me} friends={friends} />}
      </section>
      <aside>
        <h3>The squad</h3>
        <div className="card">
          {friends.map(f => <div key={f.id} className="lrow drag" onClick={() => openProfile(f.id)}>
            <div className="grow">{f.username}{f.id === me.id && <span className="muted small"> (you)</span>}
              <div className="muted small">{f.anilist_name ? `AniList: ${f.anilist_name}` : 'no AniList linked'}</div></div>
            <span className="muted">›</span>
          </div>)}
        </div>
        <div className="muted small center">Invite friends: send them sparkingzero-builds.github.io/Ranked</div>
      </aside>
    </div>
  )
}

function feedText(a) {
  const p = a.payload || {}
  switch (a.kind) {
    case 'trade': return <>{p.qty > 0 ? 'bought' : 'sold'} <b>{Math.abs(p.qty)} ${p.sym}</b> @ {p.price}{p.pnl != null && <span className={p.pnl >= 0 ? 'up' : 'down'}> ({p.pnl >= 0 ? '+' : ''}{p.pnl})</span>}</>
    case 'rate': return <>rated <b>{p.title}</b> <span className="blue">★ {p.score}</span></>
    case 'top1': return <>crowned <b>{p.title}</b> their #1 anime 👑</>
    case 'achievement': return <>unlocked {ACH[p.key]?.icon} <b>{ACH[p.key]?.label || p.key}</b></>
    case 'poll': return <>asked: <b>{p.question}</b></>
    case 'char_top': return <>made <b>{p.name}</b> their #1 character</>
    case 'status': return <>{{ CURRENT: 'started watching', PLANNING: 'plans to watch', COMPLETED: 'finished', PAUSED: 'put on hold', DROPPED: 'dropped' }[p.status] || 'updated'} <b>{p.title}</b></>
    default: return a.kind
  }
}

function Feed({ friends, openProfile }) {
  const [items, setItems] = useState(null)
  const names = Object.fromEntries(friends.map(f => [f.id, f.username]))
  const load = () => sb.from('activity').select('*').order('created_at', { ascending: false }).limit(60).then(({ data }) => setItems(data || []))
  useEffect(() => {
    load()
    const ch = sb.channel('squad-feed').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, load).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])
  if (!items) return <div className="loading">Loading feed…</div>
  return (
    <div className="feed">
      {items.map(a => (
        <div key={a.id} className={`fitem k-${a.kind}`}>
          <b className="fwho" onClick={() => openProfile(a.user_id)}>{names[a.user_id] || '???'}</b> {feedText(a)}
          {a.payload?.cover && <img src={a.payload.cover} alt="" />}
          <span className="fago">{ago(a.created_at)}</span>
        </div>
      ))}
      {!items.length && <div className="card pad muted">Nothing yet. Trades, ratings, #1 picks and achievements show up here.</div>}
    </div>
  )
}

function Polls({ me, friends }) {
  const [polls, setPolls] = useState(null)
  const [votes, setVotes] = useState([])
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const names = Object.fromEntries(friends.map(f => [f.id, f.username]))
  const load = async () => {
    const [p, v] = await Promise.all([sb.from('polls').select('*').order('created_at', { ascending: false }).limit(50), sb.from('poll_votes').select('*')])
    setPolls(p.data || []); setVotes(v.data || [])
  }
  useEffect(() => {
    load()
    const ch = sb.channel('poll-votes').on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, load).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])
  async function create(e) {
    e.preventDefault()
    const options = opts.map(o => o.trim()).filter(Boolean)
    if (q.trim().length < 3 || options.length < 2) return
    const { error } = await sb.from('polls').insert({ question: q.trim(), options })
    if (!error) { logActivity('poll', { question: q.trim() }); setQ(''); setOpts(['', '']); load() }
  }
  const vote = async (poll, option) => { await sb.from('poll_votes').upsert({ poll_id: poll.id, option }); load() }
  if (!polls) return <div className="loading">Loading hot takes…</div>
  return (
    <>
      <form className="card pad newpoll" onSubmit={create}>
        <input className="search" placeholder="Drop a hot take… e.g. Is Bleach better than Naruto?" value={q} onChange={e => setQ(e.target.value)} maxLength={200} />
        {opts.map((o, i) => <input key={i} className="search" placeholder={`Option ${i + 1}`} value={o} maxLength={60}
          onChange={e => setOpts(opts.map((x, j) => j === i ? e.target.value : x))} />)}
        <div className="row gap end">
          {opts.length < 4 && <button type="button" className="pill ghost" onClick={() => setOpts([...opts, ''])}>+ Option</button>}
          <button className="pill">Post</button>
        </div>
      </form>
      {polls.map(p => {
        const pv = votes.filter(v => v.poll_id === p.id)
        const mine = pv.find(v => v.user_id === me.id)
        return (
          <div key={p.id} className="card pad poll">
            <div className="pq">{p.question}</div>
            <div className="muted small">{p.user_id ? names[p.user_id] || '???' : 'Ranked'} · {pv.length} vote{pv.length === 1 ? '' : 's'}</div>
            {p.options.map((o, i) => {
              const n = pv.filter(v => v.option === i).length, share = pv.length ? n / pv.length : 0
              return <button key={i} className={`popt ${mine?.option === i ? 'mine' : ''}`} onClick={() => vote(p, i)}>
                {mine && <div className="pfill" style={{ width: `${share * 100}%` }} />}
                <span>{o}</span>{mine && <b>{Math.round(share * 100)}%</b>}
              </button>
            })}
            {mine && pv.length > 0 && <div className="muted small pwho">{pv.map(v => `${names[v.user_id] || '?'}: ${p.options[v.option]}`).join(' · ')}</div>}
          </div>
        )
      })}
    </>
  )
}

// ---------- friend profile ----------
export function Profile({ id, me, myList, friends }) {
  const f = friends.find(x => x.id === id)
  const [d, setD] = useState(null)
  useEffect(() => {
    if (!f) return
    setD(null)
    ;(async () => {
      const [st, w, ach, act, chars] = await Promise.all([
        sb.from('user_state').select('rankings, ratings, extra').eq('user_id', id).maybeSingle(),
        sb.from('wallets').select('cash, holdings, trades').eq('user_id', id).maybeSingle(),
        sb.from('achievements').select('key, unlocked_at').eq('user_id', id),
        sb.from('activity').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(15),
        sb.from('characters').select('id, sym, name, image, price'),
      ])
      const top = (st.data?.rankings?.['10'] || []).slice(0, 10)
      const [media, user, list] = await Promise.all([
        anilistMedia(top),
        f.anilist_name ? fetchUser(f.anilist_name).catch(() => null) : null,
        f.anilist_name ? fetchList(f.anilist_name).catch(() => []) : [],
      ])
      setD({ st: st.data || {}, w: w.data, ach: ach.data || [], act: act.data || [], chars: Object.fromEntries((chars.data || []).map(c => [c.id, c])), top, media, user, list })
    })()
  }, [id])

  const match = useMemo(() => {
    if (!d || id === me.id) return null
    const theirs = new Map(d.list.map(e => [e.media.id, e.score]))
    const shared = myList.filter(e => e.score && theirs.get(e.media.id))
    if (shared.length < 3) return null
    const diff = shared.reduce((a, e) => a + Math.abs(e.score - theirs.get(e.media.id)), 0) / shared.length
    return { pct: Math.round(Math.max(0, 100 - diff * 12)), n: shared.length }
  }, [d, myList])

  if (!f) return <div className="card pad muted">Unknown player.</div>
  if (!d) return <div className="loading">Loading {f.username}…</div>
  const holdings = Object.entries(d.w?.holdings || {}).map(([cid, h]) => ({ c: d.chars[cid], ...h })).filter(x => x.c)
  const worth = Number(d.w?.cash ?? START_CASH) + holdings.reduce((a, x) => a + x.c.price * x.qty, 0)
  const unlocked = new Set(d.ach.map(a => a.key))
  const chars = d.st.extra?.chars || []
  const completed = d.list.filter(e => e.status === 'COMPLETED').length

  return (
    <div className="profile">
      <div className="card pad phead">
        {d.user?.avatar?.medium && <img src={d.user.avatar.medium} alt="" />}
        <div className="grow">
          <div className="pname">{f.username}</div>
          <div className="muted small">{f.anilist_name ? `AniList: ${f.anilist_name}` : 'No AniList linked'} · {completed} completed · {unlocked.size} achievements</div>
        </div>
        {match && <div className="pmatch"><b>{match.pct}%</b><span>taste match</span></div>}
        <div className="pmatch"><b>{coins(worth)}</b><span className={worth >= START_CASH ? 'up' : 'down'}>{pct(worth / START_CASH - 1)}</span></div>
      </div>

      <h3>Top 10 anime</h3>
      {d.top.length ? <div className="coverrow">{d.top.map((mid, i) => d.media[mid] && <div key={mid} className="bcard">
        <div className="cover" style={{ backgroundImage: `url(${d.media[mid].coverImage.large})` }}><span className="score">#{i + 1}</span></div>
        <div className="bt">{title(d.media[mid])}</div></div>)}</div> : <div className="card pad muted">No Top 10 yet.</div>}

      {chars.length > 0 && <>
        <h3>Top characters</h3>
        <div className="coverrow">{chars.map((c, i) => <div key={c.id} className="bcard">
          <div className="cover" style={{ backgroundImage: `url(${c.image})` }}><span className="score">#{i + 1}</span></div>
          <div className="bt">{c.name}</div></div>)}</div>
      </>}

      <div className="two">
        <div>
          <h3>Achievements</h3>
          <div className="achgrid">{ACHIEVEMENTS.map(a => <div key={a.key} className={`ach ${unlocked.has(a.key) ? 'on' : ''}`} title={a.desc}>
            <span>{a.icon}</span><b>{a.label}</b><small>{a.desc}</small></div>)}</div>
        </div>
        <div>
          <h3>Portfolio</h3>
          <div className="card pad">
            {holdings.sort((a, b) => b.c.price * b.qty - a.c.price * a.qty).map(x => <div key={x.c.id} className="mini">
              <img src={x.c.image} alt="" /><span className="grow">${x.c.sym} × {x.qty}</span>
              <span className={x.c.price >= x.avg ? 'up' : 'down'}>{coins(x.c.price * x.qty)}</span></div>)}
            {!holdings.length && <span className="muted">No positions.</span>}
          </div>
          <h3>Recent</h3>
          <div className="feed small">{d.act.map(a => <div key={a.id} className="fitem">{feedText(a)}<span className="fago">{ago(a.created_at)}</span></div>)}
            {!d.act.length && <div className="muted">Nothing yet.</div>}</div>
        </div>
      </div>
    </div>
  )
}
