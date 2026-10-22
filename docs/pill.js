// Where each pill leads. A README can't run code, so the pills link here and
// this page picks the destination. Each visitor walks a shuffled deck: no
// link repeats until they have seen them all.

const PILLS = {
  red: [
    // space
    'https://www.livescience.com/space/black-holes/is-our-universe-trapped-inside-a-black-hole-this-james-webb-space-telescope-discovery-might-blow-your-mind',
    'https://www.youtube.com/watch?v=9P6rdqiybaw',
    'https://en.wikipedia.org/wiki/Dark_forest_hypothesis',
    // philosophy
    'https://www.simulation-argument.com/',
    'https://en.wikipedia.org/wiki/Boltzmann_brain',
    'https://www.youtube.com/watch?v=h6fcK_fRYaI',
    // the conspiracies that turned out real, or nearly
    'https://en.wikipedia.org/wiki/Project_A119',
    'https://en.wikipedia.org/wiki/%CA%BBOumuamua',
    'https://en.wikipedia.org/wiki/Wow!_signal',
    // ai
    'https://ai-2027.com/',
    'https://www.anthropic.com/research/alignment-faking',
    'https://en.wikipedia.org/wiki/Roko%27s_basilisk',
  ],
  blue: [
    // space
    'https://hasthelargehadroncolliderdestroyedtheworldyet.com/',
    'https://en.wikipedia.org/wiki/Cosmic_latte',
    'https://en.wikipedia.org/wiki/Sagittarius_B2',
    // philosophy
    'https://en.wikipedia.org/wiki/The_Myth_of_Sisyphus',
    'https://en.wikipedia.org/wiki/Zhuangzi_(book)#The_butterfly_dream',
    'https://theuselessweb.com/',
    // the conspiracies nobody has to worry about
    'https://birdsarentreal.com/',
    'https://en.wikipedia.org/wiki/Bielefeld_conspiracy',
    'https://en.wikipedia.org/wiki/Phantom_time_hypothesis',
    // ai
    'https://en.wikipedia.org/wiki/ELIZA',
    'https://en.wikipedia.org/wiki/Office_Assistant',
    'https://en.wikipedia.org/wiki/Moravec%27s_paradox',
  ],
}

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function next(pill) {
  const links = PILLS[pill]
  const key = 'deck-' + pill
  let deck = null
  let last = -1
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null')
    if (saved?.n === links.length) ({ deck, last } = saved)
  } catch {}
  if (!deck || deck.length === 0) {
    deck = shuffled(links.length)
    // Never the same link twice in a row, even across a reshuffle.
    if (deck[deck.length - 1] === last && deck.length > 1) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]]
  }
  const i = deck.pop()
  try { localStorage.setItem(key, JSON.stringify({ deck, last: i, n: links.length })) } catch {}
  return links[i]
}

const pill = document.documentElement.dataset.pill
const target = next(pill)
setTimeout(() => location.replace(target), 900)
