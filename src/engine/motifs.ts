// Hand-drawn shapes for things icons cannot show. 100x100 box, absolute coordinates.
import { circ, f, smoothClosed, smoothOpen, type Pt } from './path'

const wave = (y: number): string => {
  let d = `M6 ${y}`
  for (let i = 0; i < 4; i++) {
    const x = 6 + i * 22
    d += `Q${x + 11} ${y + (i % 2 ? 12 : -12)} ${x + 22} ${y}`
  }
  return d
}
const poly = (fn: (t: number) => Pt, a: number, b: number, n: number): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) pts.push(fn(a + ((b - a) * i) / n))
  return pts
}
const arrowHead = (x: number, y: number, ang: number, s = 9): string =>
  `M${f(x - s * Math.cos(ang - 0.55))} ${f(y - s * Math.sin(ang - 0.55))}L${f(x)} ${f(y)}L${f(x - s * Math.cos(ang + 0.55))} ${f(y - s * Math.sin(ang + 0.55))}`

export const MOTIFS: Record<string, () => string[]> = {
  dots: () =>
    (
      [
        [24, 30],
        [52, 18],
        [76, 36],
        [36, 58],
        [64, 62],
        [22, 80],
        [80, 82],
      ] as Pt[]
    ).map(([x, y], i) => circ(x, y, 5 + (i % 3))),
  chain: () => {
    const ds: string[] = []
    for (let i = 0; i < 6; i++) {
      const x = 12 + i * 15.2,
        y = 50 + (i % 2 ? -9 : 9)
      ds.push(circ(x, y, 6))
      if (i < 5) ds.push(`M${f(x + 6)} ${f(y)}L${f(x + 9.2)} ${f(50 + ((i + 1) % 2 ? -9 : 9))}`)
    }
    return ds
  },
  stack: () => [0, 1, 2, 3].map((i) => `M${14 + i * 3} ${38 + i * 15}Q50 ${12 + i * 15} ${86 - i * 3} ${38 + i * 15}`),
  waves: () => [30, 50, 70].map(wave),
  rings: () => [44, 29, 14].map((r) => circ(50, 50, r)),
  zigzag: () => ['M8 62L26 28L44 66L62 26L80 64L94 36'],
  spiral: () => [smoothOpen(poly((t) => [50 + (4 + t * 4.6) * Math.cos(t), 50 + (4 + t * 4.6) * Math.sin(t)], 0, 9.4, 28))],
  helix: () => {
    const X = (y: number, ph: number) => 50 + 20 * Math.sin((y / 84) * Math.PI * 3 + ph)
    const ds = [smoothOpen(poly((y) => [X(y, 0), y], 8, 92, 24)), smoothOpen(poly((y) => [X(y, Math.PI), y], 8, 92, 24))]
    for (let y = 16; y < 90; y += 12) ds.push(`M${f(X(y, 0))} ${y}L${f(X(y, Math.PI))} ${y}`)
    return ds
  },
  bean: () => ['M8 54C6 36 26 26 52 26C80 26 96 38 92 56C88 74 62 80 38 78C20 76 9 66 8 54Z', 'M22 56L32 42L42 64L52 40L62 62L72 44L80 56'],
  bars: () =>
    (
      [
        [14, 60],
        [40, 38],
        [66, 16],
      ] as Pt[]
    ).map(([x, top]) => `M${x} 88L${x} ${top}L${x + 20} ${top}L${x + 20} 88`),
  rays: () => {
    const ds: string[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.2832
      ds.push(`M${f(50 + 20 * Math.cos(a))} ${f(50 + 20 * Math.sin(a))}L${f(50 + 42 * Math.cos(a))} ${f(50 + 42 * Math.sin(a))}`)
    }
    return ds
  },
  cycle: () => {
    const ds: string[] = []
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * 6.2832 + 0.35,
        a1 = a0 + 1.55
      const pts = poly((a) => [50 + 36 * Math.cos(a), 50 + 36 * Math.sin(a)], a0, a1, 6)
      const e = pts[pts.length - 1],
        q = pts[pts.length - 2]
      ds.push(smoothOpen(pts), arrowHead(e[0], e[1], Math.atan2(e[1] - q[1], e[0] - q[0])))
    }
    return ds
  },
  blob: () => [
    smoothClosed(
      poly((t) => [50 + 42 * Math.cos(t) * (1 + 0.08 * Math.sin(t * 3)), 50 + 34 * Math.sin(t) * (1 + 0.08 * Math.cos(t * 2))], 0, 6.2832 * 0.92, 11),
      'blobm',
      2,
    ),
  ],
  grid: () => {
    const ds: string[] = []
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const x = 14 + c * 28,
          y = 14 + r * 28
        ds.push(`M${x} ${y}L${x + 20} ${y}L${x + 20} ${y + 20}L${x} ${y + 20}Z`)
      }
    return ds
  },
  pie: () => [circ(50, 50, 40), 'M50 50L50 10', 'M50 50L84 70'],
}
export const MOTIF_NAMES = Object.keys(MOTIFS)

