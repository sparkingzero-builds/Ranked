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
const WEIGHTS: Record<string, number> = { wiki: 0.3, reddit: 0.2, manga: 0.15, anilist: 0.15, trending: 0.1, airing: 0.1, youtube: 0.1, mal: 0.05 }

async function json(url: string, init: RequestInit = {}) {
  try {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(8000) })
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

// Lists the top `count` AniList characters by favourites; already-listed ones are skipped,
// so calling it again with a bigger count just adds the next tier of characters.
async function seed(count = 50) {
  const { data: existing } = await db.from('characters').select('id, sym')
  const have = new Set((existing || []).map(c => c.id))
  const taken = new Set<string>((existing || []).map(c => c.sym))
  const rows: any[] = []
  for (let page = 1; page <= Math.ceil(Math.min(count, 1500) / 50); page++) {
    const d = await anilist(`query($p:Int){ Page(page:$p, perPage:50){ characters(sort:FAVOURITES_DESC){ id name { full } image { large } favourites
      media(perPage:1, sort:POPULARITY_DESC){ nodes { title { romaji english } coverImage { color } } } } } }`, { p: page })
    for (const c of d?.data?.Page?.characters || []) {
      if (have.has(c.id)) continue
      const parts = c.name.full.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
      const cands = [parts[0], parts.join(''), parts[parts.length - 1]].filter(Boolean).map((p: string) => p.slice(0, 6).toUpperCase())
      let sym = cands.find((x: string) => x.length >= 2 && !taken.has(x))
      if (!sym) { let n = 2; while (taken.has((cands[0] || 'CHR') + n)) n++; sym = (cands[0] || 'CHR') + n }
      taken.add(sym)
      const p0 = Math.round(2000 + Math.sqrt(c.favourites) * 30)
      const base = +(15 + Math.sqrt(c.favourites) / 2.2).toFixed(2)
      const m = c.media.nodes[0]
      rows.push({ id: c.id, name: c.name.full, sym, image: c.image.large, favourites: c.favourites,
        media_title: m ? (m.title.english || m.title.romaji) : null, color: m?.coverImage.color || null,
        p0, base, power: p0, price: base, price_24h: base })
    }
    await sleep(800)
  }
  if (rows.length) await db.from('characters').insert(rows)
  return { added: rows.length, total: have.size + rows.length }
}

// Character IPOs: main characters from the hottest airing shows join the market at a discount
async function ipo(count = 5) {
  const { data: existing } = await db.from('characters').select('id, sym')
  const have = new Set((existing || []).map(c => c.id)), taken = new Set<string>((existing || []).map(c => c.sym))
  const d = await anilist(`{ Page(perPage:20){ media(type:ANIME, status:RELEASING, sort:TRENDING_DESC){ title { romaji english } coverImage { color }
    characters(role:MAIN, perPage:4, sort:FAVOURITES_DESC){ nodes { id name { full } image { large } favourites } } } } }`)
  const cands: any[] = []
  for (const m of d?.data?.Page?.media || []) for (const c of m.characters.nodes)
    if (!have.has(c.id) && c.favourites >= 300 && !cands.some(x => x.c.id === c.id)) cands.push({ c, m })
  const pick = cands.sort((a, b) => b.c.favourites - a.c.favourites).slice(0, count)
  const rows = pick.map(({ c, m }) => {
    const parts = c.name.full.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
    const cands2 = [parts[0], parts.join(''), parts[parts.length - 1]].filter(Boolean).map((p: string) => p.slice(0, 6).toUpperCase())
    let sym = cands2.find((x: string) => x.length >= 2 && !taken.has(x))
    if (!sym) { let n = 2; while (taken.has((cands2[0] || 'IPO') + n)) n++; sym = (cands2[0] || 'IPO') + n }
    taken.add(sym)
    const p0 = Math.round(2000 + Math.sqrt(c.favourites) * 30), base = +(15 + Math.sqrt(c.favourites) / 2.2).toFixed(2)
    const title = m.title.english || m.title.romaji
    return { id: c.id, name: c.name.full, sym, image: c.image.large, favourites: c.favourites, media_title: title, color: m.coverImage.color,
      p0, base, power: p0, price: +(base * 0.8).toFixed(2), price_24h: +(base * 0.8).toFixed(2), ipo_at: new Date().toISOString() }
  })
  if (rows.length) {
    await db.from('characters').insert(rows)
    await db.from('news').insert(rows.map(r => ({ char_id: r.id, up: true, source: 'trending',
      text: `IPO: $${r.sym} (${r.name.toUpperCase()}) LISTS TODAY from ${r.media_title}. Launch price ${r.price}` })))
  }
  return { listed: rows.map(r => r.sym) }
}

