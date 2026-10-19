// Local anime stock market engine.
// Every character runs a seeded simulation from EPOCH, one step per minute, so prices
// are identical on every refresh and history can be rebuilt for charts.
// Power moves first (random drift + canon "events"); price chases power with a lag.
// That lag is the "power gap" smart traders exploit.

export const EPOCH = Date.UTC(2026, 9, 1)
export const TICK = 60_000
export const START_CASH = 10_000
export const currentTick = () => Math.floor((Date.now() - EPOCH) / TICK)
export const tickTime = t => EPOCH + t * TICK

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function symbolFor(name, taken) {
  const parts = name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
  const cands = [parts[parts.length - 1], parts[0], parts.join('')].filter(Boolean).map(p => p.slice(0, 5).toUpperCase())
  for (const c of cands) if (c.length >= 2 && !taken.has(c)) { taken.add(c); return c }
  let i = 2; while (taken.has(cands[0] + i)) i++
  taken.add(cands[0] + i); return cands[0] + i
}

const sims = new Map()

export function stock(c) {
  let s = sims.get(c.id)
  if (!s) {
    const r = rng(c.id * 9973 + 17)
    const p0 = Math.round(2000 + Math.sqrt(c.favourites) * 30)
    const base = +(15 + Math.sqrt(c.favourites) / 2.2).toFixed(2)
    s = { c, r, p0, base, t: -1, power: p0, price: base, prices: [], powers: [], events: [] }
    sims.set(c.id, s)
  }
  advance(s, currentTick())
  return s
}

function advance(s, upto) {
  const { r, p0, base } = s
  let { power, price } = s
  for (let t = s.t + 1; t <= upto; t++) {
    if (r() < 0.0004) {
      const jump = (r() < 0.55 ? 1 : -1) * (0.05 + r() * 0.15)
      power *= 1 + jump
      s.events.push({ t, jump, kind: Math.floor(r() * 1000) })
    }
    power *= 1 + (r() - 0.5) * 0.0016 + ((p0 - power) / p0) * 0.0004
    const target = (base * power) / p0
    let next = price + (target - price) * 0.006 + price * (r() - 0.5) * 0.0025
    next = Math.min(price * 1.15, Math.max(price * 0.85, next), Infinity)
    price = Math.max(1, next)
    s.prices.push(price); s.powers.push(power)
  }
  s.t = upto; s.power = power; s.price = price
}

export function priceAgo(s, ticks) {
  const i = Math.max(0, s.prices.length - 1 - ticks)
  return s.prices[i]
}
export const change = (s, ticks) => s.price / priceAgo(s, ticks) - 1
export const powerGap = s => (s.base * s.power) / s.p0 / s.price - 1

export function series(s, ticks, points = 160) {
  const start = Math.max(0, s.prices.length - ticks)
  const step = Math.max(1, Math.floor((s.prices.length - start) / points))
  const out = []
  for (let i = start; i < s.prices.length; i += step) out.push({ t: i, price: s.prices[i], target: (s.base * s.powers[i]) / s.p0 })
  const last = s.prices.length - 1
  if (out[out.length - 1]?.t !== last) out.push({ t: last, price: s.prices[last], target: (s.base * s.powers[last]) / s.p0 })
  return out
}

const UP = [
  '{N} POWER SPIKES {X}%: rumours of a new form send traders into a frenzy',
  'BREAKING: {N} lands a canon W. Power up {X}%, price still lagging',
  'Analysts stunned as {N} powers up {X}%. Is ${S} undervalued?',
  '{N} trending after leaked chapter. Power +{X}%, whales circling',
  'FIGHT OF THE YEAR: {N} goes off, power climbs {X}%',
]
const DOWN = [
  '{N} TAKES AN L. Power down {X}% after brutal jobbing',
  'Fans turn on {N} after filler arc. Power slides {X}%',
  'SELL-OFF FEARS: {N} gets off-screened, power -{X}%',
  '{N} nerfed by the author? Power drops {X}%, ${S} holders sweating',
  'Plot armour cracks: {N} power falls {X}%',
]

export function news(stocks, limit = 14) {
  const now = currentTick()
  const items = []
  for (const s of stocks) for (const e of s.events) {
    if (now - e.t > 60 * 24 * 3) continue
    const pool = e.jump > 0 ? UP : DOWN
    const text = pool[e.kind % pool.length].replace('{N}', s.c.name.full.toUpperCase()).replace('{X}', Math.round(Math.abs(e.jump) * 100)).replace('{S}', s.sym)
    items.push({ t: e.t, up: e.jump > 0, text, id: `${s.c.id}-${e.t}`, s })
  }
  const movers = [...stocks].sort((a, b) => Math.abs(change(b, 1440)) - Math.abs(change(a, 1440))).slice(0, 2)
  movers.forEach(s => {
    const ch = change(s, 1440)
    items.push({ t: now, up: ch > 0, id: `mv-${s.c.id}`, s,
      text: `$${s.sym} ${ch > 0 ? 'ROCKETS' : 'CRATERS'} ${Math.abs(ch * 100).toFixed(1)}% in 24h. ${ch > 0 ? 'Diamond hands rewarded' : 'Paper hands panic'}` })
  })
  return items.sort((a, b) => b.t - a.t).slice(0, limit)
}

export const coins = n => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pct = n => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`
