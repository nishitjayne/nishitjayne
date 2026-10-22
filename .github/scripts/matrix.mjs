// Renders the whole profile as one Matrix terminal window: code rain,
// phosphor green on near-black, glyphs that decode into words. GitHub serves
// README images through camo with no JavaScript, so all motion is CSS
// keyframes or SMIL inside the SVG itself. Text is laid out glyph by glyph
// (explicit x lists) so nothing depends on the viewer's font width -- boxes
// always fit their labels and nothing is clipped mid-word.
//
// The window is sliced into images that sit flush in the README:
//   main.svg            title bar down to the projects heading (needs the
//                       live boot log, so the workflow renders it)
//   cards/<name>.svg    one half-width slice per project, each a link
//   footer-left/right   the window's bottom edge, one pill in each half
//
//   node .github/scripts/matrix.mjs        (after bootseq.mjs writes dist/boot.json)

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
const R = 10 // window corner radius

// Seeded so a re-run produces the same file and a clean diff.
let seed = 0x5eed
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const KANA = [...'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:=*+<>¦']
const SCRAMBLE = [...'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ01234567890#$%&*+<>?/']

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xs = (x, n, size) => Array.from({ length: n }, (_, i) => (x + i * size * ADV).toFixed(1)).join(' ')
const textW = (s, size) => [...s].length * size * ADV

// One line of monospace text whose every glyph sits at a known x. The page
// speaks in capitals; commands and paths (class "code") keep their case.
function mono(x, y, s, size, cls = '', extra = '') {
  if (!cls.includes('code')) s = s.toUpperCase()
  return `<text x="${xs(x, [...s].length, size)}" y="${y}" font-size="${size}" class="${cls}"${extra}>${esc(s)}</text>`
}

const blink = (dur = 1) => `<animate attributeName="opacity" dur="${dur}s" repeatCount="indefinite" calcMode="discrete" values="1;0" keyTimes="0;.5"/>`
const pulse = `<animate attributeName="opacity" dur="1.4s" repeatCount="indefinite" values="1;.2;1"/>`

// An SVG document. `viewX` lets two images show the left and right halves
// of one drawing.
function svg(w, h, body, style = '', viewX = 0) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewX} 0 ${w} ${h}" role="img">
<style>
  text { font-family: ${MONO}; fill: ${C.hi}; white-space: pre; }
  .g { font-family: ${GLYPH_FONT}; }
  .hi { fill: ${C.hi}; } .mid { fill: ${C.mid}; } .dim { fill: ${C.dim}; }
  .head { fill: ${C.head}; } .b { font-weight: 700; }
  .glow { filter: drop-shadow(0 0 3px rgba(0,255,65,.65)); }
  .soft { filter: drop-shadow(0 0 1.5px rgba(0,255,65,.45)); }
  ${style}
