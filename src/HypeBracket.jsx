import { useEffect, useRef, useState } from 'react'
import { MOMENTS, MOMENT, thumb } from './moments.js'
import { sb, logActivity } from './cloud.js'

const ROUNDS = ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']
const RUN = 'ranked.hype.run'
const DONE = 'ranked.hype.done'
const load = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

// YouTube IFrame API, loaded once
let ytReady
function loadYT() {
  if (ytReady) return ytReady
  ytReady = new Promise(res => {
    if (window.YT?.Player) return res(window.YT)
    window.onYouTubeIframeAPIReady = () => res(window.YT)
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s)
  })
  return ytReady
}

// Plays a moment's clip once (no loop, no replay). Falls back to the next clip if one is blocked.
function Clip({ moment, onDone }) {
  const box = useRef(), player = useRef()
  const [idx, setIdx] = useState(0)
  const [canSkip, setCanSkip] = useState(false)
  useEffect(() => { setCanSkip(false); const t = setTimeout(() => setCanSkip(true), 10000); return () => clearTimeout(t) }, [moment.id, idx])
  useEffect(() => {
    let dead = false
    loadYT().then(YT => {
      if (dead) return
      box.current.innerHTML = '<div></div>'
      player.current = new YT.Player(box.current.firstChild, {
        videoId: moment.clips[idx], width: '100%', height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, loop: 0, fs: 1 },
        events: {
          onStateChange: e => { if (e.data === YT.PlayerState.ENDED) onDone() },
          onError: () => { if (idx + 1 < moment.clips.length) setIdx(idx + 1); else onDone(true) },
        },
      })
    })
    return () => { dead = true; try { player.current?.destroy() } catch {} }
  }, [moment.id, idx])
  return (
    <div className="hclip">
      <div className="hvideo" ref={box} />
      <div className="row hcliprow">
        <span className="muted small">Plays once, then the next one. {idx > 0 && '(backup clip)'}</span>
        {canSkip && <button className="pill ghost" onClick={() => { try { player.current?.stopVideo() } catch {} onDone() }}>Skip ▶▶</button>}
      </div>
    </div>
  )
}

