import { createClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

// null when the app runs local-only (no Supabase configured)
export const sb = url && key ? createClient(url, key) : null

export function useSession() {
  const [session, setSession] = useState(sb ? undefined : null)
  useEffect(() => {
    if (!sb) return
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

// Make sure a signed-in user has a profile, state and wallet row (covers email-confirm sign-ups).
export async function ensureProfile(user) {
  let { data: p } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (!p) {
    const m = user.user_metadata || {}
    const { data, error } = await sb.from('profiles')
      .insert({ id: user.id, username: m.username || user.email.split('@')[0], anilist_name: m.anilist_name || null })
      .select().single()
    if (error) throw error
    p = data
    await sb.from('user_state').upsert({ user_id: user.id })
    await sb.from('wallets').upsert({ user_id: user.id })
  }
  return p
}

export async function fetchProfiles() {
  const { data } = await sb.from('profiles').select('*').order('username')
  return data || []
}

// Two-way sync of one row's columns with local React state.
// Loads once on sign-in (remote wins unless it's empty, then local is pushed up), then saves changes debounced.
export function useRowSync(table, userId, fields) {
  const loaded = useRef(false)
  const [ready, setReady] = useState(!sb || !userId)
  const values = fields.map(f => f.value)

  useEffect(() => {
    loaded.current = false
    if (!sb || !userId) { setReady(true); return }
    setReady(false)
    sb.from(table).select('*').eq('user_id', userId).maybeSingle().then(({ data }) => {
      const remoteEmpty = !data || fields.every(f => isEmpty(data[f.col]))
      if (remoteEmpty) save()
      else fields.forEach(f => { if (data[f.col] != null) f.set(data[f.col]) })
      loaded.current = true
      setReady(true)
    })
  }, [userId])

  const timer = useRef()
  useEffect(() => {
    if (!loaded.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(save, 1200)
  }, values)

  function save() {
    const row = { user_id: userId, updated_at: new Date().toISOString() }
    fields.forEach(f => { row[f.col] = f.value })
    return sb.from(table).upsert(row)
  }
  return ready
}

const isEmpty = v => v == null || (Array.isArray(v) ? !v.length : typeof v === 'object' && Object.values(v).every(isEmpty))
