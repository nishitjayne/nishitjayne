// Renders small static terminal-look SVGs for content that GitHub's README
// markdown preview won't colorize on its own (ansi code fences render as
// literal escape-code text there, not actual color -- confirmed by loading
// the real rendered page). Same black/green look as hero.svg and
// bootseq.svg, just without the reveal animation -- these are supporting
// blocks, not the page's hero elements.
//
//   node .github/scripts/matrixblocks.mjs

import fs from 'node:fs'

const CHAR_W = 8.5
const FONT = 14
const LINE_H = 21
const PAD_X = 18
const PAD_Y = 16

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function render(lines) {
  const maxLen = Math.max(...lines.map((l) => l.text.length))
  const width = Math.ceil(PAD_X * 2 + maxLen * CHAR_W)
  const height = PAD_Y * 2 + lines.length * LINE_H - (LINE_H - FONT)

  const body = lines
    .map((l, i) => {
      const cls = l.cls || 'out'
      const y = PAD_Y + FONT + i * LINE_H
      return `<text x="${PAD_X}" y="${y}" class="${cls}">${esc(l.text)}</text>`
    })
    .join('\n    ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    svg { background: #0a0e0a; }
    text {
      font-family: 'Consolas', 'SFMono-Regular', Menlo, monospace;
      font-size: ${FONT}px;
      fill: #4ade80;
      white-space: pre;
    }
    .prompt { fill: #86efac; font-weight: bold; }
    .dim { fill: #2f7a4d; }
    text { filter: drop-shadow(0 0 1.5px rgba(74,222,128,0.45)); }
  </style>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#0a0e0a"/>
  ${body}
</svg>`
}

function repoBlock(cmd, entries) {
  const nameWidth = Math.max(20, ...entries.map((e) => e.name.length + 2))
  const lines = [{ text: '$ ' + cmd, cls: 'prompt' }, { text: ' ' }]
  for (const e of entries) {
    const perm = e.private ? '-rwx------' : 'drwxr-xr-x'
    const tag = e.private ? '[encrypted]' : e.stack
    const name = e.name.padEnd(nameWidth, ' ')
    lines.push({ text: `  ${perm}  ${name}${tag}` })
  }
  return render(lines)
}

fs.mkdirSync('.github/blocks', { recursive: true })

fs.writeFileSync(
  '.github/blocks/repo-products.svg',
  repoBlock('ls -la ~/products', [
    { name: 'spacegrowmedia', stack: 'HTML · CSS · Vite' },
    { name: 'velmessa', stack: 'React · Framer Motion' },
    { name: 'mezvo-scan', private: true },
    { name: 'canadian-realty', private: true },
  ])
)

fs.writeFileSync(
  '.github/blocks/repo-ai-agents.svg',
  repoBlock('ls -la ~/ai-agents', [
    { name: 'ai-lead-qualifier', stack: 'Python · Gemini · SMTP' },
    { name: 'readyai', stack: 'React Native · Expo · TS' },
  ])
)

fs.writeFileSync(
  '.github/blocks/repo-systems.svg',
  repoBlock('ls -la ~/systems', [
    { name: 'knowledge-bounty', stack: 'MERN' },
    { name: 'lendenclub-identitymicro-service', stack: 'Node.js · JWT' },
  ])
)

fs.writeFileSync(
  '.github/blocks/repo-experiments.svg',
  repoBlock('ls -la ~/experiments', [
    { name: 'attendance-system', stack: 'Python · OpenCV · Flask' },
    { name: 'miniproject', stack: 'HTML · JS' },
    { name: 'nishitjayne', stack: 'Markdown · Actions' },
  ])
)

fs.writeFileSync(
  '.github/blocks/cooking.svg',
  render([
    { text: 'Working on     ->  AI agents' },
    { text: 'Learning       ->  Local models with Ollama · LangGraph · vector DBs · on-device ML (Core ML)' },
    { text: 'Breaking       ->  My own products before users can' },
    { text: '2026 goal      ->  Build 3 products that bring a unique, efficient point of view to everyday tasks' },
    { text: 'Ask me about   ->  Space · Astrophysics · Conspiracy Theories · Philosophy' },
  ])
)

fs.writeFileSync(
  '.github/blocks/closing.svg',
  render([
    { text: '$ echo "Build fast. Ship real. Iterate always."', cls: 'prompt' },
    { text: 'Build fast. Ship real. Iterate always.' },
  ])
)

console.log('wrote 6 blocks to .github/blocks/')
