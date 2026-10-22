// Renders every static panel on the profile in one Matrix look: code rain,
// phosphor green on near-black, glyphs that decode into words. GitHub serves
// README images through camo with no JavaScript, so all motion is CSS
// keyframes or SMIL inside the SVG itself. Text is laid out glyph by glyph
// (explicit x lists) so nothing depends on the viewer's font width -- boxes
// always fit their labels and nothing is clipped mid-word.
//
//   node .github/scripts/matrix.mjs

import fs from 'node:fs'

const C = {
  bg: '#0d0208',
  panel: '#050f07',
  hi: '#00ff41',
  mid: '#00c832',
  dim: '#008f11',
  deep: '#003b00',
  head: '#d8ffe2',
  red: '#ff3b3b',
  blue: '#3b8bff',
}
const MONO = `'JetBrains Mono','Cascadia Mono',Consolas,'SFMono-Regular',Menlo,'Courier New',monospace`
const GLYPH_FONT = `'MS Gothic','Hiragino Kaku Gothic Pro','Noto Sans Mono CJK JP','Noto Sans JP',${MONO}`
const ADV = 0.6 // monospace advance, as a fraction of font size
const W = 840

// Seeded so a re-run produces the same file and a clean diff.
let seed = 0x5eed
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const KANA = [...'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:=*+<>¦']
const SCRAMBLE = [...'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ01234567890#$%&*+<>?/']

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xs = (x, n, size) => Array.from({ length: n }, (_, i) => (x + i * size * ADV).toFixed(1)).join(' ')
const textW = (s, size) => [...s].length * size * ADV

// One line of monospace text whose every glyph sits at a known x.
function mono(x, y, s, size, cls = '', extra = '') {
  const n = [...s].length
  return `<text x="${xs(x, n, size)}" y="${y}" font-size="${size}" class="${cls}"${extra}>${esc(s)}</text>`
}

