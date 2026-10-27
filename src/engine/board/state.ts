// What is on one board. Everything the model asked for is recorded here before it is drawn, so tool results
// can describe the board immediately while the pen catches up.
import type { Pt } from '../path'
import type { Layout } from './layout'
import type { ColorName } from './style'

/** A text element revealed left to right by a growing clip rectangle. */
export type Text = { e: SVGTextElement; cr: SVGRectElement; cp: SVGClipPathElement; bb: DOMRect; size: number }
export type Stroke = { d: string; len: number }
export type IconHit = { name: string; strokes: string[] }
export type PhotoHit = { url: string; credit?: string; page?: string }

export type Part = {
  id: string
  /** The word or query it was drawn from. */
  name: string
  /** Source strokes in a `space` x `space` box; `strokes` is them placed and wobbled on the board. */
  strokeDs: string[]
  space: number
  strokes: Stroke[]
  width: number
  slot: string
  cx: number
  cy: number
  size: number
  color: ColorName
  label: string
  g: SVGGElement
  lab: Text | null
  /** A better picture from the icon library, if one is being looked up. */
  lookup: Promise<IconHit | null> | null
  photo?: {
    w: number
    h: number
    /** How far below the centre the tag goes. */
    drop: number
    frame: { x: number; y: number; fw: number; fh: number }
    rot: number
    promise: Promise<PhotoHit | null>
  }
}

export type Callout = {
  g: SVGGElement
  side: 'left' | 'right' | ''
  y: number
  heading: string
  note: string
  color: ColorName
  h: Text
  under: SVGPathElement
  noteT: Text[]
  arrow: SVGPathElement | null
  partId: string
  /** The arrow as a straight segment, so new pictures can avoid sitting on it. */
  seg: [Pt, Pt] | null
}

export type Link = { from: string; to: string; path: SVGPathElement; lab: Text | null; color: ColorName; g: SVGGElement }

type WriteBase = { text: string; g: SVGGElement; color: ColorName; dead: boolean }
/** A keypoint in the left-hand stack of a split board. */
export type StackWrite = WriteBase & { band: false; style: 'line'; rows: number; lines: Text[]; dot: SVGPathElement }
/** A note, takeaway or question in a row along the bottom. */
export type BandWrite = WriteBase & {
  band: true
  style: 'note' | 'takeaway' | 'question'
  row: number
  seq: number
  t: Text
  box: SVGPathElement
  fill: boolean
}
export type Write = StackWrite | BandWrite

export type FlowNode = { id: string; label: string; note: string; color: string; cx: number; cy: number; tx: number; ty: number; g: SVGGElement | null }
export type FlowArrow = { a: FlowNode; b: FlowNode; el: SVGPathElement; label: Text | null }
export type Chart = { kind: 'bar' | 'line'; labels: string[]; values: number[]; color: ColorName; desc: string }
export type Figure = { g: SVGGElement; strokes: Stroke[]; lab: Text | null; shape: string; label: string; color: string }

export type Board = {
  g: SVGGElement
  started: boolean
  layout: Layout
  kind: 'empty' | 'scene' | 'chart' | 'flow'
  title: string
  subtitle: string
  titleG: SVGGElement | null
  figure: Figure | null
  parts: Map<string, Part>
  callouts: Map<string, Callout>
  links: Link[]
  writes: Map<string, Write>
  nodes: Map<string, FlowNode>
  arrows: FlowArrow[]
  chart: Chart | null
  /** Clip paths used by text reveals, removed with the board. */
  clips: SVGClipPathElement[]
  colorIdx: number
  seq: number
  /** How many check questions have been asked. */
  asked: number
  pid: number
  /** Ids in the order they were added, for Undo. */
  hist: string[]
}

export const freshBoard = (g: SVGGElement): Board => ({
  g,
  started: false,
  layout: 'diagram',
  kind: 'empty',
  title: '',
  subtitle: '',
  titleG: null,
  figure: null,
  parts: new Map(),
  callouts: new Map(),
  links: [],
  writes: new Map(),
  nodes: new Map(),
  arrows: [],
  chart: null,
  clips: [],
  colorIdx: 0,
  seq: 0,
  asked: 0,
  pid: 0,
  hist: [],
})

export const bandItems = (b: Board): [string, BandWrite][] => [...b.writes.entries()].filter((e): e is [string, BandWrite] => e[1].band)

/** Text rows used by the keypoint stack (a long keypoint wraps onto 2 or 3 rows). */
export const stackRows = (b: Board): number => [...b.writes.values()].reduce((n, w) => n + (w.band ? 0 : w.rows), 0)
