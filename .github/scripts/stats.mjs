// Renders the stats cards in .github/stats/ from the GitHub API.
//
// Self-hosted on purpose: the popular third-party card services were returning
// 503 and 402 when this was written, which leaves a broken image on the profile.
// Generating into this repo means the SVGs are served by GitHub itself.
//
//   GITHUB_TOKEN=$(gh auth token) node .github/scripts/stats.mjs
//
// The workflow's built-in GITHUB_TOKEN reports public commits only. Set the
// STATS_TOKEN secret to a PAT with read:user to have private work counted too;
// the card states which of the two it is showing, so the number is never
// overstated.

import { writeFileSync, mkdirSync } from 'node:fs'

const USER = process.env.STATS_USER ?? 'nishitjayne'
const TOKEN = process.env.GITHUB_TOKEN
const OUT = '.github/stats'

if (!TOKEN) {
  console.error('Set GITHUB_TOKEN (locally: GITHUB_TOKEN=$(gh auth token)).')
  process.exit(2)
}

const api = async (path) => {
  const r = await fetch('https://api.github.com' + path, {
    headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' },
  })
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200))
  return r.json()
}

const graphql = async (query, variables) => {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300))
  return j.data
}

// ---------------------------------------------------------------- gather

// Whose token is this? A token belonging to the profile owner sees commits in
// private repos as ordinary contributions; anyone else's (the workflow's
// built-in one included) only ever sees public work. The card has to say which
// of the two it is reporting, so it never overstates the number.
const viewer = await graphql('query{viewer{login}}')
const ownToken = viewer.viewer.login.toLowerCase() === USER.toLowerCase()

const user = await api(`/users/${USER}`)
const repos = await api(`/users/${USER}/repos?per_page=100&type=owner&sort=pushed`)

const stars = repos.reduce((n, r) => n + r.stargazers_count, 0)

// Language totals by bytes, so the split reflects real code rather than repo count.
const langBytes = {}
for (const r of repos) {
  if (r.fork) continue
  try {
    const langs = await api(`/repos/${USER}/${r.name}/languages`)
    for (const [name, bytes] of Object.entries(langs)) {
      langBytes[name] = (langBytes[name] ?? 0) + bytes
    }
  } catch {
    /* a repo we cannot read is simply left out */
  }
}

// contributionsCollection covers one year at a time, so walk back to signup for
// a lifetime commit count.
const startYear = new Date(user.created_at).getUTCFullYear()
const thisYear = new Date().getUTCFullYear()

let commitsAllTime = 0
let privateCommits = 0
let prs = 0
let issues = 0
let reviews = 0

for (let y = startYear; y <= thisYear; y++) {
  const data = await graphql(
    `query($login:String!,$from:DateTime!,$to:DateTime!){
       user(login:$login){
         contributionsCollection(from:$from,to:$to){
           totalCommitContributions
           restrictedContributionsCount
           totalPullRequestContributions
           totalIssueContributions
           totalPullRequestReviewContributions
         }
       }
     }`,
    { login: USER, from: `${y}-01-01T00:00:00Z`, to: `${y}-12-31T23:59:59Z` },
  )
  const c = data.user.contributionsCollection
  commitsAllTime += c.totalCommitContributions + c.restrictedContributionsCount
  privateCommits += c.restrictedContributionsCount
  prs += c.totalPullRequestContributions
  issues += c.totalIssueContributions
  reviews += c.totalPullRequestReviewContributions
}

// Rolling 365 days for the activity chart and the streaks.
const to = new Date()
const from = new Date(to.getTime() - 364 * 864e5)
const cal = await graphql(
  `query($login:String!,$from:DateTime!,$to:DateTime!){
     user(login:$login){
       contributionsCollection(from:$from,to:$to){
         contributionCalendar{
           totalContributions
           weeks{ contributionDays{ date contributionCount } }
         }
       }
     }
   }`,
  { login: USER, from: from.toISOString(), to: to.toISOString() },
)

const calendar = cal.user.contributionsCollection.contributionCalendar
const days = calendar.weeks.flatMap((w) => w.contributionDays)

let currentStreak = 0
for (let i = days.length - 1; i >= 0; i--) {
  // Today counts only if it has activity; an empty today does not break a streak
  // that ran up to yesterday.
  if (days[i].contributionCount > 0) currentStreak++
  else if (i !== days.length - 1) break
}

let longestStreak = 0
let run = 0
for (const d of days) {
  run = d.contributionCount > 0 ? run + 1 : 0
  if (run > longestStreak) longestStreak = run
}

const weeks = calendar.weeks.map((w) =>
  w.contributionDays.reduce((n, d) => n + d.contributionCount, 0),
)

const seesPrivate = ownToken || privateCommits > 0

// ---------------------------------------------------------------- render