function frame(w, h, body, style = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
<style>
  text { font-family: ${MONO}; fill: ${C.hi}; white-space: pre; }
  .g { font-family: ${GLYPH_FONT}; }
  .hi { fill: ${C.hi}; } .mid { fill: ${C.mid}; } .dim { fill: ${C.dim}; } .deep { fill: ${C.deep}; }
  .head { fill: ${C.head}; } .b { font-weight: 700; }
  .glow { filter: drop-shadow(0 0 3px rgba(0,255,65,.65)); }
  .soft { filter: drop-shadow(0 0 1.5px rgba(0,255,65,.45)); }
  ${style}
</style>
<rect width="${w}" height="${h}" rx="10" fill="${C.bg}"/>
${body}
</svg>
`
}

function scanlines(w, h, opacity = 0.18) {
  return `<g opacity="${opacity}">${Array.from({ length: Math.ceil(h / 3) }, (_, i) => `<rect y="${i * 3}" width="${w}" height="1" fill="#000"/>`).join('')}</g>`
}

// Falling columns of mirrored katakana. Each column is one <g> that slides
// from above the panel to below it; the brightest glyph leads.
let rainId = 0
function rain({ w, h, x0 = 0, cols, size = 15, opacity = 1, minDur = 5, maxDur = 11 }) {
  const id = `r${rainId++}`
  const step = (w - x0) / cols
  const MAX_LEN = 22
  // Every column travels the same distance, starting just above the panel.
  let css = `@keyframes ${id}f { from { transform: translateY(0) } to { transform: translateY(${h + MAX_LEN * size}px) } }`
  let out = `<g opacity="${opacity}" class="g">`
  for (let c = 0; c < cols; c++) {
    const len = 6 + Math.floor(rnd() * (MAX_LEN - 6))
    const x = x0 + c * step + step / 2
    const dur = (minDur + rnd() * (maxDur - minDur)).toFixed(2)
    const delay = (-rnd() * Number(dur)).toFixed(2)
    css += `\n  .${id}c${c} { animation: ${id}f ${dur}s linear ${delay}s infinite; }`
    let glyphs = ''
    for (let k = 0; k < len; k++) {
      const isHead = k === len - 1
      const a = isHead ? 1 : (0.15 + 0.85 * (k / len)).toFixed(2)
      const cls = isHead ? 'head' : k > len - 4 ? 'hi' : 'mid'
      const gy = (k - MAX_LEN) * size
      // Mirror each glyph like the film's rain.
      glyphs += `<text transform="translate(${x.toFixed(1)} ${gy}) scale(-1 1)" text-anchor="middle" font-size="${size}" class="${cls}" fill-opacity="${a}">${esc(pick(KANA))}</text>`
    }
    out += `<g class="${id}c${c}">${glyphs}</g>`
  }
  out += '</g>'
  return { svg: out, css }
}

// A word that rattles through random glyphs, then locks letter by letter
// from left to right, holds, and loops.
function decode({ x, y, word, size, cycle, start = 0.5, frameMs = 70, cls = 'hi b glow', key }) {
  let css = ''
  let out = ''
  const adv = size * ADV
  const pct = (ms) => ((ms / (cycle * 1000)) * 100).toFixed(3)
  const end = cycle * 1000 - 500
  ;[...word].forEach((ch, i) => {
    if (ch === ' ') return
    const cx = (x + i * adv).toFixed(1)
    const frames = 5 + i * 2
    for (let f = 0; f < frames; f++) {
      const a = start * 1000 + f * frameMs
      const b = a + frameMs
      const name = `${key}${i}_${f}`
      css += `\n  @keyframes ${name} { 0%, ${pct(a)}% { opacity: 0 } ${pct(a + 1)}%, ${pct(b)}% { opacity: 1 } ${pct(b + 1)}%, 100% { opacity: 0 } }
  .${name} { animation: ${name} ${cycle}s steps(1) infinite; }`
      out += `<text x="${cx}" y="${y}" font-size="${size}" class="g mid ${name}" opacity="0">${esc(pick(SCRAMBLE))}</text>`
    }
    const lock = start * 1000 + frames * frameMs
    const name = `${key}${i}L`
    css += `\n  @keyframes ${name} { 0%, ${pct(lock)}% { opacity: 0 } ${pct(lock + 1)}%, ${pct(end)}% { opacity: 1 } ${pct(end + 1)}%, 100% { opacity: 0 } }
  .${name} { animation: ${name} ${cycle}s steps(1) infinite; }`
    out += `<text x="${cx}" y="${y}" font-size="${size}" class="${cls} ${name}" opacity="0">${esc(ch)}</text>`
  })
  return { svg: out, css }
}

// Typewriter: a clip rect that grows one glyph at a time (exact, since every
// glyph has a fixed x).
let typeId = 0
function typed({ x, y, s, size, cls, begin, cps = 28, cycle, cursor = false }) {
  const id = `t${typeId++}`
  const n = [...s].length
  const adv = size * ADV
  const typeSec = n / cps
  const total = cycle
  const values = []
  const keyTimes = []
  for (let i = 0; i <= n; i++) {
    values.push((i * adv).toFixed(1))
    keyTimes.push(((begin + (i / n) * typeSec) / total).toFixed(4))
  }
  // Hold, then clear just before the loop restarts.
  values.unshift('0'); keyTimes.unshift('0')
  values.push('0'); keyTimes.push(((total - 0.5) / total).toFixed(4))
  values.push('0'); keyTimes.push('1')
  let out = `<clipPath id="${id}"><rect x="${x - 1}" y="${y - size}" height="${size * 1.5}" width="0">
    <animate attributeName="width" dur="${total}s" repeatCount="indefinite" calcMode="discrete" values="${values.join(';')}" keyTimes="${keyTimes.join(';')}"/></rect></clipPath>
  <g clip-path="url(#${id})">${mono(x, y, s, size, cls)}</g>`
  if (cursor) {
    const cx = x + n * adv + 3
    out += `<rect x="${cx}" y="${y - size * 0.82}" width="${adv}" height="${size}" fill="${C.hi}" class="soft">
      <animate attributeName="opacity" dur="1s" repeatCount="indefinite" calcMode="discrete" values="1;0" keyTimes="0;0.5"/></rect>`
  }
  return out
}

// ---------------------------------------------------------------- hero -----

function hero() {
  const H = 330
  const CYCLE = 14
  const r = rain({ w: W, h: H, cols: 52, size: 17, opacity: 1 })
  const PX = 130, PY = 70, PW = W - 260, PH = 196
  const name = 'NISHIT JAIN'
  const NS = 54
  const nameX = W / 2 - textW(name, NS) / 2
  const d = decode({ x: nameX, y: PY + 108, word: name, size: NS, cycle: CYCLE, start: 1.6, key: 'n' })

  const wake = 'Wake up, visitor...'
  const sub = 'ai engineer  //  full-stack  //  builds whatever the problem needs'
  const SS = 13
  const subX = W / 2 - textW(sub, SS) / 2

  const chips = ['STATUS: BUILDING', 'NODE: INDIA', 'UPLINK: OPEN']
  const CS = 11
  const gap = 14
  const chipW = chips.map((c) => textW(c, CS) + 20)
  let cx = W / 2 - (chipW.reduce((a, b) => a + b, 0) + gap * (chips.length - 1)) / 2
  let chipSvg = ''
  chips.forEach((c, i) => {
    chipSvg += `<rect x="${cx}" y="${PY + PH + 18}" width="${chipW[i]}" height="22" rx="3" fill="${C.panel}" stroke="${C.dim}"/>`
    chipSvg += mono(cx + 10, PY + PH + 33, c, CS, i === 0 ? 'hi b' : 'mid')
    if (i === 0) chipSvg += `<circle cx="${cx - 7}" cy="${PY + PH + 29}" r="3" fill="${C.hi}" class="glow"><animate attributeName="opacity" dur="1.4s" repeatCount="indefinite" values="1;.2;1"/></circle>`
    cx += chipW[i] + gap
  })

  const body = `
<defs>
  <radialGradient id="vig" cx="50%" cy="48%" r="62%">
    <stop offset="45%" stop-color="${C.bg}" stop-opacity="0"/>
    <stop offset="100%" stop-color="${C.bg}" stop-opacity=".55"/>
  </radialGradient>
  <linearGradient id="edge" x1="0" x2="1">
    <stop offset="0" stop-color="${C.hi}" stop-opacity="0"/>
    <stop offset=".5" stop-color="${C.hi}" stop-opacity=".9"/>
    <stop offset="1" stop-color="${C.hi}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="heroClip"><rect width="${W}" height="${H}" rx="10"/></clipPath>
</defs>
<g clip-path="url(#heroClip)">
  ${r.svg}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6" fill="${C.bg}" fill-opacity=".9" stroke="${C.deep}"/>
  <rect x="${PX}" y="${PY}" width="${PW}" height="1.5" fill="url(#edge)"/>
  <rect x="${PX}" y="${PY + PH - 1.5}" width="${PW}" height="1.5" fill="url(#edge)"/>
  ${typed({ x: PX + 28, y: PY + 36, s: wake, size: 14, cls: 'mid', begin: 0.2, cps: 18, cycle: CYCLE })}
  ${d.svg}
  ${typed({ x: subX, y: PY + 152, s: sub, size: SS, cls: 'hi soft', begin: 3.4, cps: 40, cycle: CYCLE, cursor: true })}
  ${chipSvg}
  ${scanlines(W, H, 0.22)}
</g>
<rect width="${W}" height="${H}" rx="10" fill="none" stroke="${C.deep}"/>`
  return frame(W, H, body, r.css + d.css)
}

// ---------------------------------------------------- section headers -----

function header(index, title) {
  const H = 46
  const t = `${index}  ${title}`
  const S = 16
  const tw = textW(t, S)
  const body = `
${mono(18, 29, '>', S, 'dim b')}
${mono(38, 29, t, S, 'hi b glow')}
<rect x="${38 + tw + 18}" y="22" width="${W - (38 + tw + 18) - 110}" height="1" fill="${C.deep}"/>
${mono(W - 96, 29, '[ OK ]', 12, 'mid')}
<rect x="${W - 34}" y="18" width="10" height="14" fill="${C.hi}" class="soft"><animate attributeName="opacity" dur="1.1s" repeatCount="indefinite" calcMode="discrete" values="1;0" keyTimes="0;.5"/></rect>`
  return frame(W, H, body)
}

// ------------------------------------------------------------ modules -----

const MODULES = [
  ['LANG', ['Python', 'TypeScript', 'JavaScript', 'SQL', 'HTML / CSS']],
  ['AI / AGENTS', ['Claude', 'Claude Code', 'MCP', 'Gemini', 'LangChain', 'Ollama', 'Multi-agent pipelines', 'OpenCV', 'scikit-learn', 'pandas', 'NumPy']],
  ['FRONTEND', ['React', 'React Native', 'Expo', 'Next.js', 'Vite', 'Tailwind', 'shadcn/ui', 'Framer Motion', 'Three.js', 'TanStack Query', 'Zustand']],
  ['BACKEND', ['Node.js', 'Express', 'Flask', 'Deno', 'Zod', 'JWT', 'WebAuthn', 'SAP RFC']],
  ['DATA', ['PostgreSQL', 'MongoDB', 'Supabase', 'IndexedDB / Dexie']],
  ['SHIP', ['Azure', 'Vercel', 'GitHub Actions', 'PWA', 'Playwright', 'Vitest', 'Git']],
]

function modules() {
  const S = 12
  const LABEL_W = 130
  const X0 = 26
  const ROW_H = 30
  const CHIP_H = 22
  const GAP = 8
  const maxX = W - 26
  const CYCLE = 12
  let y = 64
  let body = mono(X0, 34, '$ matrix --load-modules --verbose', 13, 'mid')
  let css = ''
  let n = 0
  const rows = []
  for (const [label, items] of MODULES) {
    let x = X0 + LABEL_W
    const startY = y
    let line = ''
    for (const item of items) {
      const w = textW(item, S) + 22
      if (x + w > maxX) { x = X0 + LABEL_W; y += ROW_H }
      const delay = 0.35 + n * 0.09
      const k = `m${n}`
      css += `\n  .${k} { animation: lit ${CYCLE}s steps(1) ${delay.toFixed(2)}s infinite; }`
      line += `<g class="${k}" opacity=".18"><rect x="${x}" y="${y - 15}" width="${w}" height="${CHIP_H}" rx="3" fill="${C.panel}" stroke="${C.dim}"/>${mono(x + 11, y, item, S, 'hi')}</g>`
      x += w + GAP
      n++
    }
    rows.push(mono(X0, startY, label, 11, 'dim b') + line)
    y += ROW_H + 10
  }
  const loadedY = y + 4
  const total = n
  css += `\n  @keyframes lit { 0% { opacity: .18 } 1% , 92% { opacity: 1 } 93%, 100% { opacity: .18 } }`
  const doneDelay = 0.35 + total * 0.09 + 0.3
  css += `\n  .done { animation: lit ${CYCLE}s steps(1) ${doneDelay.toFixed(2)}s infinite; }`
  body += rows.join('\n')
  body += `<g class="done" opacity="0">${mono(X0, loadedY, `[ ${total} modules loaded · 0 errors · neural link stable ]`, 12, 'hi soft')}</g>`
  const H = loadedY + 24
  const r = rain({ w: W, h: H, x0: W - 120, cols: 7, size: 12, opacity: 0.12 })
  return frame(W, H, r.svg + body + `<rect width="${W}" height="${H}" rx="10" fill="none" stroke="${C.deep}"/>`, r.css + css)
}

// --------------------------------------------------------------- cards -----

function wrap(s, maxChars) {
  const words = s.split(' ')
  const lines = ['']
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if ((cur + ' ' + w).trim().length > maxChars) lines.push(w)
    else lines[lines.length - 1] = (cur + ' ' + w).trim()
  }
  return lines
}

function card({ name, status, desc, stack, meta }) {
  const CW = 412
  const CH = 200
  const pad = 22
  const S = 12.5
  const maxChars = Math.floor((CW - pad * 2) / (S * ADV))
  const lines = wrap(desc, maxChars)
  // A card holds three lines; a longer description must be edited, never cut.
  if (lines.length > 3) throw new Error(`${name}: description needs ${lines.length} lines, cards hold 3`)
  if (textW(name, 22) > CW - pad * 2) throw new Error(`${name}: title wider than the card`)
  const r = rain({ w: CW, h: CH, x0: CW - 110, cols: 6, size: 12, opacity: 0.16, minDur: 6, maxDur: 12 })
  const statusCls = status === 'LIVE' ? C.hi : status === 'PRIVATE' ? C.dim : C.mid
  const sw = textW(status, 10) + 18
  const body = `
<defs><clipPath id="cc"><rect width="${CW}" height="${CH}" rx="10"/></clipPath></defs>
<g clip-path="url(#cc)">
  ${r.svg}
  <rect width="${CW}" height="30" fill="${C.panel}"/>
  <rect y="30" width="${CW}" height="1" fill="${C.deep}"/>
  <circle cx="18" cy="15" r="4" fill="${C.deep}"/><circle cx="32" cy="15" r="4" fill="${C.deep}"/><circle cx="46" cy="15" r="4" fill="${C.deep}"/>
  ${mono(62, 19, `~/${name}`, 11, 'dim')}
  <rect x="${CW - sw - 12}" y="7" width="${sw}" height="16" rx="3" fill="none" stroke="${statusCls}"/>
  ${mono(CW - sw - 3, 19, status, 10, 'b', ` style="fill:${statusCls}"`)}
  ${status === 'LIVE' ? `<circle cx="${CW - sw - 21}" cy="15" r="3" fill="${C.hi}" class="glow"><animate attributeName="opacity" dur="1.4s" repeatCount="indefinite" values="1;.2;1"/></circle>` : ''}
  ${mono(pad, 68, name, 22, 'hi b glow')}
  ${lines.map((l, i) => mono(pad, 98 + i * 19, l, S, 'mid')).join('\n  ')}
  <rect x="${pad}" y="${CH - 44}" width="${CW - pad * 2}" height="1" fill="${C.deep}"/>
  ${mono(pad, CH - 20, stack, 11, 'dim b')}
  ${meta ? mono(CW - pad - textW(meta, 11), CH - 20, meta, 11, 'hi') : ''}
</g>
<rect x=".5" y=".5" width="${CW - 1}" height="${CH - 1}" rx="10" fill="none" stroke="${C.deep}"/>`
  return frame(CW, CH, body, r.css)
}

const CARDS = [
  {
    name: 'mezvo-scan', status: 'LIVE', meta: 'open app ->',
    desc: 'Offline-first barcode PWA a bag brand runs its stalls on. Sells with no signal, syncs when back, prints tags over Bluetooth.',
    stack: 'React · TypeScript · PWA · Supabase',
  },
  {
    name: 'spacegrowmedia', status: 'LIVE', meta: 'visit ->',
    desc: 'A hyper-immersive 3D agency site for SpaceGrow Media. Boot it on desktop for full visual fidelity.',
    stack: 'HTML · CSS · Vite · 3D',
  },
  {
    name: 'ai-lead-qualifier', status: 'PUBLIC', meta: 'source ->',
    desc: 'Multi-agent Gemini pipeline on the command line: finds leads, audits their websites, writes the cold email and sends it through Gmail.',
    stack: 'Python · Gemini · Agents · SMTP',
  },
  {
    name: 'readyai', status: 'PUBLIC', meta: 'source ->',
    desc: 'AI interview practice app with a Duolingo-style learning path and live feedback on every answer.',
    stack: 'React Native · Expo · TypeScript',
  },
  {
    name: 'knowledge-bounty', status: 'PUBLIC', meta: 'source ->',
    desc: 'Real-time gamified task marketplace with race-condition-proof MongoDB claims and an XP leaderboard.',
    stack: 'MongoDB · Express · React · Node',
  },
  {
    name: 'velmessa', status: 'PUBLIC', meta: 'source ->',
    desc: 'Animated SaaS landing page with a nine-blob organic motion system and glassmorphism.',
    stack: 'React · Framer Motion',
  },
]

// ------------------------------------------------------------- status -----

function status() {
  const rows = [
    ['WORKING ON', 'AI agents that do real work, not demos'],
    ['LEARNING', 'Local models with Ollama · LangGraph · vector DBs · on-device ML'],
    ['BREAKING', 'My own products, before users can'],
    ['2026 GOAL', '3 products that bring a sharper point of view to everyday tasks'],
    ['ASK ME', 'Space · Astrophysics · Conspiracy theories · Philosophy'],
  ]
  const S = 13
  const X0 = 26
  const KEY_W = 130
  let y = 70
  let body = mono(X0, 36, '$ cat /proc/nishit/status', 13, 'mid')
  for (const [k, v] of rows) {
    body += `<rect x="${X0}" y="${y - 15}" width="3" height="20" fill="${C.hi}" class="soft"/>`
    body += mono(X0 + 14, y, k, 11, 'dim b')
    body += mono(X0 + KEY_W, y, v, S, 'hi soft')
    y += 34
  }
  const H = y - 4
  const r = rain({ w: W, h: H, x0: W - 140, cols: 8, size: 13, opacity: 0.2 })
  return frame(W, H, r.svg + body + `<rect width="${W}" height="${H}" rx="10" fill="none" stroke="${C.deep}"/>`, r.css)
}

// ------------------------------------------------------------- footer -----

function pillButton(color, label, hint) {
  const PW = 300, PH = 64
  const body = `
<rect x="1" y="1" width="${PW - 2}" height="${PH - 2}" rx="32" fill="${C.bg}" stroke="${color}" stroke-width="1.5"/>
<rect x="22" y="22" width="38" height="20" rx="10" fill="${color}" style="filter: drop-shadow(0 0 6px ${color})">
  <animate attributeName="opacity" dur="2.4s" repeatCount="indefinite" values="1;.55;1"/></rect>
${mono(78, 30, label, 14, 'b', ` style="fill:${color}"`)}
${mono(78, 48, hint, 11, 'dim')}`
  if (textW(hint, 11) > PW - 78 - 20) throw new Error(`pill hint too long: ${hint}`)
  return frame(PW, PH, body).replace(`<rect width="${PW}" height="${PH}" rx="10" fill="${C.bg}"/>`, '')
}

function footer() {
  const H = 150
  const CYCLE = 12
  const r = rain({ w: W, h: H, cols: 56, size: 14, opacity: 0.8, minDur: 6, maxDur: 13 })
  const l1 = 'The Matrix has you.'
  const l2 = 'Follow the white rabbit.'
  const S1 = 22, S2 = 14
  const body = `
<defs>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.bg}" stop-opacity=".2"/>
    <stop offset=".55" stop-color="${C.bg}" stop-opacity=".85"/>
    <stop offset="1" stop-color="${C.bg}" stop-opacity="1"/>
  </linearGradient>
  <clipPath id="fc"><rect width="${W}" height="${H}" rx="10"/></clipPath>
