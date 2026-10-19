import { useEffect, useRef } from 'react'
import { sb, logActivity } from './cloud.js'

// Each check gets a snapshot of the player's data; unlocked keys are saved to Supabase
// so friends see them on profiles and the squad feed.
export const ACHIEVEMENTS = [
  { key: 'hours_100', icon: '⏱️', label: 'Binger', desc: 'Watch 100 hours of anime', check: d => d.hours >= 100 },
  { key: 'hours_1000', icon: '🍿', label: 'No Life', desc: 'Watch 1,000 hours', check: d => d.hours >= 1000 },
  { key: 'hours_3000', icon: '👑', label: 'Otaku King', desc: 'Watch 3,000 hours', check: d => d.hours >= 3000 },
  { key: 'complete_100', icon: '✅', label: 'Finisher', desc: 'Complete 100 anime', check: d => d.completed >= 100 },
  { key: 'critic', icon: '📝', label: 'Critic', desc: 'Give 10 detailed ratings', check: d => d.ratings >= 10 },
  { key: 'top10', icon: '🏆', label: 'Ranked Up', desc: 'Fill your anime Top 10', check: d => d.top10 >= 10 },
  { key: 'char_top', icon: '🦸', label: 'Stan', desc: 'Fill your character Top 10', check: d => d.charTop >= 10 },
  { key: 'season', icon: '📅', label: 'In Season', desc: 'Rank 5 shows from this season', check: d => d.season >= 5 },
  { key: 'first_trade', icon: '💸', label: 'Investor', desc: 'Make your first trade', check: d => d.trades >= 1 },
  { key: 'trades_25', icon: '📈', label: 'Day Trader', desc: 'Make 25 trades', check: d => d.trades >= 25 },
  { key: 'worth_15k', icon: '💰', label: 'Tycoon', desc: 'Reach 15,000 net worth', check: d => d.worth >= 15000 },
  { key: 'worth_25k', icon: '🐋', label: 'Whale', desc: 'Reach 25,000 net worth', check: d => d.worth >= 25000 },
  { key: 'ipo', icon: '🚀', label: 'IPO Hunter', desc: 'Buy a stock during its IPO', check: d => d.ipoBuys >= 1 },
  { key: 'pollster', icon: '🗳️', label: 'Hot Take', desc: 'Start a poll', check: d => d.polls >= 1 },
  { key: 'voter', icon: '🙋', label: 'Voice Heard', desc: 'Vote on 5 polls', check: d => d.votes >= 5 },
]
export const ACH = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, a]))

// Runs the checks whenever `deps` change (page switches, data loads) and announces new unlocks.
export function useAchievements(me, local, onUnlock, deps) {
  const have = useRef(null)
  useEffect(() => {
    if (!sb || !me) return
    let dead = false
    ;(async () => {
      if (!have.current) {
        const { data } = await sb.from('achievements').select('key').eq('user_id', me.id)
        have.current = new Set((data || []).map(r => r.key))
      }
      const [w, p, v] = await Promise.all([
        sb.from('wallets').select('cash, holdings, trades').eq('user_id', me.id).maybeSingle(),
        sb.from('polls').select('id', { count: 'exact', head: true }).eq('user_id', me.id),
        sb.from('poll_votes').select('poll_id', { count: 'exact', head: true }).eq('user_id', me.id),
      ])
      const ids = [...new Set([...Object.keys(w.data?.holdings || {}).map(Number), ...(w.data?.trades || []).map(t => t.id)])]
      const chars = ids.length ? await sb.from('characters').select('id, price, ipo_at').in('id', ids) : { data: [] }
      const byId = Object.fromEntries((chars.data || []).map(c => [c.id, c]))
      const wallet = w.data || { cash: 10000, holdings: {}, trades: [] }
      const worth = Number(wallet.cash) + Object.entries(wallet.holdings || {}).reduce((a, [id, h]) => a + (Number(byId[id]?.price) || 0) * h.qty, 0)
      const ipoBuys = (wallet.trades || []).filter(t => t.qty > 0 && byId[t.id]?.ipo_at && t.at - new Date(byId[t.id].ipo_at) < 48 * 3600000).length
      const d = { ...local, worth, trades: (wallet.trades || []).length, ipoBuys, polls: p.count || 0, votes: v.count || 0 }
      for (const a of ACHIEVEMENTS) {
        if (dead || have.current.has(a.key) || !a.check(d)) continue
        have.current.add(a.key)
        const { error } = await sb.from('achievements').insert({ key: a.key })
        if (!error) { logActivity('achievement', { key: a.key }); onUnlock(a) }
      }
    })()
    return () => { dead = true }
  }, deps)
}
