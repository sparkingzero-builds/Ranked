// collect-hype: hourly job that reads real-world buzz for every market character
// and turns it into a hype score (-0.5 .. 1.0) the price engine follows.
//
// Signals (each compared against that character's own recent baseline, so spikes count, not fame):
//   wiki     Wikipedia daily page views (stand-in for Google Trends)
//   reddit   Reddit posts mentioning the character in the last 24h (stand-in for X/Twitter)
//   anilist  New AniList favourites since last reading
//   trending AniList trending score of their show
//   airing   Their show aired a new episode in the last 48h
//   mal      New MyAnimeList favourites (via Jikan)
//   youtube  YouTube videos about them in the last 24h (needs YOUTUBE_API_KEY secret)
//
// Body {"mode":"seed"} loads the top 50 AniList characters into the market (first run only).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

// New-style projects expose secret keys as SUPABASE_SECRET_KEYS (JSON); older ones as SUPABASE_SERVICE_ROLE_KEY
function serviceKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); return k.default || Object.values(k)[0] as string } catch { return '' }
}
const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey())
const YT_KEY = Deno.env.get('YOUTUBE_API_KEY')
const UA = { 'User-Agent': 'RankedHypeBot/1.0 (anime ranking app for friends)' }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const WEIGHTS: Record<string, number> = { wiki: 0.3, reddit: 0.2, anilist: 0.15, trending: 0.1, airing: 0.1, youtube: 0.1, mal: 0.05 }

async function json(url: string, init: RequestInit = {}) {
  try {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) } })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