/** Concepts with no icon of their own -> the closest picture (a motif name or a Lucide icon name). */
export const ALIAS: Record<string, string> = {
  nucleus: 'rings',
  ribosome: 'dots',
  ribosomes: 'dots',
  protein: 'chain',
  proteins: 'chain',
  dna: 'helix',
  golgi: 'stack',
  'golgi-apparatus': 'stack',
  mitochondria: 'bean',
  mitochondrion: 'bean',
  cell: 'blob',
  membrane: 'rings',
  'water-cycle': 'cycle',
  cycle: 'cycle',
  photosynthesis: 'sprout',
  chloroplast: 'leaf',
  chlorophyll: 'leaf',
  pollination: 'flower-2',
  pollen: 'flower-2',
  plant: 'sprout',
  plants: 'sprout',
  tree: 'tree-pine',
  forest: 'trees',
  seed: 'sprout',
  root: 'sprout',
  bee: 'bug',
  insect: 'bug',
  butterfly: 'bug',
  ant: 'bug',
  spider: 'bug',
  bacteria: 'bug',
  whale: 'fish',
  shark: 'fish',
  dolphin: 'fish',
  cow: 'milk',
  horse: 'paw-print',
  animal: 'paw-print',
  animals: 'paw-print',
  water: 'droplets',
  rain: 'cloud-rain',
  ocean: 'waves',
  sea: 'waves',
  wave: 'waves',
  tsunami: 'waves',
  river: 'waves',
  air: 'wind',
  oxygen: 'wind',
  lungs: 'wind',
  lung: 'wind',
  breathing: 'wind',
  co2: 'cloud',
  carbon: 'cloud',
  'carbon-dioxide': 'cloud',
  smoke: 'cloud',
  environment: 'earth',
  planet: 'earth',
  world: 'earth',
  globe: 'earth',
  pollution: 'factory',
  fire: 'flame',
  lava: 'flame',
  magma: 'flame',
  volcano: 'mountain',
  earthquake: 'activity',
  gravity: 'arrow-down',
  sunlight: 'sun',
  summer: 'sun',
  winter: 'snowflake',
  spring: 'flower-2',
  autumn: 'leaf',
  fall: 'leaf',
  season: 'calendar-days',
  seasons: 'calendar-days',
  energy: 'zap',
  electricity: 'zap',
  power: 'zap',
  light: 'lightbulb',
  idea: 'lightbulb',
  sound: 'volume-2',
  speed: 'gauge',
  temperature: 'thermometer',
  heat: 'thermometer',
  time: 'clock',
  history: 'hourglass',
  neuron: 'brain-circuit',
  nerve: 'brain-circuit',
  stomach: 'utensils',
  digestion: 'utensils',
  food: 'utensils',
  blood: 'droplet',
  sugar: 'candy',
  glucose: 'candy',
  body: 'person-standing',
  person: 'user',
  people: 'users',
  democracy: 'vote',
  election: 'vote',
  senate: 'landmark',
  congress: 'landmark',
  parliament: 'landmark',
  government: 'landmark',
  bill: 'file-text',
  document: 'file-text',
  law: 'scale',
  court: 'scale',
  justice: 'scale',
  constitution: 'scroll-text',
  war: 'swords',
  king: 'crown',
  money: 'coins',
  economy: 'trending-up',
  market: 'store',
  math: 'calculator',
  equation: 'sigma',
  computer: 'laptop',
  internet: 'globe',
  phone: 'smartphone',
  email: 'mail',
  airplane: 'plane',
  boat: 'sailboat',
  language: 'languages',
  art: 'palette',
  paint: 'palette',
  question: 'circle-question-mark',
}