</style>
${body}
</svg>
`
}

function scanlines(w, h, opacity) {
  return `<g opacity="${opacity}">${Array.from({ length: Math.ceil(h / 3) }, (_, i) => `<rect y="${i * 3}" width="${w}" height="1" fill="#000"/>`).join('')}</g>`
}

// Falling columns of mirrored katakana. Each column is one <g> that slides
// from above its area to below it; the brightest glyph leads.
let rainId = 0
function rain({ w, h, x0 = 0, cols, size, opacity, minDur = 5, maxDur = 11 }) {
  const id = `r${rainId++}`
  const step = (w - x0) / cols
  const MAX_LEN = 22
  // Every column travels the same distance, starting just above the area.
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
      // Mirror each glyph like the film's rain.
      glyphs += `<text transform="translate(${x.toFixed(1)} ${(k - MAX_LEN) * size}) scale(-1 1)" text-anchor="middle" font-size="${size}" class="${cls}" fill-opacity="${a}">${esc(pick(KANA))}</text>`
    }
    out += `<g class="${id}c${c}">${glyphs}</g>`
  }
  return { svg: out + '</g>', css }
}

// A word that rattles through random glyphs, then locks letter by letter
// from left to right, holds, and loops.
function decode({ x, y, word, size, cycle, start }) {
  const FRAME_MS = 70
  let css = ''
  let out = ''
  const pct = (ms) => ((ms / (cycle * 1000)) * 100).toFixed(3)
  const end = cycle * 1000 - 500
  const show = (name, from, to) => `\n  @keyframes ${name} { 0%, ${pct(from)}% { opacity: 0 } ${pct(from + 1)}%, ${pct(to)}% { opacity: 1 } ${pct(to + 1)}%, 100% { opacity: 0 } }
  .${name} { animation: ${name} ${cycle}s steps(1) infinite; }`
  ;[...word].forEach((ch, i) => {
    if (ch === ' ') return
    const cx = (x + i * size * ADV).toFixed(1)
    const frames = 5 + i * 2
    for (let f = 0; f < frames; f++) {
      const a = start * 1000 + f * FRAME_MS
      css += show(`d${i}_${f}`, a, a + FRAME_MS)
      out += `<text x="${cx}" y="${y}" font-size="${size}" class="g mid d${i}_${f}" opacity="0">${esc(pick(SCRAMBLE))}</text>`
    }
    css += show(`d${i}L`, start * 1000 + frames * FRAME_MS, end)
    out += `<text x="${cx}" y="${y}" font-size="${size}" class="hi b glow d${i}L" opacity="0">${esc(ch)}</text>`
  })
  return { svg: out, css }
}

// Typewriter: a clip rect that grows one glyph at a time (exact, since every
// glyph has a fixed x).
let typeId = 0
function typed({ x, y, s, size, cls, begin, cps, cycle, cursor = false }) {
  const id = `t${typeId++}`
  const n = [...s].length
  const adv = size * ADV
  const values = ['0']
  const keyTimes = ['0']
  for (let i = 0; i <= n; i++) {
    values.push((i * adv).toFixed(1))
    keyTimes.push(((begin + (i / n) * (n / cps)) / cycle).toFixed(4))
  }
  // Hold, then clear just before the loop restarts.
  values.push('0', '0')
  keyTimes.push(((cycle - 0.5) / cycle).toFixed(4), '1')
  let out = `<clipPath id="${id}"><rect x="${x - 1}" y="${y - size}" height="${size * 1.5}" width="0">
    <animate attributeName="width" dur="${cycle}s" repeatCount="indefinite" calcMode="discrete" values="${values.join(';')}" keyTimes="${keyTimes.join(';')}"/></rect></clipPath>
  <g clip-path="url(#${id})">${mono(x, y, s, size, cls)}</g>`
  if (cursor) out += `<rect x="${x + n * adv + 3}" y="${y - size * 0.82}" width="${adv}" height="${size}" fill="${C.hi}" class="soft">${blink()}</rect>`
  return out
}

// ------------------------------------------------------- main sections -----
// Each returns { h, body, css }; main() stacks them inside the window.

function titleBar() {
  const t = ' NISHIT-OS v2.6 '
  const right = 'TTY1 · 9600 BAUD'
  const tx = W / 2 - textW(t, 12) / 2
  return {
    h: 34,
    body: `<rect width="${W}" height="34" fill="${C.panel}"/><rect y="33" width="${W}" height="1" fill="${C.deep}"/>
