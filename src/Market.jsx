import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { sb, fetchAll } from './cloud.js'
import { coins, pct, change24, powerGap, SOURCES, START_CASH, TICK_MS } from './market.js'

const RANGES = [['6H', 6], ['24H', 24], ['3D', 72], ['7D', 168]]
const ago = t => {
  const m = Math.round((Date.now() - new Date(t)) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}

// Live market state from Supabase, refreshed on realtime changes (debounced: a tick updates 50 rows at once)
function useMarket(me) {
  const [chars, setChars] = useState(null)
  const [sparks, setSparks] = useState({})
  const [news, setNews] = useState([])
  const [wallet, setWallet] = useState(null)
  const [events, setEvents] = useState([])
  const timer = useRef()
  const sparkAt = useRef(0)

  async function load() {
    sb.from('market_events').select('*').gt('ends_at', new Date().toISOString()).then(({ data }) => setEvents(data || []))
    const [c, n, w] = await Promise.all([
      fetchAll(() => sb.from('characters').select('id, name, sym, image, media_title, color, price, price_24h, power, p0, base, hype, hype_at, ipo_at, event_until, event_label, event_key, updated_at').order('id')).then(data => ({ data })),
      sb.from('news').select('*').order('created_at', { ascending: false }).limit(40),
      sb.from('wallets').select('*').eq('user_id', me.id).maybeSingle(),
    ])
    setChars(c.data || [])
    if (Date.now() - sparkAt.current > 15 * 60000) {
      sparkAt.current = Date.now()
      fetchAll(() => sb.rpc('sparklines')).then(rows => setSparks(Object.fromEntries(rows.map(r => [r.char_id, r.prices.map(Number)])))).catch(() => {})
    }
    setNews(n.data || [])
    setWallet(w.data || { cash: START_CASH, holdings: {}, trades: [] })
  }
  useEffect(() => {
    load()
    const ch = sb.channel('market-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, () => { clearTimeout(timer.current); timer.current = setTimeout(load, 1500) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news' }, () => { clearTimeout(timer.current); timer.current = setTimeout(load, 1500) })
      .subscribe()
    return () => { sb.removeChannel(ch); clearTimeout(timer.current) }
  }, [me.id])
  return { chars, sparks, news, wallet, setWallet, events }
}

export default function Market({ me, friends = [] }) {
  if (!sb || !me) return <div className="card pad muted">The market runs online. Sign in to trade with the squad.</div>
  return <MarketLive me={me} friends={friends} />
}

