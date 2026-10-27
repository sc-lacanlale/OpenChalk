// SVG drawing primitives: make elements, animate a stroke being drawn with the pen, reveal handwriting, fade.
import { clamp, f, mapPts, parsePath, toD, wobble } from '../path'
import type { Stroke, Text } from './state'
import { FONT } from './style'

const NS = 'http://www.w3.org/2000/svg'
const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p)

export type Ink = ReturnType<typeof createInk>

export function createInk(svg: SVGSVGElement, gPen: SVGGElement, defs: SVGDefsElement) {
  type Attrs = Record<string, string | number>
  function el<K extends keyof SVGElementTagNameMap>(tag: K, at: Attrs, parent?: Element | null): SVGElementTagNameMap[K] {
    const e = document.createElementNS(NS, tag)
    for (const k in at) e.setAttribute(k, String(at[k]))
    if (parent) parent.appendChild(e)
    return e
  }

  /** Calls fn(progress 0..1) every frame for `dur` seconds. */
  const anim = (dur: number, fn: (p: number) => void) =>
    new Promise<void>((res) => {
      const t0 = performance.now()
      const step = (now: number) => {
        const p = clamp((now - t0) / 1000 / dur)
        fn(p)
        if (p < 1) requestAnimationFrame(step)
        else res()
      }
      requestAnimationFrame(step)
    })

  const penTo = (x: number, y: number, color?: string | null) => {
    gPen.setAttribute('transform', `translate(${f(x)} ${f(y)})`)
    gPen.style.opacity = '1'
    if (color) gPen.querySelectorAll('circle').forEach((c) => c.setAttribute('fill', color))
  }
  const hidePen = () => {
    gPen.style.opacity = '0'
  }

  /** A path that starts invisible, ready for draw(). */
  const mkPath = (parent: Element, d: string, color: string, w: number) => {
    const e = el(
      'path',
      {
        d,
        fill: 'none',
        stroke: color,
        'stroke-width': w,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        pathLength: 1,
        'stroke-dasharray': 1,
        'stroke-dashoffset': 1,
      },
      parent,
    )
    e.style.opacity = '0'
    return e
  }

  /** Draw a path over `dur` seconds with the pen following its tip. */
  async function draw(e: SVGPathElement, dur: number, color?: string) {
    e.style.opacity = '1'
    await anim(dur, (p) => {
      const q = ease(p)
      e.setAttribute('stroke-dashoffset', String(1 - q))
      const pt = e.getPointAtLength(e.getTotalLength() * q)
      penTo(pt.x, pt.y, color || e.getAttribute('stroke'))
    })
    e.setAttribute('stroke-dasharray', 'none')
    e.removeAttribute('stroke-dashoffset')
  }

  const probe = el('path', { d: 'M0 0', fill: 'none' }, defs)
  const pathLen = (d: string) => {
    try {
      probe.setAttribute('d', d)
      return probe.getTotalLength() || 0
    } catch {
      return 0
    }
  }

  const meas = el('text', { x: -9999, y: -9999, 'font-family': FONT, visibility: 'hidden' }, svg)
  const textW = (s: string, size: number, weight: number) => {
    meas.setAttribute('font-size', String(size))
    meas.setAttribute('font-weight', String(weight))
    meas.textContent = s
    return meas.getComputedTextLength()
  }
  /** Word-wrap text to maxW pixels, at most maxLines lines (the rest is dropped). */
  const wrap = (text: string, size: number, weight: number, maxW: number, maxLines: number) => {
    const lines: string[] = []
    let line = ''
    for (const w of text.split(' ')) {
      const t = line ? line + ' ' + w : w
      if (line && textW(t, size, weight) > maxW) {
        lines.push(line)
        line = w
      } else line = t
    }
    if (line) lines.push(line)
    return lines.slice(0, maxLines)
  }

  let clipN = 0
  const newClip = (clips: SVGClipPathElement[]) => {
    const cp = el('clipPath', { id: 'c' + clipN++ }, defs)
    clips.push(cp)
    return cp
  }
  /** Handwriting, hidden until reveal(). It shrinks to fit maxW. The clip path is tracked in `clips` so it is removed with its board. */
  function mkText(
    clips: SVGClipPathElement[],
    parent: Element,
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    anchor: 'start' | 'middle' | 'end',
    { weight = 500, maxW = 0 } = {},
  ): Text {
    if (maxW) while (size > 15 && textW(s, size, weight) > maxW) size -= 2
    const e = el('text', { x, y, 'text-anchor': anchor, 'font-size': size, 'font-family': FONT, 'font-weight': weight, fill: color }, parent)
    e.textContent = s
    const bb = e.getBBox()
    const cp = newClip(clips)
    const cr = el('rect', { x: bb.x - 6, y: bb.y - 8, width: 0, height: bb.height + 16 }, cp)
    e.setAttribute('clip-path', `url(#${cp.id})`)
    return { e, cr, cp, bb, size }
  }
  async function reveal(t: Text, color?: string) {
    const dur = clamp(0.22 + (t.e.textContent || '').length * 0.034, 0.25, 1.7)
    await anim(dur, (p) => {
      t.cr.setAttribute('width', String((t.bb.width + 16) * p))
      penTo(t.bb.x + t.bb.width * p, t.bb.y + t.bb.height * 0.72 + Math.sin(p * 40) * 3, color || t.e.getAttribute('fill'))
    })
    t.e.removeAttribute('clip-path')
    t.cp.remove()
  }

  const fadeOut = (node: SVGElement, s = 0.3) =>
    anim(s, (p) => {
      node.style.opacity = String(1 - p)
    })
  const fadeIn = (node: SVGElement, s: number) =>
    anim(s, (p) => {
      node.style.opacity = String(p)
    })

  /** Place source strokes (in a `space` box) into `box` on the board and wobble them once, so redraws look the same. */
  function strokesToPx(strokeDs: string[], space: number, box: [number, number, number, number], seed: string): Stroke[] {
    const [x, y, w, h] = box
    const kx = w / space
    const ky = h / space
    const size = Math.max(w, h)
    const out: Stroke[] = []
    strokeDs.forEach((d, i) => {
      const segs = wobble(
        mapPts(parsePath(d), (px, py) => [x + px * kx, y + py * ky]),
        { amp: clamp(size * 0.011, 0.7, 3.4), wl: clamp(size * 0.45, 36, 230), seed: seed + i },
      )
      const dd = toD(segs)
      const len = pathLen(dd)
      if (len > 1) out.push({ d: dd, len })
    })
    return out
  }
  /** Draw strokes one after another, sharing `total` seconds by length. */
  async function drawStrokes(g: Element, strokes: Stroke[], color: string, width: number, total: number) {
    const sum = strokes.reduce((a, s) => a + s.len, 0) || 1
    for (const s of strokes) await draw(mkPath(g, s.d, color, width), Math.max(0.12, (total * s.len) / sum), color)
  }

  return { el, anim, penTo, hidePen, mkPath, draw, pathLen, wrap, newClip, mkText, reveal, fadeOut, fadeIn, strokesToPx, drawStrokes, ease }
}