${mono(22, 22, '[■]', 12, 'dim b')}
${mono(tx, 22, t, 12, 'hi b glow')}
${mono(W - 22 - textW(right, 11), 22, right, 11, 'dim')}`,
  }
}

function hero() {
  const H = 300
  const CYCLE = 14
  const r = rain({ w: W, h: H, cols: 52, size: 17, opacity: 1 })
  const PX = 130, PY = 40, PW = W - 260, PH = 196
  const name = 'NISHIT JAIN'
  const NS = 54
  const d = decode({ x: W / 2 - textW(name, NS) / 2, y: PY + 108, word: name, size: NS, cycle: CYCLE, start: 0.9 })
  const sub = 'ai engineer  //  full-stack  //  builds whatever the problem needs'

  const chips = ['STATUS: BUILDING', 'NODE: INDIA', 'MODE: TINKER WITH EVERYTHING', 'TABS > SPACES']
  const CS = 11, GAP = 14, CY = PY + PH + 18
  const chipW = chips.map((c) => textW(c, CS) + 20)
  let cx = W / 2 - (chipW.reduce((a, b) => a + b, 0) + GAP * (chips.length - 1)) / 2
  let chipSvg = `<circle cx="${cx - 7}" cy="${CY + 11}" r="3" fill="${C.hi}" class="glow">${pulse}</circle>`
  chips.forEach((c, i) => {
    chipSvg += `<rect x="${cx}" y="${CY}" width="${chipW[i]}" height="22" rx="3" fill="${C.panel}" stroke="${C.dim}"/>`
    chipSvg += mono(cx + 10, CY + 15, c, CS, i === 0 ? 'hi b' : 'mid')
    cx += chipW[i] + GAP
  })

  return {
    h: H,
    css: r.css + d.css,
    body: `
<defs>
  <radialGradient id="vig" cx="50%" cy="45%" r="62%">
    <stop offset="45%" stop-color="${C.bg}" stop-opacity="0"/>
    <stop offset="100%" stop-color="${C.bg}" stop-opacity=".55"/>
  </radialGradient>
  <linearGradient id="edge" x1="0" x2="1">
    <stop offset="0" stop-color="${C.hi}" stop-opacity="0"/>
    <stop offset=".5" stop-color="${C.hi}" stop-opacity=".9"/>
    <stop offset="1" stop-color="${C.hi}" stop-opacity="0"/>
  </linearGradient>
</defs>
${r.svg}
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6" fill="${C.bg}" fill-opacity=".9" stroke="${C.deep}"/>
<rect x="${PX}" y="${PY}" width="${PW}" height="1.5" fill="url(#edge)"/>
<rect x="${PX}" y="${PY + PH - 1.5}" width="${PW}" height="1.5" fill="url(#edge)"/>
${typed({ x: PX + 28, y: PY + 36, s: 'Wake up, visitor...', size: 14, cls: 'mid', begin: 0.1, cps: 22, cycle: CYCLE })}
${d.svg}
${typed({ x: W / 2 - textW(sub, 13) / 2, y: PY + 152, s: sub, size: 13, cls: 'hi soft', begin: 2.6, cps: 40, cycle: CYCLE, cursor: true })}
${chipSvg}
`,
  }
}

// Each section reports its status the way a dev would.
function heading(index, title, tag, tagCls = 'mid') {
  const t = `${index}  ${title}`
  const S = 16
  const lineX = 38 + textW(t, S) + 18
  const tagX = W - 56 - textW(tag, 12)
  return {
    h: 56,
    body: `<rect y="0" width="${W}" height="1" fill="${C.deep}"/>
