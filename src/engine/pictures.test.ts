import { describe, expect, it } from 'vitest'
import { resolvePicture, suggest } from './pictures'

describe('resolvePicture', () => {
  it('finds built-in icons and motifs by name', () => {
    expect(resolvePicture('sun')).toMatchObject({ kind: 'icon', name: 'sun' })
    expect(resolvePicture('helix')).toMatchObject({ kind: 'motif', name: 'helix' })
    expect(resolvePicture('Flask Conical').name).toBe('flask-conical')
  })
  it('marks loose alias stand-ins as approximate so a better icon is looked up', () => {
    expect(resolvePicture('lungs').approx).toBe(true)
  })
  it('never fails: an unknown word becomes a plain shape', () => {
    expect(resolvePicture('zxqv')).toMatchObject({ kind: 'motif', name: 'blob', guessed: true })
    expect(resolvePicture(undefined).guessed).toBe(true)
  })
  it('every picture has strokes to draw', () => {
    for (const w of ['sun', 'helix', 'lungs', 'zxqv']) expect(resolvePicture(w).strokes.length).toBeGreaterThan(0)
  })
})

describe('suggest', () => {
  it('offers close icon names', () => {
    expect(suggest('flower').length).toBeGreaterThan(0)
  })
})
