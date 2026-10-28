const URL = 'https://graphql.anilist.co'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// AniList sometimes answers with an HTML error page or 429 when it's overloaded/rate limiting.
// Retry a few times with backoff, and turn non-JSON replies into a readable error.
async function gql(query, variables, tries = 3) {
  for (let i = 0; ; i++) {
    let res, text
    try {
      res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) })
      text = await res.text()
    } catch { if (i + 1 < tries) { await sleep(1500 * (i + 1)); continue } throw new Error('AniList is unreachable right now') }
    let json = null
    try { json = JSON.parse(text) } catch {}
    const busy = !json || res.status === 429 || res.status >= 500
    if (busy && i + 1 < tries) { await sleep((+res.headers.get('Retry-After') || 2 * (i + 1)) * 1000); continue }
    if (!json) throw new Error('AniList is busy right now, try again in a minute')
    if (json.errors) throw new Error(json.errors[0].message)
    return json.data
  }
}

// last good copy of a user's data, used when AniList is down
const cacheKey = (k, n) => `ranked.cache.${k}.${String(n).toLowerCase()}`
function cached(k, n, fn) {
  return fn().then(v => { try { localStorage.setItem(cacheKey(k, n), JSON.stringify(v)) } catch {} return v })
    .catch(e => {
      try { const v = JSON.parse(localStorage.getItem(cacheKey(k, n))); if (v) { v.__stale = true; return v } } catch {}
      throw e
    })
}

const MEDIA = `id title { romaji english } coverImage { extraLarge large medium color } episodes duration genres averageScore format seasonYear
  nextAiringEpisode { episode timeUntilAiring }`

export function fetchUser(name) {
  return cached('user', name, () => gql(`query($n:String){ User(name:$n){ id name avatar { medium } } }`, { n: name }).then(d => d.User))
}

export function fetchList(name) {
  return cached('list', name, () => fetchListLive(name))
}
async function fetchListLive(name) {
  const d = await gql(`query($n:String){ MediaListCollection(userName:$n, type:ANIME){
    lists { entries { status progress score(format:POINT_10) updatedAt startedAt { year month day } completedAt { year month day } media { ${MEDIA} } } } } }`, { n: name })
  const seen = new Map()
  d.MediaListCollection.lists.flatMap(l => l.entries).forEach(e => seen.set(e.media.id, e))
  return [...seen.values()]
}

export async function fetchActivity(userId) {
  const d = await gql(`query($id:Int){ Page(perPage:12){ activities(userId:$id, sort:ID_DESC){
    ... on ListActivity { id status progress createdAt media { id title { romaji } coverImage { medium } } } } } }`, { id: userId })
  return d.Page.activities.filter(a => a.media)
}

export async function searchAnime(q) {
  const d = await gql(`query($q:String){ Page(perPage:24){ media(search:$q, type:ANIME, sort:POPULARITY_DESC){ ${MEDIA} } } }`, { q })
  return d.Page.media
}

export async function trending() {
  const d = await gql(`{ Page(perPage:24){ media(type:ANIME, sort:TRENDING_DESC){ ${MEDIA} } } }`)
  return d.Page.media
}

export const title = m => m.title.english || m.title.romaji

export async function fetchTopCharacters() {
  const d = await gql(`{ Page(perPage:50){ characters(sort:FAVOURITES_DESC){ id name { full } image { large medium } favourites
    media(perPage:1, sort:POPULARITY_DESC){ nodes { id title { romaji english } coverImage { color } } } } } }`)
  return d.Page.characters
}

export async function fetchMediaDetail(id) {
  const d = await gql(`query($id:Int){ Media(id:$id){ ${MEDIA} description(asHtml:false) bannerImage season status source
    studios(isMain:true){ nodes { name } } trailer { id site }
    externalLinks { site url type icon color }
    characters(sort:[ROLE, FAVOURITES_DESC], perPage:12){ edges { role node { id name { full } image { large } } } }
    relations { edges { relationType node { id type format title { romaji english } coverImage { large } } } }
    recommendations(perPage:8, sort:RATING_DESC){ nodes { mediaRecommendation { id title { romaji english } coverImage { large } averageScore } } } } }`, { id })
  return d.Media
}

// Passport: extra details for finished shows (studio, season, source, popularity), 50 per request
// cached in localStorage: studio/source/season never change, and two passports loading at once can hit AniList's rate limit
const PP_KEY = 'ranked.cache.passport'
export async function fetchPassportMedia(ids) {
  let cache = {}
  try { cache = JSON.parse(localStorage.getItem(PP_KEY)) || {} } catch {}
  const out = {}, need = ids.filter(id => { if (cache[id]) { out[id] = cache[id]; return false } return true })
  for (let k = 0; k < need.length; k += 50) {
    const d = await gql(`query($ids:[Int]){ Page(perPage:50){ media(id_in:$ids){ id season seasonYear format source popularity countryOfOrigin episodes
      startDate { year } studios(isMain:true){ nodes { name } } } } }`, { ids: need.slice(k, k + 50) })
    for (const m of d.Page.media) out[m.id] = cache[m.id] = m
  }
  try { localStorage.setItem(PP_KEY, JSON.stringify(cache)) } catch {}
  return out
}

// Watch streaks: days you logged an episode or finished a show on AniList (newest 1,000 list activities)
export async function fetchWatchDays(userId) {
  const days = new Set()
  for (let page = 1; page <= 20; page++) {
    const d = await gql(`query($id:Int,$p:Int){ Page(page:$p, perPage:50){ pageInfo { hasNextPage }
      activities(userId:$id, type:ANIME_LIST, sort:ID_DESC){ ... on ListActivity { status createdAt } } } }`, { id: userId, p: page })
    for (const a of d.Page.activities) if (/watched|completed|rewatched/.test(a.status || '')) {
      const t = new Date(a.createdAt * 1000)
      days.add(`${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`)
    }
    if (!d.Page.pageInfo.hasNextPage) break
  }
  return days
}