${mono(22, 36, '>', S, 'dim b')}
${mono(40, 36, t, S, 'hi b glow')}
<rect x="${lineX}" y="30" width="${tagX - 14 - lineX}" height="1" fill="${C.deep}"/>
${mono(tagX, 36, tag, 12, tagCls)}
<rect x="${W - 36}" y="25" width="10" height="14" fill="${C.hi}" class="soft">${blink(1.1)}</rect>`,
  }
}

function wrap(s, maxChars) {
  const lines = ['']
  for (const w of s.split(' ')) {
    const next = (lines[lines.length - 1] + ' ' + w).trim()
    if (next.length > maxChars) lines.push(w)
    else lines[lines.length - 1] = next
  }
  return lines
}

const WHOAMI = [
  'AI engineer who works the whole stack: models and agents at one end, the screen someone taps at the other.',
  'I build for real constraints: a stall with no signal, a back office that runs on SAP, a camera that has to recognise a face in real time.',
  "Happiest when a problem doesn't fit one box. An LLM pipeline this week, a barcode PWA the next.",
  'Off the keyboard: space, astrophysics, philosophy, and the odd conspiracy theory.',
  'Believes the two hardest problems are cache invalidation, naming things, and off-by-one errors.',
  'Rule: ship it, watch it get used, fix what breaks.',
]

function whoami() {
  const S = 13, X0 = 26, LH = 21
  const maxChars = Math.floor((W - X0 - 46 - 26) / (S * ADV))
  let y = 8
  let body = mono(X0, y + 14, 'nishit@zion:~$ ', 13, 'dim b code') + mono(X0 + textW('nishit@zion:~$ ', 13), y + 14, 'whoami --long', 13, 'hi b code')
  y += 40
  for (const item of WHOAMI) {
    wrap(item, maxChars).forEach((l, i) => {
      if (i === 0) body += mono(X0 + 8, y, '›', S, 'dim b')
      body += mono(X0 + 26, y, l, S, 'mid')
      y += LH
    })
    y += 6
  }
  return { h: y + 4, body }
}

const MODULES = [
  ['LANG', ['Python', 'TypeScript', 'JavaScript', 'SQL', 'HTML / CSS']],
  ['AI / AGENTS', ['Claude', 'Claude Code', 'MCP', 'Gemini', 'LangChain', 'Ollama', 'Multi-agent pipelines', 'OpenCV', 'scikit-learn', 'pandas', 'NumPy']],
  ['FRONTEND', ['React', 'React Native', 'Expo', 'Next.js', 'Vite', 'Tailwind', 'shadcn/ui', 'Framer Motion', 'Three.js', 'TanStack Query', 'Zustand']],
  ['BACKEND', ['Node.js', 'Express', 'Flask', 'Deno', 'Zod', 'JWT', 'WebAuthn', 'SAP RFC']],
  ['DATA', ['PostgreSQL', 'MongoDB', 'Supabase', 'IndexedDB / Dexie']],
  ['SHIP', ['Azure', 'Vercel', 'GitHub Actions', 'PWA', 'Playwright', 'Vitest', 'Git']],
]

function modules() {
  const S = 12, LABEL_W = 130, X0 = 26, ROW_H = 30, GAP = 8, CYCLE = 12
  let y = 22
  let body = mono(X0, y, '$ matrix --load-modules --verbose', 13, 'mid code')
  y += 32
  let css = ''
  let n = 0
  for (const [label, items] of MODULES) {
    body += mono(X0, y, label, 11, 'dim b')
    let x = X0 + LABEL_W
    for (const item of items) {
      const w = textW(item, S) + 22
      if (x + w > W - 26) { x = X0 + LABEL_W; y += ROW_H }
      css += `\n  .m${n} { animation: lit ${CYCLE}s steps(1) ${(0.35 + n * 0.09).toFixed(2)}s infinite; }`
      body += `<g class="m${n}" opacity=".18"><rect x="${x}" y="${y - 15}" width="${w}" height="22" rx="3" fill="${C.panel}" stroke="${C.dim}"/>${mono(x + 11, y, item, S, 'hi')}</g>`
      x += w + GAP
      n++
    }
    y += ROW_H + 10
  }
  css += `\n  @keyframes lit { 0% { opacity: .18 } 1%, 92% { opacity: 1 } 93%, 100% { opacity: .18 } }
  .done { animation: lit ${CYCLE}s steps(1) ${(0.65 + n * 0.09).toFixed(2)}s infinite; }`
  body += `<g class="done" opacity="0">${mono(X0, y + 4, `[ ${n} modules loaded · 0 errors · 3 warnings we don't talk about ]`, 12, 'hi soft')}</g>`
  return { h: y + 26, body, css }
}

// The live boot log, in two columns: the machine on the left, its habits
// on the right. Lines come from bootseq.mjs via dist/boot.json.
function bootLog() {
  // Run bootseq.mjs first (the workflow does).
  const lines = JSON.parse(fs.readFileSync('dist/boot.json', 'utf8'))
  const S = 12, LH = 19, X0 = 26, X1 = 452
  const split = lines.findIndex((l) => l.text.startsWith('Language partition'))
  const cols = [lines.slice(0, split), lines.slice(split)]
  const rows = Math.max(cols[0].length, cols[1].length)
  let body = ''
  cols.forEach((col, c) => {
    col.forEach((l, i) => {
      const y = 24 + i * LH
      const x = c ? X1 : X0
      const cls = l.cls === 'hdr' ? 'head b glow' : l.cls === 'rule' ? 'dim' : 'hi soft'
      // Rules span the column, not the page.
      const text = l.cls === 'rule' ? '═'.repeat(Math.floor((X1 - X0 - 30) / (S * ADV))) : l.text
      body += mono(x, y, text, S, cls)
      if (l.cursor) body += `<rect x="${x + textW(text, S) + 4}" y="${y - 11}" width="${S * ADV}" height="13" fill="${C.hi}" class="soft">${blink()}</rect>`
    })
  })
  body += `<rect x="${X1 - 22}" y="10" width="1" height="${rows * LH}" fill="${C.deep}"/>`
  return { h: 24 + rows * LH, body }
}

function status() {
  const rows = [
    ['WORKING ON', 'AI agents that do real work, not demos'],
    ['LEARNING', 'Local models with Ollama · LangGraph · vector DBs · on-device ML'],
    ['BREAKING', 'My own products, before users can'],
    ['2026 GOAL', '3 products that bring a sharper point of view to everyday tasks'],
    ['LAST COMMIT', '"fix"  (the 4th one today)'],
    ['PONDERING', 'Are we living in a simulation? (this page may be biased)'],
    ['ASK ME', 'Space · Astrophysics · Conspiracy theories · Philosophy'],
  ]
  const X0 = 26
  let y = 22
  let body = mono(X0, y, '$ cat /proc/nishit/status', 13, 'mid code')
  y += 36
  for (const [k, v] of rows) {
    body += `<rect x="${X0}" y="${y - 15}" width="3" height="20" fill="${C.hi}" class="soft"/>`
    body += mono(X0 + 14, y, k, 11, 'dim b') + mono(X0 + 130, y, v, 13, 'hi soft')
    y += 34
  }
  return { h: y - 4, body }
}

function main() {
  const parts = [
    titleBar(), hero(),
    heading('01', 'WHOAMI', '[ 200 OK ]'), whoami(),
    heading('02', 'LOADED MODULES', '[ NODE_MODULES: 2.4 GB ]'), modules(),
    heading('03', 'SYSTEM LOG', '[ tail -f ]', 'mid code'), bootLog(),
    heading('04', 'CURRENT STATE', "[ 418 I'M A TEAPOT ]"), status(),
    heading('05', 'PROGRAMS RUNNING', '[ WORKS ON MY MACHINE ]'),
  ]
  let y = 0
  let body = ''
  let css = ''
  parts.forEach((p, i) => {
    // Each section clips its own rain to itself.
    body += `<g transform="translate(0 ${y})"><clipPath id="s${i}"><rect width="${W}" height="${p.h}"/></clipPath><g clip-path="url(#s${i})">${p.body}</g></g>\n`
    css += p.css || ''
    y += p.h
  })
  const H = y
  // Rounded on top, open at the bottom: the project cards carry the window on.
  const shape = `M0 ${H} V${R} Q0 0 ${R} 0 H${W - R} Q${W} 0 ${W} ${R} V${H} Z`
  const edge = `M.5 ${H} V${R} Q.5 .5 ${R} .5 H${W - R} Q${W - 0.5} .5 ${W - 0.5} ${R} V${H}`
  return svg(W, H, `<defs><clipPath id="win"><path d="${shape}"/></clipPath></defs>
