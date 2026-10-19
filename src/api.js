const URL = 'https://graphql.anilist.co'

async function gql(query, variables) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

const MEDIA = `id title { romaji english } coverImage { extraLarge large medium color } episodes duration genres averageScore format seasonYear
  nextAiringEpisode { episode timeUntilAiring }`

export async function fetchUser(name) {
  const d = await gql(`query($n:String){ User(name:$n){ id name avatar { medium } } }`, { n: name })
  return d.User
}

export async function fetchList(name) {
  const d = await gql(`query($n:String){ MediaListCollection(userName:$n, type:ANIME){
    lists { entries { status progress score(format:POINT_10) updatedAt media { ${MEDIA} } } } } }`, { n: name })
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
