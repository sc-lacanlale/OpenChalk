import { describe, expect, it } from 'vitest'
import { SLOTS, SPLIT_SLOTS, flowPositions, normSlot, slotXY } from './layout'

describe('normSlot', () => {
  it('understands the ways models name places', () => {
    expect(normSlot('upper left')).toBe('top-left')
    expect(normSlot('North-East')).toBe('top-right')
    expect(normSlot('middle')).toBe('center')
    expect(normSlot('top_center')).toBe('top')
    expect(normSlot('left-bottom')).toBe('bottom-left')
  })
  it('returns empty for anything else', () => {
    expect(normSlot('somewhere nice')).toBe('')
    expect(normSlot(undefined)).toBe('')
  })
})

describe('slots', () => {
  it('keep every slot centre on the 1200x700 board', () => {
    for (const [layout, table] of [
      ['diagram', SLOTS],
      ['split', SPLIT_SLOTS],
    ] as const) {
      for (const slot of Object.keys(table)) {
        const [x, y] = slotXY(layout, slot)
        expect(x).toBeGreaterThan(0)
        expect(x).toBeLessThan(1200)
        expect(y).toBeGreaterThan(0)
        expect(y).toBeLessThan(700)
      }
    }
  })
})

describe('flowPositions', () => {
  it('uses one row up to four nodes and two rows after that', () => {
    expect(new Set(flowPositions(4).map(([, y]) => y)).size).toBe(1)
    expect(new Set(flowPositions(5).map(([, y]) => y)).size).toBe(2)
    expect(flowPositions(7)).toHaveLength(7)
  })
})