<path d="${shape}" fill="${C.bg}"/>
<g clip-path="url(#win)">${body}${scanlines(W, H, 0.3)}</g>
<path d="${edge}" fill="none" stroke="${C.deep}"/>`, css)
}

// --------------------------------------------------------------- cards -----

const CARDS = [
  {
    name: 'dispatch-challan-system', status: 'PRIVATE', meta: '403 forbidden',
    desc: 'Warehouse dispatch and challan system wired into SAP. Passkey logins, PostgreSQL, rate limiting and 49 test files.',
    stack: 'TypeScript · PostgreSQL · SAP',
  },
  {
    name: 'mezvo-scan', status: 'LIVE', meta: 'open app ->',
    desc: 'Offline-first barcode PWA a bag brand runs its stalls on. Sells with no signal, syncs when back, prints tags over Bluetooth.',
    stack: 'React · TypeScript · PWA · Supabase',
  },
  {
    name: 'ai-lead-qualifier', status: 'PUBLIC', meta: 'git clone ->',
    desc: 'Multi-agent Gemini pipeline: finds leads, audits their websites, writes the cold email and sends it through Gmail.',
    stack: 'Python · Gemini · Agents · SMTP',
  },
  {
    name: 'knowledge-bounty', status: 'PUBLIC', meta: 'git clone ->',
    desc: 'Real-time gamified task marketplace with race-condition-proof MongoDB claims and an XP leaderboard.',
    stack: 'MongoDB · Express · React · Node',
  },
]

// Half the window wide. The window's side edge runs down the outer side, so
// two cards side by side read as one stretch of the window.
function card({ name, status, desc, stack, meta }, side) {
  const IW = W / 2, IH = 206
  const CW = 392, CH = 190
  const bx = side === 'left' ? 18 : 10
  const pad = 20, S = 12.5
  const lines = wrap(desc, Math.floor((CW - pad * 2) / (S * ADV)))
  // A card holds three lines; a longer description must be edited, never cut.
  if (lines.length > 3) throw new Error(`${name}: description needs ${lines.length} lines, cards hold 3`)
  if (textW(name, 22) > CW - pad * 2) throw new Error(`${name}: title wider than the card`)
  if (textW(stack, 11) + 24 + textW(meta, 11) > CW - pad * 2) throw new Error(`${name}: stack runs into "${meta}"`)
  const r = rain({ w: CW, h: CH, x0: CW - 110, cols: 6, size: 12, opacity: 0.16, minDur: 6, maxDur: 12 })
  const sc = status === 'LIVE' ? C.hi : C.mid
  const sw = textW(status, 10) + 18
  const edgeX = side === 'left' ? 0.5 : IW - 0.5
  const body = `<rect width="${IW}" height="${IH}" fill="${C.bg}"/>