function MarketLive({ me, friends }) {
  const { chars, sparks, news, wallet, setWallet, events } = useMarket(me)
  const [selId, setSelId] = useState(null)
  const [view, setView] = useState('market')
  const [sort, setSort] = useState('hype')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  const byId = useMemo(() => Object.fromEntries((chars || []).map(c => [c.id, c])), [chars])
  // pin the first stock once so the panel doesn't jump when the list re-sorts on each tick
  useEffect(() => { if (chars?.length && selId == null) setSelId([...chars].sort((x, y) => y.hype - x.hype)[0].id) }, [chars])
  if (!chars || !wallet) return <div className="loading">Opening the market…</div>
  if (!chars.length) return <div className="card pad muted">The market hasn't opened yet. Stocks are being listed.</div>

  const sel = byId[selId] || chars[0]
  const holdingsValue = Object.entries(wallet.holdings || {}).reduce((a, [id, h]) => a + (Number(byId[id]?.price) || 0) * h.qty, 0)
  const worth = Number(wallet.cash) + holdingsValue
  const pnl = worth - START_CASH
  const [limit, setLimit] = useState(60)
  useEffect(() => setLimit(60), [q, sort])

  async function trade(c, qty) {
    setErr('')
    const { data, error } = await sb.rpc('trade', { p_char: c.id, p_qty: qty })
    if (error) setErr(error.message); else setWallet(data)
  }
  async function reset() {
    if (!confirm('Reset your wallet to 10,000 coins?')) return
    const { data } = await sb.rpc('reset_wallet'); if (data) setWallet(data)
  }

  const sorters = {
    hype: (a, b) => b.hype - a.hype,
    events: (a, b) => eventScore(b) - eventScore(a) || b.hype - a.hype,
    gap: (a, b) => powerGap(b) - powerGap(a),
    gain: (a, b) => change24(b) - change24(a),
    loss: (a, b) => change24(a) - change24(b),
    price: (a, b) => b.price - a.price,
  }
  const list = chars.filter(c => (c.sym + c.name).toLowerCase().includes(q.toLowerCase())).sort(sorters[sort])
  const tape = news.length ? news : chars.slice().sort((a, b) => Math.abs(change24(b)) - Math.abs(change24(a))).slice(0, 6)
    .map(c => ({ id: c.id, up: change24(c) >= 0, text: `$${c.sym} ${change24(c) >= 0 ? 'UP' : 'DOWN'} ${Math.abs(change24(c) * 100).toFixed(1)}% TODAY` }))

  return (
    <div className="market">
      <div className="tape"><div className="tapein">
        {[...tape, ...tape].map((n, i) => <span key={i} className={n.up ? 'up' : 'down'}>{n.up ? '▲' : '▼'} {n.text}</span>)}
      </div></div>

      {events.map(e => <div key={e.id} className={`mevent k-${e.kind}`}>
        <b>{e.title}</b><span>ends in <Ticker fn={() => fmtLeft(new Date(e.ends_at) - Date.now())} /></span>
      </div>)}

      <div className="mhud">
        <div className="hudbox"><span>Net worth</span><b>{coins(worth)}</b></div>
        <div className="hudbox"><span>P/L</span><b className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}{coins(pnl)}</b></div>
        <div className="hudbox"><span>Cash</span><b>{coins(wallet.cash)}</b></div>
        <div className="hudbox"><span>Next tick</span><b><Ticker fn={() => { const t = Math.ceil((TICK_MS - (Date.now() % TICK_MS)) / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }} /></b></div>
        <div className="tabs">
          {[['market', 'Market'], ['portfolio', 'Portfolio'], ['bets', 'Bets'], ['news', 'News'], ['board', 'Leaderboard']].map(([k, l]) =>
            <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
      </div>
      {err && <div className="error">{err}</div>}

      {view === 'market' && <div className="mgrid">
        <section>
          <div className="row gap mfilter">
            <input className="search" placeholder="Search ticker or name…" value={q} onChange={e => setQ(e.target.value)} />
            <select className="search msort" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="hype">Most hyped</option><option value="events">IPOs &amp; episode days</option><option value="gap">Biggest power gap</option>
              <option value="gain">Top gainers 24h</option><option value="loss">Top losers 24h</option><option value="price">Highest price</option>
            </select>
          </div>
          <div className="stocks">
            {list.slice(0, limit).map(c => <StockRow key={c.id} c={c} selected={sel === c} pts={sparks[c.id]} onPick={setSelId} />)}
          </div>
          {limit < list.length && <MoreSentinel onMore={() => setLimit(l => l + 60)} left={list.length - limit} />}
        </section>
        <aside><StockPanel c={sel} wallet={wallet} trade={trade} /></aside>
      </div>}

      {view === 'portfolio' && <OpenOrders byId={byId} />}
      {view === 'portfolio' && <Portfolio wallet={wallet} byId={byId} onPick={id => { setSelId(id); setView('market') }} reset={reset} />}
      {view === 'board' && <Leaderboard byId={byId} friends={friends} me={me} />}
      {view === 'bets' && <Bets chars={chars} byId={byId} friends={friends} me={me} wallet={wallet} refresh={async () => {
        const { data } = await sb.from('wallets').select('*').eq('user_id', me.id).maybeSingle(); if (data) setWallet(data)
      }} />}

      {view === 'news' && <div className="newsfeed">
        {news.map(n => {
          const c = byId[n.char_id]
          return <div key={n.id} className={`nitem ${n.up ? 'up' : 'down'}`} onClick={() => { if (c) { setSelId(c.id); setView('market') } }}>
            {c && <img src={c.image} alt="" />}
            <div className="grow"><div className="nhead">{n.text}</div>
              <div className="muted small">{SOURCES[n.source]?.icon} {SOURCES[n.source]?.label} · {ago(n.created_at)}{c && ` · $${c.sym} now ${coins(c.price)}`}</div></div>
          </div>
        })}
        {!news.length && <div className="card pad muted">No headlines yet. They drop when a character's hype jumps.</div>}
      </div>}
    </div>
  )
}

function HypeMeter({ h }) {
  const v = Number(h)
  return <span className={`hype-m ${v > 0.15 ? 'hot' : v < -0.1 ? 'cold' : ''}`}>{v > 0.4 ? '🔥🔥' : v > 0.15 ? '🔥' : v < -0.1 ? '🧊' : '·'} {v >= 0 ? '+' : ''}{Math.round(v * 100)}</span>
}

function Spark({ pts, up }) {
  if (!pts || pts.length < 2) return <svg className="spark" />
  const min = Math.min(...pts), max = Math.max(...pts)
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${30 - ((p - min) / (max - min || 1)) * 28}`).join(' ')
  return <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points={d} fill="none" stroke={up ? '#8cff5a' : '#ff2e63'} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
}

function Chart({ c, hours }) {
  const [pts, setPts] = useState(null)
  useEffect(() => {
    setPts(null)
    sb.from('price_ticks').select('t, price, power').eq('char_id', c.id).gte('t', new Date(Date.now() - hours * 3600000).toISOString()).order('t').limit(10000)
      .then(({ data }) => {
        const rows = data || [], step = Math.max(1, Math.floor(rows.length / 200))
        setPts(rows.filter((_, i) => i % step === 0 || i === rows.length - 1).map(r => ({ price: +r.price, target: (c.base * r.power) / c.p0 })))
      })
  }, [c.id, hours, c.updated_at])
  if (!pts) return <div className="chart" />
  if (pts.length < 2) return <div className="chart nochart muted">Chart builds up as the market ticks every 5 minutes.</div>
  const vals = pts.flatMap(p => [p.price, p.target])
  const min = Math.min(...vals) * 0.98, max = Math.max(...vals) * 1.02
  const W = 600, H = 240
  const x = i => (i / (pts.length - 1)) * W, y = v => H - ((v - min) / (max - min || 1)) * H
  const line = k => pts.map((p, i) => `${x(i)},${y(p[k])}`).join(' ')
  const up = pts[pts.length - 1].price >= pts[0].price
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={up ? '#8cff5a' : '#ff2e63'} stopOpacity=".35" /><stop offset="1" stopColor={up ? '#8cff5a' : '#ff2e63'} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${H} ${line('price')} ${W},${H}`} fill="url(#cg)" />
      <polyline points={line('target')} fill="none" stroke="#ffd60a" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      <polyline points={line('price')} fill="none" stroke={up ? '#8cff5a' : '#ff2e63'} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function WhyPanel({ c: base }) {
  const [hp, setHp] = useState(null)
  useEffect(() => { setHp(null); sb.from('characters').select('hype_parts').eq('id', base.id).single().then(({ data }) => setHp(data?.hype_parts || {})) }, [base.id, base.hype_at])
  const c = { ...base, hype_parts: hp || {} }
  const parts = Object.entries(c.hype_parts || {})
  return (
    <div className="why">
      <div className="whyhead"><span>Why it's moving</span>{c.hype_at && <em>updated {ago(c.hype_at)}</em>}</div>
      {parts.length ? Object.keys(SOURCES).filter(k => c.hype_parts[k]).map(k => {
        const p = c.hype_parts[k], s = p.score
        return <div key={k} className="whyrow" title={SOURCES[k].note}>
          <span className="wsrc">{SOURCES[k].icon} {SOURCES[k].label}</span>
          <div className="wbar"><div className={s >= 0 ? 'pos' : 'neg'} style={{ width: `${Math.min(100, Math.abs(s) * 100)}%` }} /></div>
          <span className="wlbl">{p.label}</span>
        </div>
      }) : <div className="muted small">Hype data arrives with the next hourly scan.</div>}
    </div>
  )
}

function StockPanel({ c, wallet, trade }) {
  const [hours, setHours] = useState(24)
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  if (!c) return null
  const h = wallet.holdings?.[c.id]
  const ch = change24(c)
  const maxBuy = Math.floor(wallet.cash / c.price)
  const gap = powerGap(c)
  const go = async n => { setBusy(true); await trade(c, n); setBusy(false) }
  return (
    <div className="spanel">
      <div className="shead" style={{ '--c': c.color || '#ffd60a' }}>
        <img src={c.image} alt="" />
        <div className="grow">
          <div className="ssym">{c.name}</div>
          <Badges c={c} big />
          <div className="sfull"><span className="tick">{c.sym}</span></div>
          <div className="muted small">{c.media_title}</div>
          <div className="sbig">{coins(c.price)} <span className={ch >= 0 ? 'up' : 'down'}>{pct(ch)}</span></div>
        </div>
      </div>
      <div className="tabs rtabs">{RANGES.map(([l, v]) => <button key={l} className={hours === v ? 'on' : ''} onClick={() => setHours(v)}>{l}</button>)}</div>
      <Chart c={c} hours={hours} />
      <div className="legend2"><span><i className="lp" />Price</span><span><i className="lt" />Power target (price follows this)</span></div>
      <div className="pstats">
        <div><span>Hype</span><b><HypeMeter h={c.hype} /></b></div>
        <div><span>Power</span><b>⚡{Math.round(c.power).toLocaleString()}</b></div>
        <div><span>Power gap</span><b className={gap >= 0 ? 'up' : 'down'}>{gap >= 0 ? '+' : ''}{(gap * 100).toFixed(1)}%</b></div>
      </div>
      <WhyPanel c={c} />
      <OrdersBox c={c} />
      <div className="tradebox">
        <div className="row gap">
          <button className="pill ghost" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
          <input className="search qty" type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, Math.floor(+e.target.value) || 1))} />
          <button className="pill ghost" onClick={() => setQty(qty + 1)}>+</button>
          <button className="pill ghost" onClick={() => setQty(Math.max(1, maxBuy))}>Max</button>
        </div>
        <div className="muted small">Total: {coins(c.price * qty)} coins · price locks when the trade hits the server</div>
        <div className="row gap">
          <button className="pill buy" disabled={busy || qty > maxBuy} onClick={() => go(qty)}>Buy</button>
          <button className="pill sell" disabled={busy || !h || qty > h.qty} onClick={() => go(-qty)}>Sell</button>
        </div>
        {h && <div className="hold">You own <b>{h.qty}</b> @ {coins(h.avg)} · P/L <b className={c.price >= h.avg ? 'up' : 'down'}>{coins((c.price - h.avg) * h.qty)}</b></div>}
      </div>
    </div>
  )
}

