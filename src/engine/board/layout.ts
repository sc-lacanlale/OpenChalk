// Where things go on the 1200x700 board, and the pure geometry for outlines and arrows.
// diagram: one picture in the middle, coloured labels with arrows down both sides, notes along the bottom.
// split:   keypoints stacked on the left, up to four pictures with tags on the right.
import { ICON_PATHS } from '../icons'
import { circ, f, mapPts, parsePath, smoothClosed, toD, wobble, type Pt } from '../path'

export type Layout = 'diagram' | 'split'
export type Box = { x: number; y: number; w: number; h: number }

export const STAGE: Box = { x: 330, y: 160, w: 540, h: 380 }
export const SPLIT: Box = { x: 640, y: 165, w: 520, h: 400 }

/** Slot centres as fractions of the stage box. */
export const SLOTS: Record<string, Pt> = {
  'top-left': [0.25, 0.27],
  top: [0.5, 0.2],
  'top-right': [0.75, 0.27],
  left: [0.17, 0.5],
  center: [0.5, 0.5],
  right: [0.83, 0.5],
  'bottom-left': [0.25, 0.75],
  bottom: [0.5, 0.82],
  'bottom-right': [0.75, 0.75],
}
export const SPLIT_SLOTS: Record<string, Pt> = {
  'top-left': [0.25, 0.24],
  'top-right': [0.75, 0.24],
  'bottom-left': [0.25, 0.76],
  'bottom-right': [0.75, 0.76],
}
/** Fill order when the model does not pick a slot. */
export const SLOT_ORDER = ['center', 'top-left', 'bottom-right', 'top-right', 'bottom-left', 'top', 'bottom', 'left', 'right']
export const SPLIT_ORDER = ['top-left', 'bottom-right', 'top-right', 'bottom-left']

export const SIZES: Record<string, number> = { small: 72, s: 72, medium: 104, m: 104, large: 150, l: 150 }

/** Diagram callout columns, and the two note rows along the bottom. */
export const SIDE_X = { left: 48, right: 918 }
export const SIDE_Y = [195, 300, 405, 510]
export const BAND_Y = [610, 668]

/** Keypoint stack on split boards. */
export const STACK = { size: 44, step: 54, y0: 215, x: 64, dotX: 40, maxW: 540, maxRows: 7, maxLines: 3 }

/** Flow-diagram node radii. */
export const RX = 112
export const RY = 50

export const FIGURES = ['none', 'blob', 'circle', 'oval', 'box', 'cloud', 'triangle']

/** Photo queries that want a labelled diagram rather than a photo. Keep in step with src/app/api/photo/route.ts. */
export const DIAGRAM = /diagram|structure|anatomy|cycle|labell?ed|chart|map/i

export const stageOf = (layout: Layout): Box => (layout === 'split' ? SPLIT : STAGE)
export const slotsOf = (layout: Layout) => (layout === 'split' ? SPLIT_SLOTS : SLOTS)
export const orderOf = (layout: Layout) => (layout === 'split' ? SPLIT_ORDER : SLOT_ORDER)
export const maxParts = (layout: Layout) => (layout === 'split' ? 4 : 9)

export const slotXY = (layout: Layout, slot: string): Pt => {
  const [a, b] = slotsOf(layout)[slot]
  const s = stageOf(layout)
  return [s.x + a * s.w, s.y + b * s.h]
}

/** "upper left", "North-East", "middle" ... -> a diagram slot name, or '' when unrecognised. */
export function normSlot(raw: unknown): string {
  let s = String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/upper/g, 'top')
    .replace(/lower/g, 'bottom')
    .replace(/middle|centre/g, 'center')
    .replace(/north/g, 'top')
    .replace(/south/g, 'bottom')
    .replace(/east/g, 'right')
    .replace(/west/g, 'left')
  if (SLOTS[s]) return s
  s = s
    .replace(/^(top|bottom)-center$/, '$1')
    .replace(/^center-(left|right)$/, '$1')
    .replace(/^(left|right)-(top|bottom)$/, '$2-$1')
  return SLOTS[s] ? s : ''
}

