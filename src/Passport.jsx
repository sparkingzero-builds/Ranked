import { useEffect, useMemo, useState } from 'react'
import { title, fetchPassportMedia, fetchWatchDays } from './api.js'

// Anime passport: a stamp for every show you've finished (all of AniList history, not just new ones),
// plus collections that level up Bronze → Silver → Gold → Legendary. Watch streaks come from AniList activity dates.

const TIERS = [['bronze', 'Bronze'], ['silver', 'Silver'], ['gold', 'Gold'], ['legend', 'Legendary']]
// level from a count and the thresholds for each tier (0 = not earned yet)
const level = (n, steps) => steps.reduce((l, s, i) => (n >= s ? i + 1 : l), 0)

const STUDIOS = ['MAPPA', 'ufotable', 'Wit Studio', 'Bones', 'Madhouse', 'Toei Animation', 'Studio Pierrot', 'Kyoto Animation', 'A-1 Pictures', 'CloverWorks',
  'Trigger', 'Science SARU', 'David Production', 'Sunrise', 'Production I.G', 'Studio Ghibli', 'Shaft', 'J.C.Staff', 'TMS Entertainment', 'Bandai Namco Pictures']
const GENRE_ICON = { Action: '⚔️', Adventure: '🧭', Comedy: '😂', Drama: '🎭', Fantasy: '🐉', Horror: '👻', Mecha: '🤖', Music: '🎵', Mystery: '🔍', Psychological: '🧠',
  Romance: '💘', 'Sci-Fi': '🚀', 'Slice of Life': '☕', Sports: '🏆', Supernatural: '🔮', Thriller: '🔪', 'Mahou Shoujo': '🪄', Ecchi: '🍑' }

function ymd(d) { return d?.year ? new Date(d.year, (d.month || 1) - 1, d.day || 1) : null }

// how rare a single show's stamp is
function showRarity(e, x) {
  const eps = e.media.episodes || e.progress || 0
  if (eps >= 500) return ['legend', 'Long runner']
  if ((x?.popularity || 1e9) < 15000) return ['gold', 'Hidden gem']
  if (eps >= 100) return ['gold', 'Marathon']
  if ((x?.startDate?.year || e.media.seasonYear || 2020) < 2000) return ['silver', 'Classic']
  if (e.score >= 10) return ['silver', 'Perfect 10']
  return ['bronze', '']
}

export function streaks(days) {
  const key = t => `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`
  let cur = 0
  const d = new Date()
  if (!days.has(key(d))) d.setDate(d.getDate() - 1)  // today not logged yet: streak still counts from yesterday
  while (days.has(key(d))) { cur++; d.setDate(d.getDate() - 1) }
  // best streak: walk sorted days
  const sorted = [...days].map(s => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd).getTime() }).sort((a, b) => a - b)
  let best = 0, run = 0
  sorted.forEach((t, i) => { run = i && t - sorted[i - 1] <= 86400000 * 1.5 ? run + 1 : 1; best = Math.max(best, run) })
  return { cur, best, total: days.size }
}

