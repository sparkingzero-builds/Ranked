// AniList login (OAuth implicit grant) so list changes in Ranked are written to your real AniList.
// The client id is public; the access token stays in this browser only (valid ~1 year).
export const ANILIST_CLIENT_ID = import.meta.env.VITE_ANILIST_CLIENT_ID || ''
const KEY = 'ranked.al_token'

export function connectAniList() {
  location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`
}

// After AniList redirects back to /Ranked/#access_token=...&expires_in=..., keep the token and tidy the URL.
export function captureToken() {
  const h = new URLSearchParams(location.hash.slice(1))
  const t = h.get('access_token')
  if (!t) return
  try { localStorage.setItem(KEY, JSON.stringify({ t, exp: Date.now() + (+h.get('expires_in') || 31536000) * 1000 })) } catch {}
  history.replaceState(null, '', location.pathname + location.search)
}

export function getToken() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && v.exp > Date.now() ? v.t : null } catch { return null }
}
export function disconnectAniList() { try { localStorage.removeItem(KEY) } catch {} }

async function gql(query, variables) {
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(j.errors[0].message)
  return j.data
}

export const viewer = () => gql(`{ Viewer { id name avatar { medium } } }`).then(d => d.Viewer)

// status: CURRENT | PLANNING | COMPLETED | PAUSED | DROPPED | REMOVED
export async function saveToAniList(mediaId, status, progress) {
  if (status === 'REMOVED') {
    const me = await viewer()
    const d = await gql(`query($m:Int,$u:Int){ MediaList(mediaId:$m, userId:$u){ id } }`, { m: mediaId, u: me.id }).catch(() => null)
    if (d?.MediaList?.id) await gql(`mutation($id:Int){ DeleteMediaListEntry(id:$id){ deleted } }`, { id: d.MediaList.id })
    return
  }
  const vars = { m: mediaId, s: status }
  if (progress != null) vars.p = progress
  await gql(`mutation($m:Int,$s:MediaListStatus,$p:Int){ SaveMediaListEntry(mediaId:$m, status:$s, progress:$p){ id status } }`, vars)
}
