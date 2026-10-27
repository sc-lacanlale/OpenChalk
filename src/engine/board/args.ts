// Models send sloppy arguments. Accept any sensible spelling and shorten text instead of rejecting it.
import type { ToolArgs } from '../types'

/** The first of `names` that is set and not blank. */
export const arg = (a: ToolArgs, ...names: string[]): unknown => {
  for (const n of names) {
    const v = a[n]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return undefined
}

/** Any value as trimmed single-spaced text. */
export const str = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')

/** Drop whole words until the text fits, so a word is never cut in half (unless one word is longer than the limit). */
export const shorten = (v: unknown, maxChars: number, maxWords = 99): string => {
  let words = str(v).split(' ').filter(Boolean)
  if (!words.length) return ''
  words = words.slice(0, maxWords)
  let t = words.join(' ')
  while (t.length > maxChars && words.length > 1) {
    words.pop()
    t = words.join(' ')
  }
  return (t.length > maxChars ? t.slice(0, maxChars) : t).replace(/[,;:\-–—]+$/, '')
}

/** A safe, unique id: letters, digits, - and _. Falls back to `prefix`, and adds a number when taken. */
export const cleanId = (raw: unknown, prefix: string, taken: Set<string>): string => {
  const base =
    String(raw ?? '')
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || prefix
  let id = base
  let n = 1
  while (taken.has(id)) id = base + ++n
  return id
}

/** Labels or values given as an array or as "a|b|c" / "a,b,c". */
export const list = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? '').split(/[|,]/)).map((s) => String(s).trim()).filter(Boolean)
