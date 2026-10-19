import { useState } from 'react'
import { sb } from './cloud.js'

export default function Lobby() {
  const [mode, setMode] = useState('in')
  const [f, setF] = useState({ email: '', password: '', username: '', anilist: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    if (mode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password })
      if (error) setMsg(error.message)
    } else {
      if (!/^[A-Za-z0-9_]{2,20}$/.test(f.username)) { setMsg('Username: 2–20 letters, numbers or _'); setBusy(false); return }
      const { data: taken } = await sb.rpc('username_taken', { p_name: f.username })
      if (taken) { setMsg('That username is taken'); setBusy(false); return }
      const { data, error } = await sb.auth.signUp({
        email: f.email, password: f.password,
        options: { data: { username: f.username, anilist_name: f.anilist || null }, emailRedirectTo: location.origin + location.pathname },
      })
      if (error) setMsg(error.message)
      else if (!data.session) setMsg('Check your email to confirm, then sign in.')
    }
    setBusy(false)
  }

  return (
    <div className="lobby">
      <div className="lobbybox">
        <div className="logo big">R<span>.</span></div>
        <div className="kicker">Rank it. Rate it. Trade it.</div>
        <div className="tabs">
          <button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
          <button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Join the squad</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'up' && <>
            <input className="search" placeholder="Username (what friends see)" value={f.username} onChange={set('username')} required />
            <input className="search" placeholder="AniList username (optional, imports your list)" value={f.anilist} onChange={set('anilist')} />
          </>}
          <input className="search" type="email" placeholder="Email" value={f.email} onChange={set('email')} required autoComplete="email" />
          <input className="search" type="password" placeholder="Password (6+ characters)" minLength={6} value={f.password} onChange={set('password')} required
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          {msg && <div className="lmsg">{msg}</div>}
          <button className="pill lgo" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Drop in' : 'Create account'}</button>
        </form>
      </div>
    </div>
  )
}