// Episode release notifications: every 15 min, find episodes that aired since the last check for
// shows each player is watching (their AniList list + statuses set in Ranked) and drop a 🔔 notification.
async function episodes() {
  const { data: cfg } = await db.from('app_config').select('value').eq('key', 'episodes_checked_at').maybeSingle()
  const now = Math.floor(Date.now() / 1000)
  const since = cfg ? +cfg.value : now - 15 * 60
  await db.from('app_config').upsert({ key: 'episodes_checked_at', value: String(now) })

  const [{ data: profiles }, { data: states }] = await Promise.all([
    db.from('profiles').select('id, anilist_name'), db.from('user_state').select('user_id, extra')])
  const watching: Record<string, Set<number>> = {}
  for (const p of profiles || []) {
    const set = (watching[p.id] = new Set())
    if (p.anilist_name) {
      const d = await anilist(`query($u:String){ MediaListCollection(userName:$u, type:ANIME, status:CURRENT){ lists { entries { mediaId } } } }`, { u: p.anilist_name })
      for (const l of d?.data?.MediaListCollection?.lists || []) for (const e of l.entries) set.add(e.mediaId)
    }
    const own = (states || []).find(s => s.user_id === p.id)?.extra?.entries || {}
    for (const [id, e] of Object.entries<any>(own)) { if (e.status === 'CURRENT') set.add(+id); else set.delete(+id) }
  }
  const ids = [...new Set(Object.values(watching).flatMap(s => [...s]))]
  if (!ids.length) return { aired: 0 }
  const aired: any[] = []
  for (let k = 0; k < ids.length; k += 50) {
    const d = await anilist(`query($ids:[Int],$a:Int,$b:Int){ Page(perPage:50){ airingSchedules(mediaId_in:$ids, airingAt_greater:$a, airingAt_lesser:$b){ episode mediaId media { title { romaji english } } } } }`,
      { ids: ids.slice(k, k + 50), a: since, b: now + 1 })
    aired.push(...(d?.data?.Page?.airingSchedules || []))
  }
  const rows = []
  for (const [uid, set] of Object.entries(watching)) for (const a of aired) if (set.has(a.mediaId))
    rows.push({ user_id: uid, text: `📺 New episode: ${a.media.title.english || a.media.title.romaji} ep ${a.episode} is out` })
  if (rows.length) await db.from('notifications').insert(rows)
  return { aired: aired.length, notified: rows.length }
}