function Portfolio({ wallet, byId, onPick, reset }) {
  const rows = Object.entries(wallet.holdings || {}).map(([id, h]) => ({ c: byId[id], ...h })).filter(r => r.c)
  return (
    <div className="mgrid">
      <section>
        <h3>Holdings</h3>
        <div className="stocks">
          {rows.map(({ c, qty, avg }) => {
            const pl = (c.price - avg) * qty
            return <div key={c.id} className="srow" onClick={() => onPick(c.id)}>
              <img src={c.image} alt="" />
              <div className="sname"><b>{c.name}</b><span>{c.sym} · {qty} shares @ {coins(avg)}</span></div>
              <div className="sprice"><b>{coins(c.price * qty)}</b><span className={pl >= 0 ? 'up' : 'down'}>{pl >= 0 ? '+' : ''}{coins(pl)} ({pct(c.price / avg - 1)})</span></div>
            </div>
          })}
          {!rows.length && <div className="card pad muted">No positions yet. Look for high hype and a big power gap on the Market tab.</div>}
        </div>
      </section>
      <aside>
        <h3>Trade log</h3>
        <div className="card pad">
          {(wallet.trades || []).slice(0, 20).map((t, i) => <div key={i} className="mini">
            <b className={t.qty > 0 ? 'up' : 'down'}>{t.qty > 0 ? 'BUY' : 'SELL'}</b><span className="grow">${t.sym} × {Math.abs(t.qty)}</span><span className="muted">{coins(t.price)}</span></div>)}
          {!wallet.trades?.length && <span className="muted">No trades yet.</span>}
        </div>
        <div className="center"><button className="pill ghost" onClick={reset}>Reset wallet</button></div>
      </aside>
    </div>
  )
}

