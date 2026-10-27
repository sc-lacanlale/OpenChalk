import { describe, expect, it } from 'vitest'
import { boardLines, hint, stageOf } from './coach'
import { freshBoard, type Board, type Part, type Write } from './state'

// Coaching only reads board state, so plain objects stand in for the SVG elements.
const g = {} as SVGGElement
const board = (layout: Board['layout'] = 'split'): Board => ({ ...freshBoard(g), started: true, kind: 'scene', layout, title: 'UST' })
const addPart = (b: Board, id: string) => b.parts.set(id, { id, name: id, slot: 'top-left' } as Part)
const addKeypoint = (b: Board, id: string, rows = 1) => b.writes.set(id, { band: false, style: 'line', rows, text: id } as Write)
const addBand = (b: Board, id: string, style: 'note' | 'takeaway' | 'question') => b.writes.set(id, { band: true, style, text: id, row: 0, seq: 1 } as Write)

describe('hint on a split board', () => {
  it('asks for a keypoint first', () => {
    expect(hint(board())).toMatch(/first keypoint/)
  })
  it('asks for more keypoints when pictures outnumber them', () => {
    const b = board()
    addPart(b, 'arch')
    addPart(b, 'campus')
    addKeypoint(b, 'l1')
    expect(hint(b)).toMatch(/fewer keypoints/)
  })
  it('asks for a picture when text runs far ahead', () => {
    const b = board()
    for (const id of ['l1', 'l2', 'l3', 'l4']) addKeypoint(b, id)
    expect(hint(b)).toMatch(/picture/)
  })
  it('suggests wrapping up once the board is full enough', () => {
    const b = board()
    for (const id of ['a', 'b', 'c']) addPart(b, id)
    for (const id of ['l1', 'l2', 'l3', 'l4', 'l5']) addKeypoint(b, id)
    expect(hint(b)).toMatch(/takeaway/)
  })
})

describe('hint on a diagram board', () => {
  it('suggests a split board when the bottom rows are full', () => {
    const b = board('diagram')
    addPart(b, 'a')
    addPart(b, 'b')
    addBand(b, 'n1', 'note')
    addBand(b, 'n2', 'note')
    expect(hint(b)).toMatch(/split board/)
  })
})

describe('stageOf', () => {
  it('goes idle, teaching, done', () => {
    const b = board()
    expect(stageOf(b)).toBe('idle')
    addKeypoint(b, 'l1')
    expect(stageOf(b)).toBe('teaching')
    addBand(b, 'takeaway', 'takeaway')
    expect(stageOf(b)).toBe('done')
  })
})

describe('boardLines', () => {
  it('describes the board for the model', () => {
    const b = board()
    addPart(b, 'arch')
    addKeypoint(b, 'l1')
    expect(boardLines(b)).toEqual(['title: UST [split layout]', 'part arch (arch) at top-left, no label', 'line l1: l1'])
    expect(boardLines(freshBoard(g))).toEqual(['empty'])
  })
})
