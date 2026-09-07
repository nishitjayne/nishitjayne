// Renders the profile's top banner as a terminal boot sequence — same visual
// language as bootseq.mjs, but static content (a tagline, not live data), so
// it's generated once and committed directly rather than run by a workflow.
//
//   node .github/scripts/hero.mjs

const OUT = process.env.OUT || '.github/hero.svg'
const STEP_MS = 340
const HOLD_MS = 6000

const lines = [
  { text: '$ whoami', cls: 'prompt' },
  { text: 'nishit jain', cls: 'out' },
  { text: ' ' },
  { text: '$ cat role.txt', cls: 'prompt' },
  { text: 'Full-Stack Developer', cls: 'out' },
  { text: 'AI Builder', cls: 'out' },
  { text: 'Digital Growth Hacker', cls: 'out' },
  { text: ' ' },
  { text: '$ cat mission.txt', cls: 'prompt' },
  { text: 'Building products that blend intelligent', cls: 'out' },
  { text: 'systems with beautiful interfaces.', cls: 'out' },
  { text: ' ' },
  { text: '$ ', cls: 'prompt', cursor: true },
]

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const FONT = 15
const LINE_H = 22
const PAD_X = 24
const PAD_TOP = 30
const WIDTH = 640
const HEIGHT = PAD_TOP + lines.length * LINE_H + 20

const totalDuration = lines.length * STEP_MS + HOLD_MS
const loopSec = (totalDuration / 1000).toFixed(2)

let svgLines = ''
let keyframeRules = ''

lines.forEach((line, i) => {
  const delayPct = ((i * STEP_MS) / totalDuration) * 100
  const y = PAD_TOP + i * LINE_H
  const cls = line.cls === 'prompt' ? 'prompt' : 'out'
  const animName = `reveal${i}`
  keyframeRules += `
    @keyframes ${animName} {
      0%, ${delayPct.toFixed(2)}% { opacity: 0; }
      ${Math.min(100, delayPct + 0.3).toFixed(2)}%, 100% { opacity: 1; }
    }
    .l${i} { animation: ${animName} ${loopSec}s steps(1) infinite; }`

  svgLines += `
    <text x="${PAD_X}" y="${y}" class="${cls} l${i}">${esc(line.text)}</text>`

  if (line.cursor) {
    const cursorX = PAD_X + line.text.length * 9 + 4
    keyframeRules += `
    @keyframes blink${i} {
      0%, ${delayPct.toFixed(2)}% { opacity: 0; }
      ${Math.min(100, delayPct + 0.3).toFixed(2)}%, ${Math.min(100, delayPct + 8).toFixed(2)}% { opacity: 1; }
      ${Math.min(100, delayPct + 12).toFixed(2)}%, ${Math.min(100, delayPct + 16).toFixed(2)}% { opacity: 0; }
      ${Math.min(100, delayPct + 20).toFixed(2)}%, 100% { opacity: 1; }
    }
    .cur${i} { animation: blink${i} ${loopSec}s steps(1) infinite; }`
    svgLines += `
    <rect x="${cursorX}" y="${y - 12}" width="9" height="15" class="cursor cur${i}"/>`
  }
})

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <style>
    svg { background: #0a0e0a; }
    text {
      font-family: 'Consolas', 'SFMono-Regular', Menlo, monospace;
      font-size: ${FONT}px;
      fill: #4ade80;
      white-space: pre;
    }
    .prompt { fill: #86efac; font-weight: bold; }
    .out { fill: #4ade80; }
    .cursor { fill: #4ade80; }
    text, rect.cursor { filter: drop-shadow(0 0 2px rgba(74,222,128,0.55)); }
    ${keyframeRules}
  </style>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#0a0e0a"/>
  <g opacity="0.05">
    ${Array.from({ length: Math.ceil(HEIGHT / 3) }, (_, i) => `<rect x="0" y="${i * 3}" width="${WIDTH}" height="1" fill="#000"/>`).join('')}
  </g>
  ${svgLines}
</svg>`

const fs = await import('node:fs')
fs.writeFileSync(OUT, svg)
console.log('wrote ' + OUT)