function Leaderboard({ byId, friends, me }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    const load = () => sb.from('wallets').select('user_id, cash, holdings').then(({ data }) => setRows(data || []))
    load()
    const ch = sb.channel('wallets-board').on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, load).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])
  if (!rows) return <div className="loading">Loading leaderboard…</div>
  const names = Object.fromEntries(friends.map(f => [f.id, f.username]))
  const board = rows.map(r => {
    const held = Object.entries(r.holdings || {})
    const value = held.reduce((a, [id, h]) => a + (Number(byId[id]?.price) || 0) * h.qty, 0)
    const best = held.map(([id, h]) => ({ c: byId[id], v: (Number(byId[id]?.price) || 0) * h.qty })).filter(x => x.c).sort((a, b) => b.v - a.v)[0]
    return { id: r.user_id, name: names[r.user_id] || '???', worth: Number(r.cash) + value, best }
  }).sort((a, b) => b.worth - a.worth)
  return (
    <div className="board">
      {board.map((r, i) => (
        <div key={r.id} className={`brow ${i < 3 ? `p${i + 1}` : ''} ${r.id === me?.id ? 'me' : ''}`}>
          <div className="bpos">#{i + 1}</div>
          <div className="grow"><b>{r.name}</b>{r.best && <span className="muted small">Biggest bag: {r.best.c.name}</span>}</div>
          <div className="bworth"><b>{coins(r.worth)}</b><span className={r.worth >= START_CASH ? 'up' : 'down'}>{pct(r.worth / START_CASH - 1)}</span></div>
        </div>
      ))}
    </div>
  )
}