// Add whole casts of named series (every season/movie entry), skipping anyone already listed.
// min = minimum AniList favourites so background extras don't flood the market.
async function franchise(titles: string[] = [], min = 150) {
  const { data: existing } = await db.from('characters').select('id, sym')
  const have = new Set((existing || []).map(c => c.id)), taken = new Set<string>((existing || []).map(c => c.sym))
  const added: Record<string, number> = {}
  const rows: any[] = []
  for (const t of titles) {
    const d = await anilist(`query($q:String){ Page(perPage:6){ media(search:$q, type:ANIME, sort:POPULARITY_DESC){ title { romaji english } coverImage { color }
      characters(perPage:25, sort:FAVOURITES_DESC){ nodes { id name { full } image { large } favourites } } } } }`, { q: t })
    let n = 0
    for (const m of d?.data?.Page?.media || []) for (const c of m.characters.nodes) {
      if (have.has(c.id) || c.favourites < min) continue
      have.add(c.id)
      const clean = (x: string) => x.replace(/[^A-Za-z]/g, '').toUpperCase()
      const parts = c.name.full.split(' ').filter(Boolean)
      let sym = clean(parts[0]).slice(0, 6) || 'CHR'
      if (taken.has(sym)) sym = (clean(parts[0]).slice(0, 3) + clean(parts[parts.length - 1]).slice(0, 3)) || sym
      for (let k = 2; taken.has(sym); k++) sym = sym.slice(0, 5) + k
      taken.add(sym)
      const p0 = Math.round(2000 + Math.sqrt(c.favourites) * 30), base = +(15 + Math.sqrt(c.favourites) / 2.2).toFixed(2)
      rows.push({ id: c.id, name: c.name.full, sym, image: c.image.large, favourites: c.favourites,
        media_title: m.title.english || m.title.romaji, color: m.coverImage.color, p0, base, power: p0, price: base, price_24h: base })
      n++
    }
    added[t] = n
    await sleep(900)
  }
  for (let k = 0; k < rows.length; k += 200) await db.from('characters').insert(rows.slice(k, k + 200))
  return { added: rows.length, byTitle: added }
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

// Reddit (403 from Supabase servers) and Jikan/MAL (always times out) don't answer from the cloud, so they're switched off.
const REDDIT_ON = false, MAL_ON = false

// Manga buzz from sources that do answer: MangaDex (official chapter releases + dates),
// Wikipedia page views of the manga (people looking it up) and AniList's manga trending score.
async function mangaDexLatest(title: string, mdId?: string) {
  let id = mdId
  if (!id) {
    const m = await json(`https://api.mangadex.org/manga?limit=1&order%5Brelevance%5D=desc&title=${encodeURIComponent(title)}`)
    id = m?.data?.[0]?.id
  }
  if (!id) return null
  const c = await json(`https://api.mangadex.org/chapter?manga=${id}&limit=1&order%5BpublishAt%5D=desc&translatedLanguage%5B%5D=en&includeExternalUrl=1`)
  const a = c?.data?.[0]?.attributes
  return { id, chapter: a?.chapter ? Math.floor(+a.chapter) : null, published: a?.publishAt || null }
}

async function mangaViews(title: string, wikiTitle?: string) {
  let t = wikiTitle
  if (!t) {
    const r = await json(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title + ' manga')}&srlimit=1&format=json`)
    t = r?.query?.search?.[0]?.title
  }
  if (!t) return null
  const end = new Date(Date.now() - 86400000), start = new Date(Date.now() - 30 * 86400000)
  const r = await json(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(t.replace(/ /g, '_'))}/daily/${ymd(start)}/${ymd(end)}`)
  const v = (r?.items || []).map((i: any) => i.views)
  if (v.length < 7) return { wiki: t, ratio: null }
  return { wiki: t, ratio: v[v.length - 1] / (median(v.slice(0, -2)) || 1) }
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
  manga: ['MANGA HYPE: {N} chapter talk exploding ({X})', 'Manga chatter about {N} dies down ({X})'],
}

