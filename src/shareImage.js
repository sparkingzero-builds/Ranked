import { title } from './api.js'

const W = 1080, PAD = 50
const C = { bg: '#0c0920', yellow: '#ffd60a', pink: '#ff2e63', cyan: '#2be4ff', ink: '#120c2c' }
const TIERS = {
  legend: ['#ffb13b', '#ff6a00', '#b83c00'],
  epic: ['#d76bff', '#8a2be2', '#4b1590'],
  rare: ['#4fd2ff', '#1f7bff', '#10388f'],
}
const DISPLAY = 'Anton, Impact, sans-serif'
const BODY = 'Rubik, sans-serif'

const loadImg = src => new Promise(res => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => res(img)
  img.onerror = () => res(null)
  img.src = src
})

// Slanted panel: top-left square, bottom-right corner clipped
function notch(ctx, x, y, w, h, cut) {
  ctx.beginPath()
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut)
  ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.closePath()
}

function tierFill(ctx, tier, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h)
  TIERS[tier].forEach((c, i) => g.addColorStop(i / 2, c))
  return g
}

function cover(ctx, img, x, y, w, h, cut) {
  ctx.save()
  notch(ctx, x, y, w, h, cut); ctx.clip()
  ctx.fillStyle = '#261d57'; ctx.fillRect(x, y, w, h)
  if (img) {
    const s = Math.max(w / img.width, h / img.height)
    ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s)
  }
  ctx.restore()
}

function text(ctx, str, x, y, maxW, font, color, lines = 2) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'
  const words = str.toUpperCase().split(' '), out = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w } else line = t
  }
  out.push(line)
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/.{0,2}$/, '…') }
  const lh = parseInt(font.match(/(\d+)px/)[1]) * 1.2
  out.forEach((l, i) => ctx.fillText(l, x, y + i * lh))
}

// Skewed label with hard drop shadow, like the app's buttons
function tag(ctx, str, cx, cy, { font, bg, fg, shadow = '#000', padX = 14, h = 40 }) {
  ctx.font = font
  const w = ctx.measureText(str).width + padX * 2
  ctx.save(); ctx.translate(cx, cy); ctx.transform(1, 0, -0.21, 1, 0, 0)
  ctx.fillStyle = shadow; ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w, h)
  ctx.fillStyle = bg; ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.restore()
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(str, cx, cy + 2); ctx.textBaseline = 'alphabetic'
}

function background(ctx, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#1d1150'); g.addColorStop(0.5, C.bg); g.addColorStop(1, '#140a2e')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const glow = (x, y, r, c) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, c); rg.addColorStop(1, 'transparent')
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H)
  }
  glow(150, 0, 700, '#5b1fd188'); glow(W, 300, 600, '#ff2e6340')
  ctx.fillStyle = '#ffffff10'
  for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < W; x += 16) ctx.fillRect(x, y, 2, 2)
  // speed-line slashes behind the header
  ctx.save(); ctx.globalAlpha = 0.9
  ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.moveTo(0, 175); ctx.lineTo(W, 150); ctx.lineTo(W, 158); ctx.lineTo(0, 183); ctx.fill()
  ctx.fillStyle = C.pink; ctx.beginPath(); ctx.moveTo(0, 186); ctx.lineTo(W, 161); ctx.lineTo(W, 165); ctx.lineTo(0, 190); ctx.fill()
  ctx.restore()
}

export async function renderTopList(items, { userName, size, scores = {} }) {
  await document.fonts.load(`40px ${DISPLAY}`); await document.fonts.ready
  const imgs = await Promise.all(items.map(m => loadImg(m.coverImage.extraLarge || m.coverImage.large)))
  const rest = items.slice(3)
  const cols = 5, gap = 24, cw = (W - PAD * 2 - gap * (cols - 1)) / cols, ch = cw * 1.42
  const rowH = ch + 78
  const top = 220, podH = 610
  const H = top + podH + Math.ceil(rest.length / cols) * rowH + 80

  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')
  background(ctx, H)

  ctx.textAlign = 'center'
  ctx.font = `28px ${DISPLAY}`; ctx.fillStyle = C.cyan
  ctx.fillText(`${userName.toUpperCase()}'S`, W / 2, 52)
  ctx.save(); ctx.translate(W / 2, 150); ctx.transform(1, 0, -0.2, 1, 0, 0)
  ctx.font = `86px ${DISPLAY}`
  ctx.fillStyle = C.pink; ctx.fillText(`TOP ${size} ANIME`, 6, 6)
  ctx.fillStyle = C.yellow; ctx.fillText(`TOP ${size} ANIME`, 0, 0)
  ctx.restore()

  // podium: #2 left, #1 centre, #3 right — legendary + epic loot cards
  const pod = [{ i: 1, w: 250, x: 70, tier: 'epic' }, { i: 0, w: 320, x: W / 2 - 160, tier: 'legend' }, { i: 2, w: 250, x: W - 70 - 250, tier: 'epic' }]
  pod.forEach(({ i, w, x, tier }) => {
    const m = items[i]; if (!m) return
    const h = w * 1.42, p = 12, y = top + podH - h - 170
    const cardH = h + p * 2 + 120
    ctx.save()
    ctx.shadowColor = TIERS[tier][1]; ctx.shadowBlur = i === 0 ? 60 : 25
    notch(ctx, x - p, y - p, w + p * 2, cardH, 34); ctx.fillStyle = tierFill(ctx, tier, x, y, w, cardH); ctx.fill()
    ctx.restore()
    cover(ctx, imgs[i], x, y, w, h, 28)
    ctx.save(); ctx.translate(x + w / 2, y + h + 64); ctx.transform(1, 0, -0.2, 1, 0, 0)
    ctx.font = `${i === 0 ? 58 : 48}px ${DISPLAY}`; ctx.textAlign = 'center'
    ctx.fillStyle = '#000'; ctx.fillText(`#${i + 1}`, 4, 4)
    ctx.fillStyle = '#fff'; ctx.fillText(`#${i + 1}`, 0, 0)
    ctx.restore()
    text(ctx, title(m), x + w / 2, y + h + 96, w - 10, `800 18px ${BODY}`, '#fff')
    if (scores[m.id]) tag(ctx, `★ ${scores[m.id]}`, x + w - 46, y + 26, { font: `22px ${DISPLAY}`, bg: C.yellow, fg: C.ink, h: 36 })
  })

  rest.forEach((m, k) => {
    const col = k % cols, row = Math.floor(k / cols)
    const x = PAD + col * (cw + gap), y = top + podH + row * rowH
    ctx.fillStyle = tierFill(ctx, 'rare', x, y, cw, ch)
    notch(ctx, x - 5, y - 5, cw + 10, ch + 10, 22); ctx.fill()
    cover(ctx, imgs[k + 3], x, y, cw, ch, 18)
    tag(ctx, `#${k + 4}`, x + 34, y + 24, { font: `24px ${DISPLAY}`, bg: C.ink, fg: C.cyan, padX: 10, h: 34 })
    if (scores[m.id]) tag(ctx, `★ ${scores[m.id]}`, x + cw - 36, y + 24, { font: `18px ${DISPLAY}`, bg: C.yellow, fg: C.ink, padX: 8, h: 30 })
    text(ctx, title(m), x + cw / 2, y + ch + 32, cw, `800 15px ${BODY}`, '#fff')
  })

  tag(ctx, 'RANKED.', W / 2, H - 40, { font: `22px ${DISPLAY}`, bg: C.yellow, fg: C.ink, shadow: C.pink, h: 36 })
  return cv
}