/** The point on a circle of radius r around c that faces `toward`. */
export const edgePoint = (c: Pt, r: number, toward: Pt): Pt => {
  const dx = toward[0] - c[0]
  const dy = toward[1] - c[1]
  const d = Math.hypot(dx, dy) || 1
  return [c[0] + (dx / d) * r, c[1] + (dy / d) * r]
}

/** A gently curved, hand-wobbled arrow from a to b. `mid` is a point on the curve for its label. */
export function arrowPath(a: Pt, b: Pt, bend: number, seed: string): { d: string; mid: Pt } {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const cx = mx - (dy / len) * len * bend
  const cy = my + (dx / len) * len * bend
  const mid: Pt = [0.25 * a[0] + 0.5 * cx + 0.25 * b[0], 0.25 * a[1] + 0.5 * cy + 0.25 * b[1]]
  const ang = Math.atan2(b[1] - cy, b[0] - cx)
  const h = 16
  const d =
    `M${f(a[0])} ${f(a[1])}Q${f(cx)} ${f(cy)} ${f(b[0])} ${f(b[1])}` +
    `M${f(b[0] - h * Math.cos(ang - 0.5))} ${f(b[1] - h * Math.sin(ang - 0.5))}L${f(b[0])} ${f(b[1])}` +
    `L${f(b[0] - h * Math.cos(ang + 0.5))} ${f(b[1] - h * Math.sin(ang + 0.5))}`
  return { d: toD(wobble(parsePath(d), { amp: 1.1, wl: 60, seed })), mid }
}

/** Outline path for a diagram figure (the cell wall a diagram's parts sit inside). */
export function figurePath(shape: string, box: [number, number, number, number]): string[] {
  const [x, y, w, h] = box
  const cx = x + w / 2
  const cy = y + h / 2
  if (shape === 'circle') return [circ(cx, cy, Math.min(w, h) / 2)]
  if (shape === 'oval') {
    return [
      `M${f(x)} ${f(cy)}C${f(x)} ${f(y - h * 0.08)} ${f(x + w)} ${f(y - h * 0.08)} ${f(x + w)} ${f(cy)}` +
        `C${f(x + w)} ${f(y + h * 1.08)} ${f(x)} ${f(y + h * 1.08)} ${f(x)} ${f(cy)}Z`,
    ]
  }
  if (shape === 'box') {
    const r = 28
    return [
      `M${x + r} ${y}L${x + w - r} ${y}Q${x + w} ${y} ${x + w} ${y + r}L${x + w} ${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}` +
        `L${x + r} ${y + h}Q${x} ${y + h} ${x} ${y + h - r}L${x} ${y + r}Q${x} ${y} ${x + r} ${y}Z`,
    ]
  }
  if (shape === 'triangle') {
    const r = 22
    return [
      `M${f(cx)} ${y + 6}L${x + w - r} ${y + h - r}Q${x + w} ${y + h} ${x + w - r * 2} ${y + h}L${x + r * 2} ${y + h}Q${x} ${y + h} ${x + r} ${y + h - r}Z`,
    ]
  }
  if (shape === 'cloud') {
    return [toD(mapPts(parsePath(ICON_PATHS.cloud.join('')), (px, py) => [x + ((px - 2) / 20) * w, y + ((py - 3) / 16) * h]))]
  }
  const pts: Pt[] = []
  for (let i = 0; i <= 11; i++) {
    const t = (i / 11) * 6.2832 * 0.92
    pts.push([cx + (w / 2) * Math.cos(t) * (1 + 0.06 * Math.sin(t * 3 + 1)), cy + (h / 2) * Math.sin(t) * (1 + 0.06 * Math.cos(t * 2 + 2))])
  }
  return [smoothClosed(pts, 'fig', 3)]
}

/** Target positions for flow nodes: one row up to 4 nodes, two rows after that. */
export function flowPositions(n: number): Pt[] {
  const rows = n <= 4 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)]
  const ys = rows.length === 1 ? [370] : [270, 470]
  const out: Pt[] = []
  rows.forEach((m, r) => {
    for (let j = 0; j < m; j++) out.push([600 + (j - (m - 1) / 2) * (m <= 3 ? 340 : 285), ys[r]])
  })
  return out
}
