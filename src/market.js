// Market data now lives in Supabase: prices tick server-side every 5 minutes and
// hype is collected hourly from Wikipedia, Reddit, AniList, MyAnimeList and YouTube.
export const START_CASH = 10_000
export const TICK_MS = 5 * 60_000

export const coins = n => Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pct = n => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`
export const change24 = c => c.price_24h ? c.price / c.price_24h - 1 : 0
export const powerGap = c => (c.base * c.power) / c.p0 / c.price - 1

export const SOURCES = {
  wiki: { label: 'Wikipedia', icon: '📖', note: 'Search interest (Google Trends stand-in)' },
  reddit: { label: 'Reddit', icon: '💬', note: 'Posts in the last 24h' },
  youtube: { label: 'YouTube', icon: '▶️', note: 'New videos in the last 24h' },
  anilist: { label: 'AniList', icon: '⭐', note: 'New favourites' },
  trending: { label: 'Trending', icon: '📈', note: 'Show trending score' },
  airing: { label: 'Airing', icon: '📺', note: 'New episode this week' },
  mal: { label: 'MyAnimeList', icon: '❤️', note: 'New favourites' },
  manga: { label: 'Manga', icon: '📚', note: 'Reddit chapter talk + new chapter releases' },
  event: { label: 'Market event', icon: '⚡', note: 'Crash, bull run or hype week' },
}
