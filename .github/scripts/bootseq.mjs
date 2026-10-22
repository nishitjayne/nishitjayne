// Gathers "NISHIT BIOS" — the boot log lines built from real GitHub
// activity (all repos the token can see, private included). Runs headless
// under Node in Actions; no npm dependencies.
//
// Required env:
//   GH_LOGIN       github login the stats belong to
//   BOOT_TOKEN     classic PAT, scope: repo (read)
// Optional:
//   OUT            output path (default dist/boot.json)

const login = process.env.GH_LOGIN
const token = process.env.BOOT_TOKEN
const out = process.env.OUT || 'dist/boot.json'

if (!login) throw new Error('GH_LOGIN is not set')
if (!token) throw new Error('BOOT_TOKEN is not set')

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error('GraphQL: ' + JSON.stringify(json.errors))
  return json.data
}

async function rest(path) {
  const res = await fetch('https://api.github.com' + path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) throw new Error('REST ' + path + ' -> ' + res.status)
  return res.json()
}

// --- 1. Commits per repo (this year's window), incl. private ------------

const repoData = await gql(`
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        commitContributionsByRepository(maxRepositories: 30) {
          repository { nameWithOwner name isPrivate }
          contributions { totalCount }
        }
      }
    }
  }
`, { login })

const repos = repoData.user.contributionsCollection.commitContributionsByRepository
  .map((r) => ({
    name: r.repository.name,
    owner: r.repository.nameWithOwner.split('/')[0],
    isPrivate: r.repository.isPrivate,
    isMine: r.repository.nameWithOwner.split('/')[0].toLowerCase() === login.toLowerCase(),
    commits: r.contributions.totalCount,
  }))
  .sort((a, b) => b.commits - a.commits)
  .slice(0, 11)

const totalCommits = repos.reduce((a, r) => a + r.commits, 0)

// --- 2. Language bytes across owned + collaborator repos -----------------

const langData = await gql(`
  query($login: String!) {
    user(login: $login) {
      repositories(first: 40, ownerAffiliations: [OWNER, COLLABORATOR], orderBy: { field: PUSHED_AT, direction: DESC }) {
        nodes {
          languages(first: 6, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name } }
          }
        }
      }
    }
  }
`, { login })

const langBytes = {}
for (const r of langData.user.repositories.nodes) {
  for (const e of r.languages.edges) {
    langBytes[e.node.name] = (langBytes[e.node.name] || 0) + e.size
  }
}
const langTotal = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1
const topLangs = Object.entries(langBytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([name, bytes]) => ({ name: abbrevLang(name), pct: Math.round((bytes / langTotal) * 100) }))

function abbrevLang(name) {
  const short = { TypeScript: 'TS', JavaScript: 'JS', Python: 'PY', HTML: 'HTML', CSS: 'CSS', PLpgSQL: 'SQL' }
  return short[name] || name.slice(0, 4).toUpperCase()
}

// --- 3. Commit hours, to find the peak clock and the dead arc -------------

const hourCounts = new Array(24).fill(0)
let sampled = 0
const IST_OFFSET_MIN = 5 * 60 + 30

for (const r of repos) {
  const path = r.isMine
    ? `/repos/${login}/${r.name}/commits?author=${login}&per_page=100`
    : `/repos/${r.owner}/${r.name}/commits?author=${login}&per_page=100`
  try {
    const commits = await rest(path)
    for (const c of commits) {
      const iso = c.commit?.author?.date
      if (!iso) continue
      const utcMs = Date.parse(iso)
      if (Number.isNaN(utcMs)) continue
      const istMs = utcMs + IST_OFFSET_MIN * 60 * 1000
      const hour = new Date(istMs).getUTCHours()
      hourCounts[hour]++
      sampled++
    }
  } catch {
    // repo may be gone or token lacks access; skip it, the display degrades gracefully
  }
}

let peakHour = 0
if (sampled > 0) {
  peakHour = hourCounts.indexOf(Math.max(...hourCounts))
}
const peakLabel = sampled > 0 ? String(peakHour).padStart(2, '0') + ':00 IST' : 'UNKNOWN'

// Dead arc: longest run of zero commits across 6am-11am inclusive (the
// stretch we already know is empty from manual inspection) -- verify it
// live rather than hardcoding the finding.
const morningHours = [6, 7, 8, 9, 10, 11]
const morningIsDead = sampled > 0 && morningHours.every((h) => hourCounts[h] === 0)
const sleepLabel = morningIsDead ? 'NOT FOUND' : 'INCONCLUSIVE'

// --- 4. Build the boot log lines ------------------------------------------

function bar(pct, width = 24) {
  const filled = Math.round((pct / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function pad(s, n) {
  return s.length >= n ? s.slice(0, n) : s + '.'.repeat(n - s.length)
}

const repoLines = repos.map((r) => {
  const label = r.isPrivate ? '████ ENCRYPTED VOLUME ████' : r.name
  return { text: `   ${pad(label, 30)} [ ${String(r.commits).padStart(3)}  OK ]` }
})

const langLines = topLangs.map((l) => ({
  text: `   ${pad(l.name, 4)} ${bar(l.pct, 24)}  ${String(l.pct).padStart(2)}%`,
}))

const lines = [
  { text: 'NISHIT BIOS v2.6  ·  (C) 2026 ' + login, cls: 'hdr' },
  { text: '═'.repeat(46), cls: 'rule' },
  { text: `CPU ......  ${login} @ 4.2 GHz  [ ${repos.length} cores ]` },
  { text: `MEMORY ...  ${totalCommits} commits ${'.'.repeat(Math.max(1, 20 - String(totalCommits).length))}` },
  { text: 'UPTIME ...  366 days ....................' },
  { text: ' ' },
  { text: 'Detecting repositories ...' },
  ...repoLines,
  { text: ' ' },
  { text: 'Language partition table:' },
  ...langLines,
  { text: ' ' },
  { text: `Peak clock .......  ${peakLabel}` },
  { text: `Sleep schedule ...  ${sleepLabel}` },
  { text: 'Boot device ......  IDEA ...............' },
  { text: ' ' },
  { text: `Starting ${login} ...`, cursor: true },
]

// --- 5. Hand the lines to matrix.mjs, which draws them inside the page ----

const fs = await import('node:fs')
const path = await import('node:path')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(lines, null, 1))
console.log('wrote ' + out + '  (' + repos.length + ' repos, ' + totalCommits + ' commits, ' + sampled + ' timestamps sampled)')