<rect x="${edgeX - 0.5}" width="1" height="${IH}" fill="${C.deep}"/>
<g transform="translate(${bx} 8)">
<defs><clipPath id="cc"><rect width="${CW}" height="${CH}" rx="8"/></clipPath></defs>
<g clip-path="url(#cc)">
  <rect width="${CW}" height="${CH}" fill="${C.bg}"/>
  ${r.svg}
  <rect width="${CW}" height="28" fill="${C.panel}"/>
  <rect y="28" width="${CW}" height="1" fill="${C.deep}"/>
  ${mono(12, 18, '[■]', 11, 'dim b')}
  ${mono(42, 18, `~/${name} (main)`, 11, 'dim code')}
  <rect x="${CW - sw - 10}" y="6" width="${sw}" height="16" rx="3" fill="none" stroke="${sc}"/>
  ${mono(CW - sw - 1, 18, status, 10, 'b', ` style="fill:${sc}"`)}
  ${status === 'LIVE' ? `<circle cx="${CW - sw - 19}" cy="14" r="3" fill="${C.hi}" class="glow">${pulse}</circle>` : ''}
  ${mono(pad, 62, name, 22, 'hi b glow')}
  ${lines.map((l, i) => mono(pad, 90 + i * 19, l, S, 'mid')).join('\n  ')}
  <rect x="${pad}" y="${CH - 40}" width="${CW - pad * 2}" height="1" fill="${C.deep}"/>
  ${mono(pad, CH - 17, stack, 11, 'dim b')}
  ${mono(CW - pad - textW(meta, 11), CH - 17, meta, 11, meta.startsWith('git') ? 'hi code' : 'hi')}