export default function HypeBracket({ me, friends = [] }) {
  const online = !!(sb && me)
  const [played, setPlayed] = useState(null)       // finished bracket (server row or local), or false
  const [run, setRun] = useState(() => load(RUN))
  const [phase, setPhase] = useState('A')          // A -> B -> vote, for the current matchup
  const [started, setStarted] = useState(false)
  const [all, setAll] = useState([])

  useEffect(() => {
    if (online) {
      sb.from('hype_brackets').select('*').then(({ data }) => {
        setAll(data || [])
        setPlayed((data || []).find(r => r.user_id === me.id) || false)
      })
    } else setPlayed(load(DONE) || false)
  }, [online, me?.id])
  useEffect(() => { if (run) save(RUN, run) }, [run])

  if (played === null) return <div className="loading">Loading…</div>
  if (played) return <Results mine={played} all={all} friends={friends} me={me} />

  if (!run) return (
    <div className="card pad hintro">
      <div className="kicker">New mode</div>
      <div className="huge sm">HYPEST MOMENT EVER</div>
      <p>32 legendary moments, knockout bracket. Each matchup plays both clips once, then you pick the hypest. <b>You only get one run</b>: your champion is locked in for the squad to see.</p>
      <div className="hgrid">{MOMENTS.map(m => <img key={m.id} src={thumb(m)} alt={m.title} title={m.title} loading="lazy" />)}</div>
      <button className="pill lgo" onClick={() => { setRun({ order: shuffle(MOMENTS.map(m => m.id)), picks: [[]] }); setPhase('A') }}>Start the bracket</button>
    </div>
  )

  const round = run.picks.length - 1
  const entrants = round === 0 ? run.order : run.picks[round - 1]
  const match = run.picks[round].length
  const A = MOMENT[entrants[match * 2]], B = MOMENT[entrants[match * 2 + 1]]

  async function pick(winner) {
    const picks = run.picks.map(r => [...r])
    picks[round].push(winner)
    if (picks[round].length === entrants.length / 2) {
      if (picks[round].length === 1) return finish(picks)
      picks.push([])
    }
    setRun({ ...run, picks }); setPhase('A')
  }
  async function finish(picks) {
    const champion = picks[picks.length - 1][0]
    const row = { champion, picks, order: run.order }
    if (online) {
      const { data, error } = await sb.from('hype_brackets').insert(row).select().single()
      if (error) return alert(error.message)
      logActivity('hype_champ', { title: MOMENT[champion].title, cover: thumb(MOMENT[champion]) })
      setAll(a => [...a, data]); setPlayed(data)
    } else { save(DONE, { ...row, user_id: 'local' }); setPlayed({ ...row, user_id: 'local' }) }
    localStorage.removeItem(RUN)
  }

  return (
    <div className="hmatch">
      <div className="row hhead">
        <div><div className="kicker">{ROUNDS[round]}</div><div className="muted small">Match {match + 1} of {entrants.length / 2}</div></div>
        <div className="hprog"><div style={{ width: `${(run.picks.flat().length / 31) * 100}%` }} /></div>
      </div>
      {!started ? <button className="pill lgo" onClick={() => setStarted(true)}>▶ Play the clips</button>
        : phase === 'A' ? <Clip key={'A' + A.id} moment={A} onDone={() => setPhase('B')} />
        : phase === 'B' ? <Clip key={'B' + B.id} moment={B} onDone={() => setPhase('vote')} />
        : <div className="hvote">
            <div className="kicker">Which was hyper?</div>
            <div className="row gap">{[A, B].map(m => <button key={m.id} className="pill hpick" onClick={() => pick(m.id)}>{m.title}</button>)}</div>
          </div>}
      <div className="hvs">
        {[A, B].map((m, i) => <div key={m.id} className={`hcard ${(phase === 'A' && i === 0) || (phase === 'B' && i === 1) ? 'now' : ''}`}>
          <img src={thumb(m)} alt="" /><b>{m.title}</b><span>{m.anime}</span>
        </div>)}
        <div className="bvs">VS</div>
      </div>
    </div>
  )
}

function Results({ mine, all, friends, me }) {
  const names = Object.fromEntries(friends.map(f => [f.id, f.username]))
  const champ = MOMENT[mine.champion]
  // squad ranking: every matchup win is a point, a championship is worth 3
  const pts = {}
  for (const r of all.length ? all : [mine]) {
    (r.picks || []).flat().forEach(id => { pts[id] = (pts[id] || 0) + 1 })
    pts[r.champion] = (pts[r.champion] || 0) + 2
  }
  const board = Object.entries(pts).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const path = (mine.picks || []).map(r => r.includes(mine.champion) ? mine.champion : null)
  return (
    <div className="hresults">
      <div className="slide hero hchamp" style={{ backgroundImage: `linear-gradient(120deg, #ff2e63dd, #8a2be2dd), url(${thumb(champ)})` }}>
        <div className="kicker">Your hypest moment ever</div>
        <div className="mega sm">{champ.title.toUpperCase()}</div>
        <div className="sub">{champ.anime} · beat {path.filter(Boolean).length} moments to win. Locked in, no re-runs.</div>
      </div>
      <div className="two">
        <div>
          <h3>Squad champions</h3>
          <div className="card pad">
            {(all.length ? all : [mine]).map(r => <div key={r.user_id} className="mini">
              <img src={thumb(MOMENT[r.champion])} alt="" className="hthumb" />
              <span className="grow">{r.user_id === me?.id || r.user_id === 'local' ? 'You' : names[r.user_id] || '?'}</span>
              <b className="blue">{MOMENT[r.champion]?.title}</b></div>)}
          </div>
        </div>
        <div>
          <h3>Squad's hypest moments</h3>
          <div className="card pad">
            {board.map(([id, p], i) => <div key={id} className="mini"><b className={`r r${i + 1}`}>#{i + 1}</b>
              <img src={thumb(MOMENT[id])} alt="" className="hthumb" /><span className="grow">{MOMENT[id]?.title}</span><span className="muted">{p} pts</span></div>)}
          </div>
        </div>
      </div>
    </div>
  )
}
