import { describe, expect, it } from 'vitest'
import { captionText, foldHeard } from './transcript'

const fold = (chunks: string[]) => {
  let heard = ''
  const shown: string[] = []
  for (const c of chunks) {
    const r = foldHeard(heard, c)
    heard = r.heard
    if (r.add) shown.push(r.add)
  }
  return shown.join('')
}

describe('foldHeard', () => {
  it('joins separate chunks with spaces', () => {
    expect(fold(['Teach me', 'about volcanoes'])).toBe('Teach me about volcanoes')
  })
  it('drops chunks that repeat what was already heard', () => {
    expect(fold(['Teach me about', 'Teach me about', 'about'])).toBe('Teach me about')
  })
  it('keeps only the new end of a growing chunk', () => {
    expect(fold(['Teach me', 'Teach me about cells'])).toBe('Teach me about cells')
  })
  it('collapses a phrase the transcriber doubled', () => {
    expect(fold(['what is a cellwhat is a cell'])).toBe('what is a cell')
  })
  it('strips the stray "text" prefix', () => {
    expect(fold(['textHello there'])).toBe('Hello there')
  })
})

describe('captionText', () => {
  it('shows only the last sentence', () => {
    expect(captionText('Plants cook with light. The leaf is the kitchen.')).toBe('The leaf is the kitchen.')
  })
  it('keeps long sentences to 160 characters on a word boundary', () => {
    const t = captionText('word '.repeat(60))
    expect(t.length).toBeLessThanOrEqual(160)
    expect(t.startsWith('word')).toBe(true)
  })
})
