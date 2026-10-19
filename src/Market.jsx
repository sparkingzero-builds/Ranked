import { useEffect, useMemo, useState } from 'react'
import { fetchTopCharacters, title } from './api.js'
import { useStored } from './App.jsx'
import { sb, useRowSync } from './cloud.js'
import { stock, symbolFor, change, powerGap, series, news, currentTick, tickTime, coins, pct, START_CASH } from './market.js'

const RANGES = [['1H', 60], ['24H', 1440], ['7D', 10080], ['ALL', Infinity]]

function useCharacters() {
  const [chars, setChars] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem('ranked.chars')); if (c && Date.now() - c.at < 86400000) return c.list } catch {}
    return null
  })
  useEffect(() => {
    if (chars) return
    fetchTopCharacters().then(list => {
      setChars(list)
      try { localStorage.setItem('ranked.chars', JSON.stringify({ at: Date.now(), list })) } catch {}
    }).catch(() => {})
  }, [])
  return chars
}

export default function Market({ me, friends = [] }) {
  const chars = useCharacters()
  const [tick, setTick] = useState(currentTick())
  const [wallet, setWallet] = useStored('ranked.wallet', { cash: START_CASH, holdings: {}, trades: [] })
  useRowSync('wallets', me?.id, [
    { col: 'cash', value: wallet.cash, set: v => setWallet(w => ({ ...w, cash: Number(v) })) },
    { col: 'holdings', value: wallet.holdings, set: v => setWallet(w => ({ ...w, holdings: v })) },
    { col: 'trades', value: wallet.trades, set: v => setWallet(w => ({ ...w, trades: v })) },
  ])
  const [selId, setSelId] = useState(null)
  const [view, setView] = useState('market')
  const [sort, setSort] = useState('gap')
  const [q, setQ] = useState('')

  useEffect(() => {
    const i = setInterval(() => setTick(currentTick()), 2000)
    return () => clearInterval(i)
  }, [])

  const stocks = useMemo(() => {
    if (!chars) return []
    const taken = new Set()
    return chars.map(c => { const s = stock(c); s.sym ||= symbolFor(c.name.full, taken); return s })
  }, [chars, tick])

  if (!chars) return <div className="loading">Opening the market…</div>
  const byId = Object.fromEntries(stocks.map(s => [s.c.id, s]))
  const sel = byId[selId] || stocks[0]
  const holdingsValue = Object.entries(wallet.holdings).reduce((a, [id, h]) => a + (byId[id]?.price || 0) * h.qty, 0)
  const worth = wallet.cash + holdingsValue
  const pnl = worth - START_CASH
  const feed = news(stocks)
  const secsLeft = Math.ceil((tickTime(tick + 1) - Date.now()) / 1000)

  function trade(s, qty) {
    if (!qty) return
    const cost = s.price * qty
    const h = wallet.holdings[s.c.id] || { qty: 0, avg: 0 }
    if (qty > 0 && cost > wallet.cash) return
    if (qty < 0 && -qty > h.qty) return
    const nq = h.qty + qty
    const holdings = { ...wallet.holdings }
    if (nq === 0) delete holdings[s.c.id]
    else holdings[s.c.id] = { qty: nq, avg: qty > 0 ? (h.avg * h.qty + cost) / nq : h.avg }
    setWallet({ cash: wallet.cash - cost, holdings, trades: [{ id: s.c.id, sym: s.sym, qty, price: s.price, at: Date.now() }, ...wallet.trades].slice(0, 100) })
  }

  const sorters = {
    gap: (a, b) => powerGap(b) - powerGap(a),
    gain: (a, b) => change(b, 1440) - change(a, 1440),
    loss: (a, b) => change(a, 1440) - change(b, 1440),
    price: (a, b) => b.price - a.price,
  }
  const list = stocks.filter(s => (s.sym + s.c.name.full).toLowerCase().includes(q.toLowerCase())).sort(sorters[sort])

  return (
    <div className="market">
      <div className="tape"><div className="tapein">
        {[...feed, ...feed].map((n, i) => <span key={i} className={n.up ? 'up' : 'down'}>{n.up ? '▲' : '▼'} {n.text}</span>)}
      </div></div>

      <div className="mhud">
        <div className="hudbox"><span>Net worth</span><b>{coins(worth)}</b></div>
        <div className="hudbox"><span>P/L</span><b className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}{coins(pnl)}</b></div>
        <div className="hudbox"><span>Cash</span><b>{coins(wallet.cash)}</b></div>
        <div className="hudbox"><span>Next tick</span><b>{secsLeft}s</b></div>
        <div className="tabs">
          <button className={view === 'market' ? 'on' : ''} onClick={() => setView('market')}>Market</button>
          <button className={view === 'portfolio' ? 'on' : ''} onClick={() => setView('portfolio')}>Portfolio</button>
          <button className={view === 'news' ? 'on' : ''} onClick={() => setView('news')}>News</button>
          {sb && <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Leaderboard</button>}
        </div>
      </div>

      {view === 'market' && <div className="mgrid">
        <section>
          <div className="row gap mfilter">
            <input className="search" placeholder="Search ticker or name…" value={q} onChange={e => setQ(e.target.value)} />
            <select className="search msort" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="gap">Biggest power gap</option><option value="gain">Top gainers 24h</option>
              <option value="loss">Top losers 24h</option><option value="price">Highest price</option>
            </select>
          </div>
          <div className="stocks">
            {list.map(s => {
              const ch = change(s, 1440), gap = powerGap(s)
              return (
                <div key={s.c.id} className={`srow ${sel === s ? 'sel' : ''}`} onClick={() => setSelId(s.c.id)}>
                  <img src={s.c.image.medium} alt="" />
                  <div className="sname"><b>${s.sym}</b><span>{s.c.name.full}</span></div>
                  <Spark s={s} up={ch >= 0} />
                  <div className="sprice"><b>{coins(s.price)}</b><span className={ch >= 0 ? 'up' : 'down'}>{pct(ch)}</span></div>
                  <div className={`sgap ${gap > 0.03 ? 'hot' : gap < -0.03 ? 'cold' : ''}`} title="Power vs price: positive means price hasn't caught up yet">
                    ⚡{Math.round(s.power).toLocaleString()}<span>{gap > 0 ? '+' : ''}{(gap * 100).toFixed(0)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
        <aside><StockPanel s={sel} wallet={wallet} trade={trade} /></aside>
      </div>}

      {view === 'portfolio' && <Portfolio wallet={wallet} byId={byId} onPick={id => { setSelId(id); setView('market') }} reset={() => {
        if (confirm('Reset your wallet to 10,000 coins?')) setWallet({ cash: START_CASH, holdings: {}, trades: [] })
      }} />}

      {view === 'board' && <Leaderboard byId={byId} friends={friends} me={me} />}

      {view === 'news' && <div className="newsfeed">
        {feed.map(n => (
          <div key={n.id} className={`nitem ${n.up ? 'up' : 'down'}`} onClick={() => { setSelId(n.s.c.id); setView('market') }}>
            <img src={n.s.c.image.medium} alt="" />
            <div className="grow"><div className="nhead">{n.text}</div><div className="muted small">{ago(n.t)} · ${n.s.sym} now {coins(n.s.price)}</div></div>
          </div>
        ))}
      </div>}
    </div>
  )
}

const ago = t => {
  const m = currentTick() - t
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}

function Spark({ s, up }) {
  const pts = series(s, 1440, 40)
  const min = Math.min(...pts.map(p => p.price)), max = Math.max(...pts.map(p => p.price))
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${30 - ((p.price - min) / (max - min || 1)) * 28}`).join(' ')
  return <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points={d} fill="none" stroke={up ? '#8cff5a' : '#ff2e63'} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
}

function Chart({ s, range }) {
  const pts = series(s, range, 200)
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

function StockPanel({ s, wallet, trade }) {
  const [range, setRange] = useState(1440)
  const [qty, setQty] = useState(1)
  if (!s) return null
  const h = wallet.holdings[s.c.id]
  const ch = change(s, range === Infinity ? s.prices.length : range)
  const maxBuy = Math.floor(wallet.cash / s.price)
  const gap = powerGap(s)
  return (
    <div className="spanel">
      <div className="shead" style={{ '--c': s.c.media.nodes[0]?.coverImage.color || '#ffd60a' }}>
        <img src={s.c.image.large} alt="" />
        <div className="grow">
          <div className="ssym">${s.sym}</div>
          <div className="sfull">{s.c.name.full}</div>
          <div className="muted small">{s.c.media.nodes[0] ? title(s.c.media.nodes[0]) : ''}</div>
          <div className="sbig">{coins(s.price)} <span className={ch >= 0 ? 'up' : 'down'}>{pct(ch)}</span></div>
        </div>
      </div>
      <div className="tabs rtabs">{RANGES.map(([l, v]) => <button key={l} className={range === v ? 'on' : ''} onClick={() => setRange(v)}>{l}</button>)}</div>
      <Chart s={s} range={range} />
      <div className="legend2"><span><i className="lp" />Price</span><span><i className="lt" />Power target (price follows this)</span></div>
      <div className="pstats">
        <div><span>Power level</span><b>⚡{Math.round(s.power).toLocaleString()}</b></div>
        <div><span>Power gap</span><b className={gap >= 0 ? 'up' : 'down'}>{gap >= 0 ? '+' : ''}{(gap * 100).toFixed(1)}%</b></div>
        <div><span>Fans</span><b>{s.c.favourites.toLocaleString()}</b></div>
      </div>
      <div className="tradebox">
        <div className="row gap">
          <button className="pill ghost" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
          <input className="search qty" type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, Math.floor(+e.target.value) || 1))} />
          <button className="pill ghost" onClick={() => setQty(qty + 1)}>+</button>
          <button className="pill ghost" onClick={() => setQty(Math.max(1, maxBuy))}>Max</button>
        </div>
        <div className="muted small">Total: {coins(s.price * qty)} coins</div>
        <div className="row gap">
          <button className="pill buy" disabled={qty > maxBuy} onClick={() => trade(s, qty)}>Buy</button>
          <button className="pill sell" disabled={!h || qty > h.qty} onClick={() => trade(s, -qty)}>Sell</button>
        </div>
        {h && <div className="hold">You own <b>{h.qty}</b> @ {coins(h.avg)} · P/L <b className={s.price >= h.avg ? 'up' : 'down'}>{coins((s.price - h.avg) * h.qty)}</b></div>}
      </div>
    </div>
  )
}

function Portfolio({ wallet, byId, onPick, reset }) {
  const rows = Object.entries(wallet.holdings).map(([id, h]) => ({ s: byId[id], ...h })).filter(r => r.s)
  return (
    <div className="mgrid">
      <section>
        <h3>Holdings</h3>
        <div className="stocks">
          {rows.map(({ s, qty, avg }) => {
            const pl = (s.price - avg) * qty
            return <div key={s.c.id} className="srow" onClick={() => onPick(s.c.id)}>
              <img src={s.c.image.medium} alt="" />
              <div className="sname"><b>${s.sym}</b><span>{qty} shares @ {coins(avg)}</span></div>
              <div className="sprice"><b>{coins(s.price * qty)}</b><span className={pl >= 0 ? 'up' : 'down'}>{pl >= 0 ? '+' : ''}{coins(pl)} ({pct(s.price / avg - 1)})</span></div>
            </div>
          })}
          {!rows.length && <div className="card pad muted">No positions yet. Hunt for big power gaps on the Market tab.</div>}
        </div>
      </section>
      <aside>
        <h3>Trade log</h3>
        <div className="card pad">
          {wallet.trades.slice(0, 20).map((t, i) => <div key={i} className="mini">
            <b className={t.qty > 0 ? 'up' : 'down'}>{t.qty > 0 ? 'BUY' : 'SELL'}</b><span className="grow">${t.sym} × {Math.abs(t.qty)}</span><span className="muted">{coins(t.price)}</span></div>)}
          {!wallet.trades.length && <span className="muted">No trades yet.</span>}
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
  // Everyone sees identical prices (seeded sim), so net worth is computed here, not trusted from the client.
  const board = rows.map(r => {
    const held = Object.entries(r.holdings || {})
    const value = held.reduce((a, [id, h]) => a + (byId[id]?.price || 0) * h.qty, 0)
    const best = held.map(([id, h]) => ({ s: byId[id], v: (byId[id]?.price || 0) * h.qty })).filter(x => x.s).sort((a, b) => b.v - a.v)[0]
    return { id: r.user_id, name: names[r.user_id] || '???', worth: Number(r.cash) + value, best }
  }).sort((a, b) => b.worth - a.worth)
  return (
    <div className="board">
      {board.map((r, i) => (
        <div key={r.id} className={`brow ${i < 3 ? `p${i + 1}` : ''} ${r.id === me?.id ? 'me' : ''}`}>
          <div className="bpos">#{i + 1}</div>
          <div className="grow"><b>{r.name}</b>{r.best && <span className="muted small">Biggest bag: ${r.best.s.sym}</span>}</div>
          <div className="bworth"><b>{coins(r.worth)}</b><span className={r.worth >= START_CASH ? 'up' : 'down'}>{pct(r.worth / START_CASH - 1)}</span></div>
        </div>
      ))}
    </div>
  )
}