</g>
<rect x=".5" y=".5" width="${CW - 1}" height="${CH - 1}" rx="8" fill="none" stroke="${C.deep}"/>
</g>
${scanlines(IW, IH, 0.3)}`
  return svg(IW, IH, body, r.css)
}

// -------------------------------------------------------------- footer -----

// The window's bottom edge, drawn once at full width and shown as two
// halves so each half can be its own link. Text is static so the halves
// can never drift out of step across the seam.
function footer() {
  const H = 200
  const r = rain({ w: W, h: H, cols: 56, size: 14, opacity: 0.8, minDur: 6, maxDur: 13 })
  const l1 = 'The Matrix has you.', l2 = 'Choose.'
  const pill = (x, color, label) => `
<rect x="${x}" y="122" width="200" height="50" rx="25" fill="${C.bg}" stroke="${color}" stroke-width="1.5"/>
<rect x="${x + 22}" y="137" width="36" height="20" rx="10" fill="${color}" style="filter: drop-shadow(0 0 6px ${color})">
  <animate attributeName="opacity" dur="2.4s" repeatCount="indefinite" values="1;.55;1"/></rect>
${mono(x + 76, 152, label, 15, 'b', ` style="fill:${color}"`)}`
  const shape = `M0 0 H${W} V${H - R} Q${W} ${H} ${W - R} ${H} H${R} Q0 ${H} 0 ${H - R} Z`
  const edge = `M.5 0 V${H - R} Q.5 ${H - 0.5} ${R} ${H - 0.5} H${W - R} Q${W - 0.5} ${H - 0.5} ${W - 0.5} ${H - R} V0`
  const body = `<defs>
  <clipPath id="fc"><path d="${shape}"/></clipPath>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.bg}" stop-opacity=".25"/>
    <stop offset=".5" stop-color="${C.bg}" stop-opacity=".8"/>
    <stop offset="1" stop-color="${C.bg}" stop-opacity=".95"/>
  </linearGradient>
</defs>
<path d="${shape}" fill="${C.bg}"/>
<g clip-path="url(#fc)">
  <rect width="${W}" height="1" fill="${C.deep}"/>
  ${r.svg}
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  ${mono(W / 2 - textW(l1, 22) / 2, 58, l1, 22, 'hi b glow')}
  ${mono(W / 2 - textW(l2, 14) / 2, 90, l2, 14, 'mid')}
  <rect x="${W / 2 + textW(l2, 14) / 2 + 3}" y="79" width="8.4" height="14" fill="${C.hi}" class="soft">${blink()}</rect>
  ${pill(W / 2 - 220, C.red, 'RED PILL')}
  ${pill(W / 2 + 20, C.blue, 'BLUE PILL')}
  ${mono(22, H - 16, 'PRESS ANY KEY TO CONTINUE', 10, 'dim')}
  ${mono(W - 22 - textW('THERE IS NO SPOON · EXIT 0', 10), H - 16, 'THERE IS NO SPOON · EXIT 0', 10, 'dim')}
  ${scanlines(W, H, 0.3)}
</g>
<path d="${edge}" fill="none" stroke="${C.deep}"/>`
  return [svg(W / 2, H, body, r.css, 0), svg(W / 2, H, body, r.css, W / 2)]
}

// --------------------------------------------------------------- write -----

const out = (p, s) => { fs.writeFileSync(p, s); console.log('wrote', p, (s.length / 1024).toFixed(1) + 'KB') }
fs.mkdirSync('dist', { recursive: true })
fs.mkdirSync('.github/matrix/cards', { recursive: true })
out('dist/main.svg', main())
CARDS.forEach((c, i) => out(`.github/matrix/cards/${c.name}.svg`, card(c, i % 2 ? 'right' : 'left')))
const [left, right] = footer()
out('.github/matrix/footer-left.svg', left)
out('.github/matrix/footer-right.svg', right)