const THEMES = {
  dark: { bg: '#0d1117', card: '#161b22', line: '#30363d', text: '#c9d1d9', dim: '#8b949e', accent: '#A855F7', accent2: '#6D28D9' },
  light: { bg: '#ffffff', card: '#f6f8fa', line: '#d0d7de', text: '#1f2328', dim: '#59636e', accent: '#7C3AED', accent2: '#A855F7' },
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const n = (v) => v.toLocaleString('en-US')

const FONT =
  "font-family='ui-sans-serif,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif'"

function statsCard(t) {
  const W = 460
  const rows = [
    ['Total commits', n(commitsAllTime)],
    ['Public repositories', n(user.public_repos)],
    ['Stars earned', n(stars)],
    ['Pull requests', n(prs)],
    ['Issues opened', n(issues)],
    ['Contributions this year', n(calendar.totalContributions)],
  ]
  const top = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const total = top.reduce((s, [, b]) => s + b, 0) || 1
  const SHADES = ['#A855F7', '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6']

  const H = 108 + rows.length * 26 + 74

  let x = 22
  const bar = top
    .map(([, bytes], i) => {
      const w = Math.max(4, ((W - 44) * bytes) / total)
      const seg = `<rect x="${x.toFixed(1)}" y="${H - 56}" width="${w.toFixed(1)}" height="9" rx="4.5" fill="${SHADES[i]}"/>`
      x += w + 2
      return seg
    })
    .join('')

  const legend = top
    .map(([name, bytes], i) => {
      const pct = ((bytes / total) * 100).toFixed(1)
      const col = i % 3
      const row = Math.floor(i / 3)
      const lx = 22 + col * 148
      const ly = H - 30 + row * 17
      return `<circle cx="${lx + 4}" cy="${ly - 4}" r="4" fill="${SHADES[i]}"/><text x="${lx + 14}" y="${ly}" ${FONT} font-size="11" fill="${t.dim}">${esc(name)} ${pct}%</text>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub statistics for ${esc(USER)}">
  <rect width="${W}" height="${H}" rx="10" fill="${t.card}" stroke="${t.line}"/>
  <text x="22" y="34" ${FONT} font-size="15" font-weight="600" fill="${t.accent}">${esc(user.name ?? USER)}</text>
  <text x="22" y="53" ${FONT} font-size="11.5" fill="${t.dim}">${seesPrivate ? 'Every commit, public and private' : 'Public commits'}, since ${startYear}</text>
  <line x1="22" y1="68" x2="${W - 22}" y2="68" stroke="${t.line}"/>
  ${rows
    .map(
      ([label, value], i) => `<text x="22" y="${94 + i * 26}" ${FONT} font-size="12.5" fill="${t.text}">${esc(label)}</text>
  <text x="${W - 22}" y="${94 + i * 26}" ${FONT} font-size="13" font-weight="600" text-anchor="end" fill="${t.accent}">${value}</text>`,
    )
    .join('\n  ')}
  <text x="22" y="${H - 66}" ${FONT} font-size="10.5" letter-spacing="0.08em" fill="${t.dim}">MOST USED LANGUAGES</text>
  ${bar}
  ${legend}
</svg>`
}

function activityCard(t) {
  const W = 940
  const H = 200
  const padL = 22
  const padR = 22
  const top = 74
  const bottom = 34
  const plotH = H - top - bottom
  const max = Math.max(...weeks, 1)
  const stepX = (W - padL - padR) / (weeks.length - 1 || 1)

  const pts = weeks.map((v, i) => [padL + i * stepX, top + plotH - (v / max) * plotH])
  // Catmull-Rom flavoured smoothing, so the line reads as a trend not a sawtooth.
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const cx = (x0 + x1) / 2
    d += ` C ${cx.toFixed(1)} ${y0.toFixed(1)}, ${cx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  const area = `${d} L ${pts[pts.length - 1][0].toFixed(1)} ${top + plotH} L ${padL} ${top + plotH} Z`

  const monthTicks = []
  calendar.weeks.forEach((w, i) => {
    const date = new Date(w.contributionDays[0].date)
    if (date.getUTCDate() <= 7 && i > 0 && i < weeks.length - 1) {
      monthTicks.push([
        padL + i * stepX,
        date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      ])
    }
  })

  const stat = (x, label, value) =>
    `<text x="${x}" y="34" ${FONT} font-size="19" font-weight="700" fill="${t.accent}">${value}</text>
  <text x="${x}" y="50" ${FONT} font-size="10.5" letter-spacing="0.06em" fill="${t.dim}">${label}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Commit activity over the last year">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${t.accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="10" fill="${t.card}" stroke="${t.line}"/>
  ${stat(padL, 'CONTRIBUTIONS, 52 WEEKS', n(calendar.totalContributions))}
  ${stat(padL + 250, 'CURRENT STREAK', currentStreak + (currentStreak === 1 ? ' day' : ' days'))}
  ${stat(padL + 450, 'LONGEST STREAK', longestStreak + (longestStreak === 1 ? ' day' : ' days'))}
  ${stat(padL + 650, 'BUSIEST WEEK', max + (max === 1 ? ' commit' : ' commits'))}
  <line x1="${padL}" y1="${top + plotH}" x2="${W - padR}" y2="${top + plotH}" stroke="${t.line}"/>
  <path d="${area}" fill="url(#fade)"/>
  <path d="${d}" fill="none" stroke="${t.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  ${monthTicks
    .map(
      ([x, label]) =>
        `<text x="${x.toFixed(1)}" y="${H - 14}" ${FONT} font-size="10" text-anchor="middle" fill="${t.dim}">${label}</text>`,
    )
    .join('\n  ')}
</svg>`
}

mkdirSync(OUT, { recursive: true })
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(`${OUT}/stats-${name}.svg`, statsCard(theme))
  writeFileSync(`${OUT}/activity-${name}.svg`, activityCard(theme))
}

if (!seesPrivate) {
  console.log(
    [
      'NOTE: private contributions are not visible to this token, so the card reports',
      '      public commits only. To count private work: add a PAT with read:user as',
      '      the STATS_TOKEN secret, and turn on Settings -> Profile -> "Include',
      '      private contributions on my profile".',
    ].join('\n'),
  )
}

console.log(
  `commits(all time)=${commitsAllTime} private=${privateCommits} repos=${user.public_repos} stars=${stars} ` +
    `prs=${prs} issues=${issues} reviews=${reviews}\n` +
    `year=${calendar.totalContributions} streak=${currentStreak} longest=${longestStreak} ` +
    `langs=${Object.keys(langBytes).length}`,
)
