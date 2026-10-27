// Turns a word into something drawable: a motif, a Lucide icon, or (never an error) a plain shape.
import { ICON_PATHS, ICON_TAGS } from './icons'
import { ALIAS, MOTIFS, MOTIF_NAMES } from './motifs'

/** guessed: nothing matched, so it is a plain shape. approx: a loose stand-in from the alias table (lungs -> wind), worth replacing with a real lookup. */
export type Picture = { kind: 'icon' | 'motif'; name: string; strokes: string[]; space: number; guessed?: boolean; approx?: boolean }

type Entry = { name: string; parts: string[]; tags: string[] }
let index: Entry[] | null = null
const build = (): Entry[] => Object.keys(ICON_PATHS).map((name) => ({ name, parts: name.split('-'), tags: (ICON_TAGS[name] || '').split(' ').filter(Boolean) }))

/** Strict matches pick a picture; loose matches only feed suggestions. */
export function searchIcons(q: string, loose: boolean): [number, string][] {
  if (!index) index = build()
  const words = q
    .split(/[\s-]+/)
    .filter(Boolean)
    .flatMap((w) => (w.length > 3 && w.endsWith('s') ? [w, w.slice(0, -1)] : [w]))
  const res: [number, string][] = []
  for (const it of index) {
    let s = 0
    for (const w of words) {
      if (it.name === w) s += 100
      else if (it.parts.includes(w)) s += 50
      else if (loose && it.name.includes(w)) s += 15
      if (it.tags.includes(w)) s += 40
      else if (loose && w.length >= 4 && it.tags.some((t) => t.startsWith(w))) s += 12
    }
    if (s) res.push([s - it.name.length * 0.1, it.name])
  }
  return res.sort((a, b) => b[0] - a[0])
}

const asMotif = (name: string): Picture => ({ kind: 'motif', name, strokes: MOTIFS[name](), space: 100 })
const asIcon = (name: string): Picture => ({ kind: 'icon', name, strokes: ICON_PATHS[name], space: 24 })
const byName = (n: string): Picture | null => (MOTIFS[n] ? asMotif(n) : ICON_PATHS[n] ? asIcon(n) : null)

const loose = (p: Picture): Picture => (p.kind === 'icon' ? { ...p, approx: true } : p) // motifs are deliberate diagram shapes; icons from the alias table are only near misses

export function resolvePicture(raw: unknown): Picture {
  const q = String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, '-')
  if (q) {
    const own = byName(q)
    if (own) return own
    const alias = ALIAS[q] ? byName(ALIAS[q]) : null
    if (alias) return loose(alias)
    const flat = q.replace(/-/g, ''),
      exact = Object.keys(ICON_PATHS).find((k) => k.replace(/-/g, '') === flat)
    if (exact) return asIcon(exact)
    const hits = searchIcons(q, false)
    if (hits.length && hits[0][0] >= 30) return asIcon(hits[0][1])
    for (const w of q.split('-')) {
      if (w.length > 2 && ALIAS[w]) {
        const p = byName(ALIAS[w])
        if (p) return loose(p)
      }
    }
  }
  return { ...asMotif('blob'), guessed: true } // no match: a plain shape plus the label still teaches; an error would not
}

export const suggest = (raw: string): string[] =>
  searchIcons(
    String(raw)
      .toLowerCase()
      .replace(/[_\s]+/g, '-'),
    true,
  )
    .slice(0, 5)
    .map((h) => h[1])
export { MOTIF_NAMES }