const anilist = (query: string, variables = {}) =>
  json('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })

// ratio -> score: 2x baseline = +0.5, 4x = +1, half = -0.5
const score = (ratio: number) => Math.max(-0.5, Math.min(1, Math.log2(Math.max(ratio, 0.01)) / 2))
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

async function seed() {
  const { count } = await db.from('characters').select('id', { count: 'exact', head: true })
  if (count) return { seeded: 0, note: 'already seeded' }
  const d = await anilist(`{ Page(perPage:50){ characters(sort:FAVOURITES_DESC){ id name { full } image { large } favourites
    media(perPage:1, sort:POPULARITY_DESC){ nodes { title { romaji english } coverImage { color } } } } } }`)
  const taken = new Set<string>()
  const rows = d.data.Page.characters.map((c: any) => {
    const parts = c.name.full.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
    const cands = [parts[parts.length - 1], parts[0], parts.join('')].filter(Boolean).map((p: string) => p.slice(0, 5).toUpperCase())
    let sym = cands.find((x: string) => x.length >= 2 && !taken.has(x)) || cands[0] + c.id % 100
    taken.add(sym)
    const p0 = Math.round(2000 + Math.sqrt(c.favourites) * 30)
    const base = +(15 + Math.sqrt(c.favourites) / 2.2).toFixed(2)
    const m = c.media.nodes[0]
    return { id: c.id, name: c.name.full, sym, image: c.image.large, favourites: c.favourites,
      media_title: m ? (m.title.english || m.title.romaji) : null, color: m?.coverImage.color || null,
      p0, base, power: p0, price: base, price_24h: base }
  })
  await db.from('characters').insert(rows)
  return { seeded: rows.length }
}

async function wikiTitle(c: any) {
  const q = encodeURIComponent(`${c.name} ${c.media_title || ''} character`)
  const r = await json(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=1&format=json`)
  return r?.query?.search?.[0]?.title || null
}

async function wiki(c: any) {
  if (!c.wiki_title) return null
  const end = new Date(Date.now() - 86400000), start = new Date(Date.now() - 30 * 86400000)
  const t = encodeURIComponent(c.wiki_title.replace(/ /g, '_'))
  const r = await json(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/daily/${ymd(start)}/${ymd(end)}`)
  const views = (r?.items || []).map((i: any) => i.views)
  if (views.length < 7) return null
  const latest = views[views.length - 1], base = median(views.slice(0, -2)) || 1
  return { raw: latest, ratio: latest / base }
}

async function reddit(c: any) {
  const q = encodeURIComponent(`"${c.name}"`)
  const r = await json(`https://www.reddit.com/search.json?q=${q}&sort=new&t=day&limit=100&raw_json=1`)
  if (!r?.data) return null
  return { raw: r.data.children.length }
}

async function malFavs(c: any) {
  let id = c.mal_id
  if (!id) {
    const r = await json(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(c.name)}&limit=1&order_by=favorites&sort=desc`)
    id = r?.data?.[0]?.mal_id
    if (id) await db.from('characters').update({ mal_id: id }).eq('id', c.id)
    await sleep(700)
  }
  if (!id) return null
  const r = await json(`https://api.jikan.moe/v4/characters/${id}`)
  await sleep(700)
  return r?.data?.favorites != null ? { raw: r.data.favorites } : null
}

async function youtube(c: any) {
  if (!YT_KEY) return null
  const after = new Date(Date.now() - 86400000).toISOString()
  const q = encodeURIComponent(`${c.name} ${c.media_title || 'anime'}`)
  const r = await json(`https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=50&publishedAfter=${after}&q=${q}&key=${YT_KEY}`)
  return r?.pageInfo ? { raw: r.pageInfo.totalResults } : null
}

const NEWS: Record<string, [string, string]> = {
  wiki: ['{N} WIKIPEDIA VIEWS {X}: the whole internet is looking them up', 'Nobody is searching {N} anymore: views {X}'],
  reddit: ['REDDIT CAN\'T STOP TALKING ABOUT {N}: mentions {X}', 'Reddit goes quiet on {N}: mentions {X}'],
  anilist: ['FAN SURGE: {N} picking up AniList favourites {X}', 'Fans cooling on {N}: favourites growth {X}'],
  trending: ['{M} is TRENDING and {N} is riding the wave', '{M} drops off the trending charts, {N} hype fading'],
  airing: ['NEW EPISODE: {M} just aired, {N} hype meter spiking', '{M} on break: {N} hype cools'],
  youtube: ['{N} EDITS FLOODING YOUTUBE: uploads {X}', 'YouTube dries up for {N}: uploads {X}'],
  mal: ['MAL fans rally behind {N}: favourites {X}', 'MAL interest in {N} stalls {X}'],
}

async function collect() {
  const { data: chars } = await db.from('characters').select('*')
  if (!chars?.length) return { error: 'no characters, run seed first' }
  const hour = new Date().getUTCHours()

  // AniList: favourites + show trending/airing, one batched call
  const ids = chars.map(c => c.id)
  const al = await anilist(`query($ids:[Int]){ Page(perPage:50){ characters(id_in:$ids){ id favourites
    media(perPage:1, sort:POPULARITY_DESC){ nodes { trending nextAiringEpisode { timeUntilAiring } } } } } }`, { ids })
  const alBy = Object.fromEntries((al?.data?.Page?.characters || []).map((c: any) => [c.id, c]))

  // baselines: last 7 days of raw readings per character
  const { data: hist } = await db.from('hype_history').select('char_id, raw').gte('t', new Date(Date.now() - 7 * 86400000).toISOString()).order('t')
  const histBy: Record<number, any[]> = {}
  for (const h of hist || []) (histBy[h.char_id] ||= []).push(h.raw)
  const avgOf = (id: number, k: string) => { const v = (histBy[id] || []).map(r => r[k]).filter((x: any) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const lastOf = (id: number, k: string) => { const v = (histBy[id] || []).map(r => r[k]).filter((x: any) => typeof x === 'number'); return v.length ? v[v.length - 1] : null }

  const results: any[] = []
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (!c.wiki_title) { c.wiki_title = await wikiTitle(c); if (c.wiki_title) await db.from('characters').update({ wiki_title: c.wiki_title }).eq('id', c.id) }
    const raw: Record<string, number> = {}, parts: Record<string, { score: number, label: string }> = {}

    const w = await wiki(c)
    if (w) { raw.wiki = w.raw; parts.wiki = { score: score(w.ratio), label: `${Math.round((w.ratio - 1) * 100)}% vs normal` } }

    // rate-limited sources rotate: each character gets a turn every few hours
    if (i % 5 === hour % 5) {
      const r = await reddit(c); await sleep(1500)
      if (r) { raw.reddit = r.raw; const b = avgOf(c.id, 'reddit'); if (b != null) parts.reddit = { score: score((r.raw + 1) / (b + 1)), label: `${r.raw} posts today` } }
    }
    if (i % 4 === hour % 4) {
      const m = await malFavs(c)
      if (m) { raw.mal = m.raw; const last = lastOf(c.id, 'mal'), dAvg = avgOf(c.id, 'mal_delta')
        if (last != null) { raw.mal_delta = m.raw - last; if (dAvg != null) parts.mal = { score: score((raw.mal_delta + 1) / (dAvg + 1)), label: `+${raw.mal_delta} favourites` } } }
    }
    if (YT_KEY && i % 12 === hour % 12) {
      const y = await youtube(c)
      if (y) { raw.youtube = y.raw; const b = avgOf(c.id, 'youtube'); if (b != null) parts.youtube = { score: score((y.raw + 1) / (b + 1)), label: `${y.raw} videos today` } }
    }

    const a = alBy[c.id]
    if (a) {
      raw.anilist = a.favourites
      const last = lastOf(c.id, 'anilist'), dAvg = avgOf(c.id, 'anilist_delta')
      if (last != null) { raw.anilist_delta = a.favourites - last; if (dAvg != null) parts.anilist = { score: score((raw.anilist_delta + 1) / (dAvg + 1)), label: `+${raw.anilist_delta} favourites/hr` } }
      const m = a.media.nodes[0]
      if (m) {
        raw.trending = m.trending
        const b = avgOf(c.id, 'trending'); if (b != null) parts.trending = { score: score((m.trending + 1) / (b + 1)), label: `trending score ${m.trending}` }
        const aired = m.nextAiringEpisode && 7 * 86400 - m.nextAiringEpisode.timeUntilAiring < 2 * 86400
        parts.airing = { score: aired ? 0.6 : 0, label: aired ? 'new episode this week' : m.nextAiringEpisode ? 'airing' : 'not airing' }
      }
    }

    // keep previous readings for sources not polled this hour so the "why" panel stays full
    const prevParts = c.hype_parts || {}
    for (const k of Object.keys(WEIGHTS)) if (!parts[k] && prevParts[k]) parts[k] = prevParts[k]

    let sum = 0, wsum = 0
    for (const [k, v] of Object.entries(parts)) { sum += v.score * WEIGHTS[k]; wsum += WEIGHTS[k] }
    const hype = wsum ? +(sum / wsum).toFixed(3) : 0

    const delta = hype - Number(c.hype)
    if (Math.abs(delta) >= 0.15) {
      const top = Object.entries(parts).sort((x, y) => Math.abs(y[1].score) * WEIGHTS[y[0]] - Math.abs(x[1].score) * WEIGHTS[x[0]])[0]
      if (top) {
        const t = NEWS[top[0]][delta > 0 ? 0 : 1].replace('{N}', c.name.toUpperCase()).replace('{M}', c.media_title || 'their show').replace('{X}', top[1].label)
        await db.from('news').insert({ char_id: c.id, up: delta > 0, source: top[0], text: t })
      }
    }
    await db.from('characters').update({ hype, hype_parts: parts, hype_at: new Date().toISOString(), favourites: a?.favourites ?? c.favourites }).eq('id', c.id)
    await db.from('hype_history').insert({ char_id: c.id, raw })
    results.push({ sym: c.sym, hype, sources: Object.keys(raw) })
  }
  return { updated: results.length, youtube: !!YT_KEY, results }
}

Deno.serve(async req => {
  const { data: cfg } = await db.from('app_config').select('value').eq('key', 'cron_secret').single()
  if (!cfg || req.headers.get('x-cron-secret') !== cfg.value) return new Response('forbidden', { status: 403 })
  const body = await req.json().catch(() => ({}))
  const out = body.mode === 'seed' ? await seed() : await collect()
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})