const isIpo = c => c.ipo_at && Date.now() - new Date(c.ipo_at) < 48 * 3600000
const isEvent = c => c.event_until && new Date(c.event_until) > Date.now()
const eventScore = c => (isIpo(c) ? 2 : 0) + (isEvent(c) ? 1 : 0)

function Badges({ c, big }) {
  return <>
    {isIpo(c) && <span className={`badge ipo ${big ? 'big' : ''}`} title="New listing: +15% hype for 48h">IPO</span>}
    {isEvent(c) && (c.event_key?.startsWith('m')
      ? <span className={`badge ch ${big ? 'big' : ''}`} title={`Chapter day: ${c.event_label}`}>📚 {big ? c.event_label : 'CH DAY'}</span>
      : <span className={`badge ep ${big ? 'big' : ''}`} title={`Episode day: ${c.event_label}`}>🎬 {big ? c.event_label : 'EP DAY'}</span>)}
  </>
}

// Limit orders fill automatically on the next 5-minute tick that crosses your price; alerts notify you.
function OrdersBox({ c }) {
  const [mode, setMode] = useState(null)
  const [side, setSide] = useState('buy')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState('')
  const [mine, setMine] = useState({ orders: [], alerts: [] })
  const [msg, setMsg] = useState('')
  const load = () => Promise.all([
    sb.from('orders').select('*').eq('char_id', c.id).eq('status', 'open').order('created_at'),
    sb.from('alerts').select('*').eq('char_id', c.id).is('triggered_at', null).order('created_at'),
  ]).then(([o, a]) => setMine({ orders: o.data || [], alerts: a.data || [] }))
  useEffect(() => { load(); setMode(null); setPrice((+c.price).toFixed(2)) }, [c.id])
  useEffect(() => { load() }, [c.updated_at]) // refresh after each tick (fills, triggered alerts)

  async function submit() {
    const p = +price; setMsg('')
    if (!(p > 0)) return setMsg('Enter a price')
    const { error } = mode === 'order'
      ? await sb.from('orders').insert({ char_id: c.id, qty: side === 'buy' ? qty : -qty, limit_price: p })
      : await sb.from('alerts').insert({ char_id: c.id, above: side === 'buy', price: p })
    if (error) return setMsg(error.message)
    setMode(null); load()
  }
  return (
    <div className="orders">
      <div className="row gap">
        <button className={`pill ghost ${mode === 'order' ? 'act' : ''}`} onClick={() => { setMode(mode === 'order' ? null : 'order'); setSide('buy') }}>Limit order</button>
        <button className={`pill ghost ${mode === 'alert' ? 'act' : ''}`} onClick={() => { setMode(mode === 'alert' ? null : 'alert'); setSide('buy') }}>🔔 Alert</button>
      </div>
      {mode && <div className="oform">
        <div className="tabs">
          <button className={side === 'buy' ? 'on' : ''} onClick={() => setSide('buy')}>{mode === 'order' ? 'Buy at or below' : 'Rises above'}</button>
          <button className={side === 'sell' ? 'on' : ''} onClick={() => setSide('sell')}>{mode === 'order' ? 'Sell at or above' : 'Falls below'}</button>
        </div>
        <div className="row gap">
          {mode === 'order' && <input className="search qty" type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, Math.floor(+e.target.value) || 1))} title="Shares" />}
          <input className="search qty wide" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} title="Price" />
          <button className="pill" onClick={submit}>Set</button>
        </div>
        {msg && <div className="error small">{msg}</div>}
      </div>}
      {mine.orders.map(o => <div key={o.id} className="oline">
        <span className={o.qty > 0 ? 'up' : 'down'}>{o.qty > 0 ? 'BUY' : 'SELL'} {Math.abs(o.qty)}</span> @ {coins(o.limit_price)}
        <button className="x" onClick={async () => { await sb.rpc('cancel_order', { p_id: o.id }); load() }}>×</button></div>)}
      {mine.alerts.map(a => <div key={a.id} className="oline">🔔 {a.above ? 'above' : 'below'} {coins(a.price)}
        <button className="x" onClick={async () => { await sb.from('alerts').delete().eq('id', a.id); load() }}>×</button></div>)}
    </div>
  )
}