</defs>
<g clip-path="url(#fc)">
  ${r.svg}
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  ${typed({ x: W / 2 - textW(l1, S1) / 2, y: 70, s: l1, size: S1, cls: 'hi b glow', begin: 0.4, cps: 14, cycle: CYCLE })}
  ${typed({ x: W / 2 - textW(l2, S2) / 2, y: 104, s: l2, size: S2, cls: 'mid', begin: 2.4, cps: 16, cycle: CYCLE, cursor: true })}
  ${scanlines(W, H, 0.2)}
</g>
<rect width="${W}" height="${H}" rx="10" fill="none" stroke="${C.deep}"/>`
  return frame(W, H, body, r.css)
}

// --------------------------------------------------------------- write -----

const out = (p, s) => { fs.writeFileSync(p, s); console.log('wrote', p, (s.length / 1024).toFixed(1) + 'KB') }
fs.mkdirSync('.github/matrix/cards', { recursive: true })
out('.github/matrix/hero.svg', hero())
out('.github/matrix/h-about.svg', header('01', 'WHOAMI'))
out('.github/matrix/h-modules.svg', header('02', 'LOADED MODULES'))
out('.github/matrix/h-projects.svg', header('03', 'PROGRAMS RUNNING'))
out('.github/matrix/h-bootlog.svg', header('04', 'SYSTEM LOG'))
out('.github/matrix/h-status.svg', header('05', 'CURRENT STATE'))
out('.github/matrix/modules.svg', modules())
out('.github/matrix/status.svg', status())
out('.github/matrix/footer.svg', footer())
out('.github/matrix/pill-red.svg', pillButton(C.red, 'RED PILL', 'go deeper: every repository'))
out('.github/matrix/pill-blue.svg', pillButton(C.blue, 'BLUE PILL', 'stay on the surface: live work'))
for (const c of CARDS) out(`.github/matrix/cards/${c.name}.svg`, card(c))