// Runs every 10 minutes; each run handles a sixth of the market so every character is scanned hourly.
const CHUNKS = 6
async function collect(chunkArg?: number) {
  const { data: all } = await db.from('characters').select('*').order('id')
  if (!all?.length) return { error: 'no characters, run seed first' }
  const now = new Date(), hour = now.getUTCHours()
  const chunk = chunkArg ?? Math.floor(now.getUTCMinutes() / 10) % CHUNKS
  const chars = all.map((c, i) => ({ ...c, i })).filter(c => c.i % CHUNKS === chunk)

  // AniList: favourites + show trending/airing, one batched call
  const ids = chars.map((c: any) => c.id)
  const alBy: Record<number, any> = {}
  for (let k = 0; k < ids.length; k += 50) {
    const al = await anilist(`query($ids:[Int]){ Page(perPage:50){ characters(id_in:$ids){ id favourites
      media(type:ANIME, perPage:10, sort:START_DATE_DESC){ nodes { id status trending nextAiringEpisode { episode timeUntilAiring } title { romaji english } } }
      manga: media(type:MANGA, perPage:1, sort:POPULARITY_DESC){ nodes { id status trending title { romaji english } } } } } }`, { ids: ids.slice(k, k + 50) })
    for (const c of al?.data?.Page?.characters || []) alBy[c.id] = c
  }

  // baselines: last 7 days of raw readings per character
  const { data: hist } = await db.from('hype_history').select('char_id, raw').gte('t', new Date(Date.now() - 7 * 86400000).toISOString()).order('t')
  const histBy: Record<number, any[]> = {}
  for (const h of hist || []) (histBy[h.char_id] ||= []).push(h.raw)
  const avgOf = (id: number, k: string) => { const v = (histBy[id] || []).map(r => r[k]).filter((x: any) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const lastOf = (id: number, k: string) => { const v = (histBy[id] || []).map(r => r[k]).filter((x: any) => typeof x === 'number'); return v.length ? v[v.length - 1] : null }

  // link characters to their manga (only writes when something changed)
  for (const c of chars) {
    const mg = alBy[c.id]?.manga?.nodes?.[0]
    if (!mg) continue
    const t = mg.title.english || mg.title.romaji
    if (c.manga_id !== mg.id || c.manga_status !== mg.status || c.manga_title !== t) {
      Object.assign(c, { manga_id: mg.id, manga_title: t, manga_status: mg.status })
      await db.from('characters').update({ manga_id: mg.id, manga_title: t, manga_status: mg.status }).eq('id', c.id)
    }
  }
  const { data: buzzRows } = await db.from('manga_buzz').select('*')
  const buzz: Record<number, any> = Object.fromEntries((buzzRows || []).map(b => [b.manga_id, b]))
  const releasing = new Map<number, string>()
  for (const c of all) if (c.manga_id && c.manga_status === 'RELEASING' && c.manga_id % CHUNKS === chunk) releasing.set(c.manga_id, c.manga_title)
  const mangaTrend: Record<number, number> = {}
  for (const c of chars) { const mg = alBy[c.id]?.manga?.nodes?.[0]; if (mg) mangaTrend[mg.id] = mg.trending || 0 }
  const doManga = async ([mid, mt]: [number, string]) => {
    const prev = buzz[mid]
    const [md, wv] = await Promise.all([mangaDexLatest(mt, prev?.md_id), mangaViews(mt, prev?.wiki_title)])
    const trend = mangaTrend[mid] ?? prev?.trending ?? null
    const row: any = { manga_id: mid, title: mt, updated_at: new Date().toISOString(),
      md_id: md?.id ?? prev?.md_id ?? null, wiki_title: wv?.wiki ?? prev?.wiki_title ?? null,
      views_ratio: wv?.ratio ?? prev?.views_ratio ?? null,
      trending: trend, base_trending: trend == null ? prev?.base_trending ?? null : prev?.base_trending != null ? +prev.base_trending * 0.9 + trend * 0.1 : trend,
      last_chapter: prev?.last_chapter ?? null, chapter_at: prev?.chapter_at ?? null, chapter_published: prev?.chapter_published ?? null }
    if (md?.chapter && md.published) {
      const isNew = !prev?.last_chapter || md.chapter > prev.last_chapter
      const recent = Date.now() - new Date(md.published).getTime() < 36 * 3600000
      if (isNew) { row.last_chapter = md.chapter; row.chapter_published = md.published }
      // Chapter day: a newer official chapter released in the last 36h
      if (isNew && recent) {
        row.chapter_at = new Date().toISOString()
        const key = `m${mid}-${md.chapter}`
        const { data: fans } = await db.from('characters').select('id, sym, event_key').eq('manga_id', mid)
        const fresh = (fans || []).filter(f => f.event_key !== key)
        if (fresh.length) {
          await db.from('characters').update({ event_key: key, event_label: `${mt} ch ${md.chapter}`, event_until: new Date(new Date(md.published).getTime() + 36 * 3600000).toISOString() }).in('id', fresh.map(f => f.id))
          await db.from('news').insert({ char_id: fresh[0].id, up: true, source: 'manga',
            text: `CHAPTER DAY: ${mt.toUpperCase()} CH ${md.chapter} IS OUT. ${fresh.slice(0, 4).map(f => f.sym).join(', ')} get a hype boost` })
        }
      }
    }
    await db.from('manga_buzz').upsert(row)
    buzz[mid] = row
  }
  const mangaList = [...releasing]
  for (let k = 0; k < mangaList.length; k += 3) { await Promise.all(mangaList.slice(k, k + 3).map(doManga)); await sleep(1000) }

  const results: any[] = []
  const one = async (c: any) => {
    const i = c.i
    if (!c.wiki_title) { c.wiki_title = await wikiTitle(c); if (c.wiki_title) await db.from('characters').update({ wiki_title: c.wiki_title }).eq('id', c.id) }
    const raw: Record<string, number> = {}, parts: Record<string, { score: number, label: string }> = {}

    const w = await wiki(c)
    if (w) { raw.wiki = w.raw; parts.wiki = { score: score(w.ratio), label: `${Math.round((w.ratio - 1) * 100)}% vs normal` } }

    // rate-limited sources rotate: each character gets a turn every few hours
    if (REDDIT_ON && i % 5 === hour % 5) {
      const r = await reddit(c); await sleep(1500)
      if (r) { raw.reddit = r.raw; const b = avgOf(c.id, 'reddit'); if (b != null) parts.reddit = { score: score((r.raw + 1) / (b + 1)), label: `${r.raw} posts today` } }
    }
    if (MAL_ON && i % 4 === hour % 4) {
      const m = await malFavs(c)
      if (m) { raw.mal = m.raw; const last = lastOf(c.id, 'mal'), dAvg = avgOf(c.id, 'mal_delta')
        if (last != null) { raw.mal_delta = m.raw - last; if (dAvg != null) parts.mal = { score: score((raw.mal_delta + 1) / (dAvg + 1)), label: `+${raw.mal_delta} favourites` } } }
    }
    if (YT_KEY && i % 720 === (hour * CHUNKS + chunk) % 720) {
      const y = await youtube(c)
      if (y) { raw.youtube = y.raw; const b = avgOf(c.id, 'youtube'); if (b != null) parts.youtube = { score: score((y.raw + 1) / (b + 1)), label: `${y.raw} videos today` } }
    }

    const a = alBy[c.id]
    if (a) {
      raw.anilist = a.favourites
      const last = lastOf(c.id, 'anilist'), dAvg = avgOf(c.id, 'anilist_delta')
      if (last != null) { raw.anilist_delta = a.favourites - last; if (dAvg != null) parts.anilist = { score: score((raw.anilist_delta + 1) / (dAvg + 1)), label: `+${raw.anilist_delta} favourites/hr` } }
      // look at every anime they're in: sequels (e.g. Black Clover Season 2) count, not just the most popular entry
      const shows = a.media.nodes || []
      if (shows.length) {
        const trending = Math.max(...shows.map((n: any) => n.trending || 0))
        raw.trending = trending
        const b = avgOf(c.id, 'trending'); if (b != null) parts.trending = { score: score((trending + 1) / (b + 1)), label: `trending score ${trending}` }
        const live = shows.filter((n: any) => n.status === 'RELEASING' && n.nextAiringEpisode)
          .sort((x: any, y: any) => x.nextAiringEpisode.timeUntilAiring - y.nextAiringEpisode.timeUntilAiring)[0]
        const showName = live ? (live.title.english || live.title.romaji) : ''
        // weekly show: 5 to 7.2 days until the next episode means one dropped in the last ~2 days.
        // A next episode weeks/months away means the show is on break (e.g. One Piece between seasons).
        const until = live ? live.nextAiringEpisode.timeUntilAiring : 0
        const onBreak = live && until > 8 * 86400
        const fresh = live && !onBreak && until > 5 * 86400
        // Episode day: first scan after a new episode starts a 24h boost (applied in market_tick) and a headline
        if (fresh) {
          const ep = live.nextAiringEpisode.episode - 1, key = `${live.id}-${ep}`
          if (c.event_key !== key) {
            await db.from('characters').update({ event_key: key, event_label: `${showName} ep ${ep}`, event_until: new Date(Date.now() + 86400000).toISOString() }).eq('id', c.id)
            await db.from('news').insert({ char_id: c.id, up: true, source: 'airing', text: `EPISODE DAY: ${showName.toUpperCase()} EP ${ep} IS OUT. $${c.sym} gets a 24h hype boost` })
          }
        }
        const backOn = live ? new Date(Date.now() + until * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
        parts.airing = !live ? { score: 0, label: 'not airing' }
          : onBreak ? { score: 0, label: `${showName} on break until ${backOn}` }
          : { score: fresh ? 0.6 : 0.25, label: fresh ? `${showName} ep ${live.nextAiringEpisode.episode - 1} just dropped` : `${showName} airing, ep ${live.nextAiringEpisode.episode} next` }
      }
    }

    const mb = c.manga_id && c.manga_status === 'RELEASING' ? buzz[c.manga_id] : null
    if (mb) {
      const ratios = [mb.views_ratio, mb.trending != null && mb.base_trending != null ? (mb.trending + 1) / (+mb.base_trending + 1) : null].filter((x: any) => x != null)
      const freshCh = mb.chapter_published && Date.now() - new Date(mb.chapter_published).getTime() < 48 * 3600000
      if (ratios.length || freshCh) {
        const base = ratios.length ? score(ratios.reduce((a: number, b: number) => a + +b, 0) / ratios.length) : 0
        parts.manga = { score: Math.min(1, base + (freshCh ? 0.4 : 0)),
          label: freshCh ? `${mb.title} ch ${mb.last_chapter} just dropped` : mb.views_ratio ? `manga page views ${Math.round((mb.views_ratio - 1) * 100)}% vs normal` : `manga trending ${mb.trending}` }
      }
    }
    // keep previous readings for sources not polled this hour so the "why" panel stays full
    const prevParts = c.hype_parts || {}
    for (const k of Object.keys(WEIGHTS)) if (!parts[k] && prevParts[k]) parts[k] = prevParts[k]

    let sum = 0, wsum = 0
    for (const [k, v] of Object.entries(parts)) { sum += v.score * WEIGHTS[k]; wsum += WEIGHTS[k] }
    // damp characters with little data so one signal (e.g. a new episode) can't max them out
    const hype = wsum ? +(sum / Math.max(wsum, 0.6)).toFixed(3) : 0

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
  for (let k = 0; k < chars.length; k += 8) await Promise.all(chars.slice(k, k + 8).map(c => one(c).catch(e => console.error(c.sym, e))))
  console.log(`chunk ${chunk}: updated ${results.length}`)
  return { chunk, updated: results.length, youtube: !!YT_KEY, results }
}

Deno.serve(async req => {
  const { data: cfg } = await db.from('app_config').select('value').eq('key', 'cron_secret').single()
  if (!cfg || req.headers.get('x-cron-secret') !== cfg.value) return new Response('forbidden', { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (body.mode === 'seed') return Response.json(await seed(body.count))
  if (body.mode === 'ipo') return Response.json(await ipo(body.count))
  if (body.mode === 'episodes') return Response.json(await episodes())
  if (body.mode === 'franchise') return Response.json(await franchise(body.titles, body.min))
  if (body.mode === 'probe') {
    // which outside sources answer from Supabase's servers (status + first bytes)
    const test = async (name: string, url: string) => {
      try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) }); return [name, r.status, (await r.text()).slice(0, 60)] }
      catch (e) { return [name, 'ERR', String(e).slice(0, 60)] }
    }
    return Response.json(await Promise.all([
      test('reddit', 'https://www.reddit.com/search.json?q=one%20piece%20chapter&t=day&limit=5'),
      test('reddit_old', 'https://old.reddit.com/r/OnePiece/new.json?limit=5'),
      test('jikan', 'https://api.jikan.moe/v4/characters?q=luffy&limit=1'),
      test('mangadex', 'https://api.mangadex.org/manga?title=one%20piece&limit=1'),
      test('wiki', 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/One_Piece/daily/20261010/20261019'),
    ]))
  }
  // answer the scheduler straight away and keep scanning in the background
  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(collect(body.chunk))
  return Response.json({ started: true })
})
