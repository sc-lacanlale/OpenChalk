import { describe, expect, it } from 'vitest'
import { arg, cleanId, list, shorten } from './args'

describe('arg', () => {
  it('returns the first name that is set and not blank', () => {
    expect(arg({ heading: '  ', text: 'Nucleus' }, 'heading', 'text')).toBe('Nucleus')
    expect(arg({ title: 0 }, 'title')).toBe(0)
    expect(arg({}, 'a', 'b')).toBeUndefined()
  })
})

describe('shorten', () => {
  it('drops whole words instead of cutting one in half', () => {
    expect(shorten('Founded in 1611 by the Dominican order', 20)).toBe('Founded in 1611 by')
  })
  it('caps the word count and trims trailing punctuation', () => {
    expect(shorten('one two three four', 99, 2)).toBe('one two')
    expect(shorten('cause, effect,', 20)).toBe('cause, effect')
    expect(shorten('cause, effect,', 13)).toBe('cause')
  })
  it('cuts a single over-long word as a last resort', () => {
    expect(shorten('pneumonoultramicroscopic', 10)).toBe('pneumonoul')
  })
})

describe('cleanId', () => {
  it('makes a safe id and numbers duplicates', () => {
    const taken = new Set(['sun'])
    expect(cleanId('sun', 'p1', taken)).toBe('sun2')
    expect(cleanId('cell wall!', 'p1', taken)).toBe('cell-wall')
    expect(cleanId('', 'p1', taken)).toBe('p1')
  })
})

describe('list', () => {
  it('accepts arrays and pipe or comma separated text', () => {
    expect(list('Jan|Feb| Mar')).toEqual(['Jan', 'Feb', 'Mar'])
    expect(list(['a', ' b '])).toEqual(['a', 'b'])
    expect(list(undefined)).toEqual([])
  })
})