function OpenOrders({ byId }) {
  const [orders, setOrders] = useState([])
  const load = () => sb.from('orders').select('*').order('created_at', { ascending: false }).limit(30).then(({ data }) => setOrders(data || []))
  useEffect(() => { load() }, [])
  if (!orders.length) return null
  return (
    <div className="card pad openorders">
      <h3 className="m0">Orders</h3>
      {orders.map(o => {
        const c = byId[o.char_id]
        return <div key={o.id} className="mini">
          <b className={o.qty > 0 ? 'up' : 'down'}>{o.qty > 0 ? 'BUY' : 'SELL'}</b>
          <span className="grow">{c?.name} × {Math.abs(o.qty)} @ {coins(o.limit_price)}</span>
          <span className={`ostatus ${o.status}`}>{o.status}{o.status === 'filled' && ` @ ${coins(o.fill_price)}`}</span>
          {o.status === 'open' && <button className="x" onClick={async () => { await sb.rpc('cancel_order', { p_id: o.id }); load() }}>×</button>}
        </div>
      })}
    </div>
  )
}

const fmtLeft = ms => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
}

// Squad bets: which of two stocks gains more (in %) by the deadline. Winners split the pot.
function Bets({ chars, byId, friends, me, wallet, refresh }) {
  const [bets, setBets] = useState(null)
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState({ a: '', b: '', stake: 100, days: 1, pick: 'a' })
  const [err, setErr] = useState('')
  const names = Object.fromEntries(friends.map(f => [f.id, f.username]))
  const bySym = Object.fromEntries(chars.map(c => [c.sym, c]))
  const load = async () => {
    const [b, e] = await Promise.all([sb.from('bets').select('*').order('created_at', { ascending: false }).limit(40), sb.from('bet_entries').select('*')])
    setBets(b.data || []); setEntries(e.data || [])
  }
  useEffect(() => {
    load()
    const ch = sb.channel('bets-live').on('postgres_changes', { event: '*', schema: 'public', table: 'bet_entries' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, load).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [])
  const resolve = v => bySym[v.trim().toUpperCase()] || chars.find(c => c.name.toLowerCase() === v.trim().toLowerCase())

  async function create(e) {
    e.preventDefault(); setErr('')
    const a = resolve(form.a), b = resolve(form.b)
    if (!a || !b) return setErr('Pick two stocks from the list')
    const { error } = await sb.rpc('create_bet', { p_a: a.id, p_b: b.id, p_stake: +form.stake, p_days: +form.days, p_pick: form.pick })
    if (error) return setErr(error.message)
    setForm({ ...form, a: '', b: '' }); load(); refresh()
  }
  async function join(bet, pick) {
    setErr('')
    const { error } = await sb.rpc('join_bet', { p_bet: bet.id, p_pick: pick })
    if (error) return setErr(error.message)
    load(); refresh()
  }
  if (!bets) return <div className="loading">Loading bets…</div>

  return (
    <div className="mgrid">
      <section>
        {err && <div className="error">{err}</div>}
        <h3>Open bets</h3>
        {bets.filter(b => b.status === 'open').map(b => <BetCard key={b.id} b={b} byId={byId} entries={entries.filter(e => e.bet_id === b.id)} names={names} me={me} join={join} />)}
        {!bets.some(b => b.status === 'open') && <div className="card pad muted">No open bets. Start one and challenge the squad.</div>}
        <h3>Finished</h3>
        {bets.filter(b => b.status !== 'open').slice(0, 10).map(b => <BetCard key={b.id} b={b} byId={byId} entries={entries.filter(e => e.bet_id === b.id)} names={names} me={me} />)}
        {!bets.some(b => b.status !== 'open') && <div className="card pad muted">Nothing settled yet.</div>}
      </section>
      <aside>
        <h3>New bet</h3>
        <form className="card pad betform" onSubmit={create}>
          <datalist id="stocklist">{chars.map(c => <option key={c.id} value={c.sym}>{c.name}</option>)}</datalist>
          <label className="lbl">Stock A</label>
          <input className="search" list="stocklist" placeholder="Ticker or name, e.g. GOJO" value={form.a} onChange={e => setForm({ ...form, a: e.target.value })} />
          <label className="lbl">Stock B</label>
          <input className="search" list="stocklist" placeholder="e.g. LUFFY" value={form.b} onChange={e => setForm({ ...form, b: e.target.value })} />
          <div className="row gap">
            <div><label className="lbl">Stake</label><input className="search qty wide" type="number" min="10" max="5000" value={form.stake} onChange={e => setForm({ ...form, stake: e.target.value })} /></div>
            <div><label className="lbl">Length</label>
              <div className="tabs">{[1, 3, 7].map(d => <button type="button" key={d} className={+form.days === d ? 'on' : ''} onClick={() => setForm({ ...form, days: d })}>{d}d</button>)}</div></div>
          </div>
          <label className="lbl">Your pick</label>
          <div className="tabs">
            <button type="button" className={form.pick === 'a' ? 'on' : ''} onClick={() => setForm({ ...form, pick: 'a' })}>{resolve(form.a)?.name || 'Stock A'}</button>
            <button type="button" className={form.pick === 'b' ? 'on' : ''} onClick={() => setForm({ ...form, pick: 'b' })}>{resolve(form.b)?.name || 'Stock B'}</button>
          </div>
          <div className="muted small">Whichever gains more % by the deadline wins. Everyone stakes {form.stake} coins; winners split the pot. You have {coins(wallet.cash)}.</div>
          <button className="pill lgo">Start bet</button>
        </form>
      </aside>
    </div>
  )
}

function BetCard({ b, byId, entries, names, me, join }) {
  const A = byId[b.char_a], B = byId[b.char_b]
  if (!A || !B) return null
  const ca = b.status === 'open' ? A.price / b.a_start - 1 : +b.a_change
  const cb = b.status === 'open' ? B.price / b.b_start - 1 : +b.b_change
  const mine = entries.find(e => e.user_id === me.id)
  const side = (k, c, ch) => {
    const who = entries.filter(e => e.pick === k)
    const won = b.status !== 'open' && b.winner === k
    return <div className={`bside ${won ? 'won' : ''} ${mine?.pick === k ? 'mine' : ''}`}>
      <img src={c.image} alt="" />
      <div className="grow"><b>{c.name}</b><span className={ch >= 0 ? 'up' : 'down'}>{pct(ch)}</span>
        <small>{who.map(e => names[e.user_id] || '?').join(', ') || 'no backers'}</small></div>
      {join && !mine && <button className="pill" onClick={() => join(b, k)}>Back</button>}
      {won && <span className="crown">👑</span>}
    </div>
  }
  return (
    <div className="card pad betcard">
      <div className="row"><span className="muted small">by {names[b.creator] || '?'} · {coins(b.stake)} coins each · pot {coins(b.stake * entries.length)}</span>
        <span className="muted small">{b.status === 'open' ? `ends in ${fmtLeft(new Date(b.ends_at) - Date.now())}` : b.status === 'void' ? 'refunded' : 'settled'}</span></div>
      <div className="bsides">{side('a', A, ca)}<div className="bvs">VS</div>{side('b', B, cb)}</div>
    </div>
  )
}

// re-renders only itself once a second (countdowns), instead of the whole market
function Ticker({ fn }) {
  const [, force] = useState(0)
  useEffect(() => { const i = setInterval(() => force(x => x + 1), 1000); return () => clearInterval(i) }, [])
  return fn()
}

const StockRow = memo(function StockRow({ c, selected, pts, onPick }) {
  const ch = change24(c), gap = powerGap(c)
  return (
    <div className={`srow ${selected ? 'sel' : ''}`} onClick={() => onPick(c.id)}>
      <img src={c.image} alt="" loading="lazy" decoding="async" />
      <div className="sname"><b>{c.name}<Badges c={c} /></b><span className="tick">{c.sym}</span></div>
      <Spark pts={pts} up={ch >= 0} />
      <div className="sprice"><b>{coins(c.price)}</b><span className={ch >= 0 ? 'up' : 'down'}>{pct(ch)}</span></div>
      <div className={`sgap ${gap > 0.03 ? 'hot' : gap < -0.03 ? 'cold' : ''}`} title="Power vs price: positive means price hasn't caught up yet">
        <HypeMeter h={c.hype} /><span>{gap > 0 ? '+' : ''}{(gap * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
})

// loads the next batch of rows when it scrolls into view
function MoreSentinel({ onMore, left }) {
  const ref = useRef()
  useEffect(() => {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) onMore() }, { rootMargin: '400px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [onMore])
  return <button ref={ref} className="pill ghost more" onClick={onMore}>Show more ({left} left)</button>
}