export default function Passport({ list, user }) {
  const done = useMemo(() => list.filter(e => e.status === 'COMPLETED' || e.status === 'REPEATING')
    .sort((a, b) => (ymd(b.completedAt) || 0) - (ymd(a.completedAt) || 0)), [list])
  const [extra, setExtra] = useState({})
  const [days, setDays] = useState(null)
  const [filter, setFilter] = useState('all')
  useEffect(() => { if (done.length) fetchPassportMedia(done.map(e => e.media.id)).then(setExtra).catch(() => {}) }, [done.length])
  useEffect(() => { if (user?.id) fetchWatchDays(user.id).then(setDays).catch(() => setDays(new Set())) }, [user?.id])

  const st = days ? streaks(days) : null
  const cols = useMemo(() => collections(done, extra, st), [done, extra, st?.best])
  const earned = cols.filter(c => c.lvl > 0).length
  const shown = filter === 'all' ? done : done.filter(e => showRarity(e, extra[e.media.id])[0] === filter)

  if (!done.length) return <div className="card pad muted">Finish a show on AniList and your first stamp lands here.</div>
  return <div className="passport">
    <div className="pphead">
      <div className="ppcover">
        <div className="kicker">Anime Passport</div>
        <h1>{user?.name || 'Traveller'}</h1>
        <div className="ppstats">
          <div><b>{done.length}</b><span>shows stamped</span></div>
          <div><b>{earned}/{cols.length}</b><span>collections</span></div>
          <div><b>{done.reduce((a, e) => a + (e.media.episodes || e.progress || 0), 0).toLocaleString()}</b><span>episodes</span></div>
        </div>
      </div>
      <div className={`ppstreak ${st?.cur ? 'on' : ''}`}>
        <div className="flame">🔥</div>
        <b>{st ? st.cur : '…'}</b><span>day watch streak</span>
        {st && <em>Best {st.best} · {st.total} days logged</em>}
        {st && !st.cur && <small>Log an episode today to start one</small>}
      </div>
    </div>

    <div className="ppexplain">
      <div><b>🎟️ Stamps</b> = every show you've finished. Finish a show on AniList and a stamp of it appears below. The ring colour shows how rare it is.</div>
      <div><b>🏅 Collections</b> = goals. Each one counts something (shows in a genre, films, 10/10 ratings…) and levels up Bronze → Silver → Gold → Legendary as the number grows.</div>
      <div><b>🔥 Streak</b> = days in a row you've logged at least one episode on AniList.</div>
    </div>

    <h3>Collections</h3>
    <p className="muted small">What each one counts is written under its name. The bar shows how close you are to the next tier.</p>
    <div className="ppcols">
      {cols.map(c => <div key={c.id} className={`ppcol t${c.lvl}`} title={c.how}>
        <div className="ppseal">{c.icon}</div>
        <div className="grow"><b>{c.name} <em className={`ptier t${c.lvl}`}>{c.lvl ? TIERS[c.lvl - 1][1] : 'Locked'}</em></b>
          <small>{c.how}</small>
          <span>{c.next ? <>{c.n.toLocaleString()} so far · <b>{(c.next - c.n).toLocaleString()} more</b> for {TIERS[c.lvl][1]}</> : <>{c.n.toLocaleString()} · maxed out 🏆</>}</span>
          <div className="ppbar"><div style={{ width: `${Math.min(100, (c.n / (c.next || c.n || 1)) * 100)}%` }} /></div>
        </div>
      </div>)}
    </div>

    <div className="row pphead2">
      <h3>Stamps</h3>
      <div className="tabs rtabs">{[['all', 'All'], ['legend', 'Legendary'], ['gold', 'Gold'], ['silver', 'Silver'], ['bronze', 'Bronze']].map(([k, l]) =>
        <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
    </div>
    <div className="pplegend">
      <span className="lg-legend">Legendary</span> 500+ episodes (One Piece-level runs)
      <span className="lg-gold">Gold</span> hidden gem (under 15k viewers) or 100+ episodes
      <span className="lg-silver">Silver</span> made before 2000, or you rated it 10/10
      <span className="lg-bronze">Bronze</span> every other show you've finished
    </div>
    <div className="ppgrid">
      {shown.map((e, i) => { const x = extra[e.media.id]; const [r, tag] = showRarity(e, x); const when = ymd(e.completedAt)
        const why = { legend: 'Legendary: 500+ episodes', gold: tag === 'Hidden gem' ? 'Gold: fewer than 15k people have watched it' : 'Gold: 100+ episodes', silver: tag === 'Classic' ? 'Silver: made before 2000' : 'Silver: you rated it 10/10', bronze: 'Bronze: finished' }[r]
        return <div key={e.media.id} title={why} className={`stamp r-${r}`} style={{ '--rot': `${((e.media.id * 37) % 13) - 6}deg`, '--c': e.media.coverImage.color || '#ffd60a' }}>
          <img src={e.media.coverImage.large} alt="" loading="lazy" />
          <div className="sring" />
          {tag && <i>{tag}</i>}
          <b>{title(e.media)}</b>
          <span>{when ? when.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'Finished'}{x?.studios?.nodes?.[0] ? ` · ${x.studios.nodes[0].name}` : ''}</span>
        </div> })}
    </div>
  </div>
}

// every collection: [count, tier thresholds]
export function collections(done, extra, st) {
  const X = e => extra[e.media.id] || {}
  const eps = done.reduce((a, e) => a + (e.media.episodes || e.progress || 0), 0)
  const year = e => X(e).startDate?.year || e.media.seasonYear
  const C = []
  const add = (id, icon, name, n, steps, how) => { const lvl = level(n, steps); C.push({ id, icon, name, n, lvl, next: steps[lvl] || null, how }) }

  add('done', '📘', 'World Traveller', done.length, [1, 50, 200, 400], 'Shows finished')
  add('eps', '📺', 'Episode Grinder', eps, [500, 2500, 7500, 15000], 'Total episodes in finished shows')
  add('long', '🏔️', 'Long Runner', done.filter(e => (e.media.episodes || e.progress) >= 100).length, [1, 5, 12, 25], 'Finished a 100+ episode show')
  add('movie', '🎬', 'Cinephile', done.filter(e => e.media.format === 'MOVIE').length, [1, 10, 25, 50], 'Anime films finished')
  add('short', '⚡', 'Bite Size', done.filter(e => ['ONA', 'TV_SHORT', 'OVA', 'SPECIAL'].includes(e.media.format)).length, [1, 5, 15, 30], 'OVAs, ONAs, specials and shorts')
  add('perfect', '💯', 'Perfect 10', done.filter(e => e.score >= 10).length, [1, 10, 25, 50], 'Shows you rated 10')
  add('critic', '🧐', 'Harsh Critic', done.filter(e => e.score && e.score <= 4).length, [1, 3, 8, 15], 'Shows you rated 4 or lower')
  add('gem', '💎', 'Hidden Gem Hunter', done.filter(e => (X(e).popularity || 1e9) < 15000).length, [1, 5, 15, 30], 'Finished a show fewer than 15k people have seen')
  add('classic', '📼', 'Retro Collector', done.filter(e => year(e) && year(e) < 2000).length, [1, 5, 15, 30], 'Shows from before 2000')
  add('decades', '🕰️', 'Time Traveller', new Set(done.map(e => year(e) && Math.floor(year(e) / 10) * 10).filter(Boolean)).size, [2, 3, 5, 6], 'Different decades covered')
  add('seasons', '🍂', 'Four Seasons', new Set(done.map(e => X(e).season).filter(Boolean)).size, [1, 2, 3, 4], 'Shows from Winter, Spring, Summer and Fall')
  add('simulcast', '📡', 'Simulcast Warrior', done.filter(e => { const c = ymd(e.completedAt); return c && year(e) === c.getFullYear() }).length, [1, 15, 40, 80], 'Finished a show the same year it aired')
  add('speed', '🏃', 'Speedrunner', done.filter(e => { const s = ymd(e.startedAt), c = ymd(e.completedAt); return s && c && (e.media.episodes || 0) >= 12 && c - s <= 3 * 86400000 }).length, [1, 3, 8, 15], 'Finished a 12+ episode show within 3 days of starting')
  add('manga', '📚', 'Page to Screen', done.filter(e => X(e).source === 'MANGA').length, [1, 30, 90, 180], 'Manga adaptations')
  add('ln', '📖', 'Light Novel Reader', done.filter(e => ['LIGHT_NOVEL', 'NOVEL', 'WEB_NOVEL'].includes(X(e).source)).length, [1, 10, 30, 60], 'Novel adaptations')
  add('original', '✨', 'Original Story', done.filter(e => X(e).source === 'ORIGINAL').length, [1, 10, 25, 50], 'Anime-original stories')
  add('game', '🎮', 'Player Two', done.filter(e => X(e).source === 'VIDEO_GAME').length, [1, 3, 8, 15], 'Video game adaptations')
  add('abroad', '🌏', 'Overseas', done.filter(e => X(e).countryOfOrigin && X(e).countryOfOrigin !== 'JP').length, [1, 3, 8, 15], 'Donghua, manhwa and other non-Japanese shows')
  add('streak', '🔥', 'Streak Keeper', st?.best || 0, [7, 30, 100, 365], 'Best daily watch streak')
  add('studiohop', '🏢', 'Studio Hopper', new Set(done.flatMap(e => (X(e).studios?.nodes || []).map(s => s.name))).size, [5, 20, 40, 80], 'Different studios watched')
  for (const s of STUDIOS) {
    const n = done.filter(e => (X(e).studios?.nodes || []).some(x => x.name === s)).length
    if (n) add('st-' + s, '🎞️', s, n, [1, 5, 15, 30], `Shows by ${s}`)
  }
  const genres = {}
  for (const e of done) for (const g of e.media.genres || []) genres[g] = (genres[g] || 0) + 1
  for (const [g, icon] of Object.entries(GENRE_ICON)) add('g-' + g, icon, g, genres[g] || 0, [1, 15, 60, 150], `${g} shows finished`)
  return C.sort((a, b) => b.lvl - a.lvl || (b.n / (b.next || 1)) - (a.n / (a.next || 1)))
}
