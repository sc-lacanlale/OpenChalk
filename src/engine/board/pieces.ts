// Everything that can go on a board. Each piece has a build step (make the hidden SVG and work out its layout, run
// when the tool is called) and an op (animate it into view, run later by the pen queue in time with the voice).
import { circ, clamp, distToSeg, f, loopD, mapPts, parsePath, toD, wavyLine, wobble, type Pt } from '../path'
import { resolvePicture } from '../pictures'
import type { Ink } from './ink'
import { DIAGRAM, RX, RY, SIDE_X, SIDE_Y, STAGE, arrowPath, edgePoint, figurePath, flowPositions, stageOf } from './layout'
import type { BandWrite, Board, Callout, Chart, Figure, FlowArrow, FlowNode, IconHit, Link, Part, PhotoHit, StackWrite, Text } from './state'
import { COL, inkW, type ColorName } from './style'

export type Op = () => Promise<void>
export type PartSpec = Pick<Part, 'id' | 'name' | 'strokeDs' | 'space' | 'slot' | 'cx' | 'cy' | 'size' | 'color' | 'label' | 'lookup'>

export function createPieces(ink: Ink, opts: { signal: AbortSignal; photoUrl: string }) {
  const { el, anim, draw, mkPath, mkText, reveal, strokesToPx, drawStrokes, penTo } = ink

  /** fetch JSON with a deadline; null on any failure so the lesson never waits on a slow network. */
  const fetchJson = <T>(url: string, ms: number, ok: (j: T) => boolean) =>
    new Promise<T | null>((res) => {
      const t = setTimeout(() => res(null), ms)
      fetch(url, { signal: opts.signal })
        .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
        .then((j) => {
          clearTimeout(t)
          res(j && ok(j) ? j : null)
        })
        .catch(() => res(null))
    })

  /* ---- title + outline figure ---- */
  type Title = { g: SVGGElement; t: Text; u: SVGPathElement; s: Text | null }
  function buildTitle(b: Board, title: string, subtitle: string): Title {
    const g = el('g', {}, b.g)
    const t = mkText(b.clips, g, title, 40, 82, 62, COL.green, 'start', { weight: 700, maxW: 800 })
    const u = mkPath(g, wavyLine(40, 40 + t.bb.width, 104, 'tu' + title), COL.green, 4)
    const s = subtitle ? mkText(b.clips, g, subtitle, 42, 140, 30, COL.muted, 'start', { weight: 500, maxW: 900 }) : null
    return { g, t, u, s }
  }
  function buildFigure(b: Board, shape: string, label: string): Figure {
    const g = el('g', {}, b.g)
    const cx = STAGE.x + STAGE.w / 2
    const box: [number, number, number, number] = shape === 'circle' ? [cx - 190, STAGE.y, 380, 380] : [STAGE.x, STAGE.y, STAGE.w, STAGE.h]
    const strokes = figurePath(shape, box).map((d, i) => {
      const dd = toD(wobble(parsePath(d), { amp: 3.4, wl: 230, seed: 'fg' + i }))
      return { d: dd, len: ink.pathLen(dd) }
    })
    const lab = label ? mkText(b.clips, g, label, cx, STAGE.y + STAGE.h + 28, 24, COL.muted, 'middle', { weight: 500, maxW: 420 }) : null
    return { g, strokes, lab, shape, label, color: COL.slate }
  }
  const opTitle =
    (T: Title, fig: Figure | null): Op =>
    async () => {
      await reveal(T.t, COL.green)
      await draw(T.u, 0.4, COL.green)
      if (T.s) await reveal(T.s, COL.muted)
      if (fig) {
        await drawStrokes(fig.g, fig.strokes, fig.color, 3.6, 1.5)
        if (fig.lab) await reveal(fig.lab, COL.muted)
      }
    }

  /* ---- pictures ---- */
  /** Recompute a part's board strokes from its source strokes (again after a better icon arrives). */
  function fit(p: Part) {
    const s = p.size
    const pad = p.space === 24 ? s * 0.08 : 0
    p.strokes = strokesToPx(p.strokeDs, p.space, [p.cx - s / 2 + pad, p.cy - s / 2 + pad, s - pad * 2, s - pad * 2], p.id)
    p.width = inkW(s)
  }
  /** Words the built-in set cannot draw are looked up on /api/icon (Iconify). */
  const fetchIcon = (q: string) => fetchJson<IconHit>('/api/icon?q=' + encodeURIComponent(q), 4500, (j) => !!j.strokes)
  const tapTarget = (g: SVGGElement, p: PartSpec) =>
    el('circle', { cx: p.cx, cy: p.cy, r: p.size * 0.62, fill: 'transparent', 'data-part': p.id, style: 'cursor:pointer' }, g)

  function buildPart(b: Board, spec: PartSpec): Part {
    const g = el('g', { 'data-id': spec.id }, b.g)
    tapTarget(g, spec)
    const p: Part = { ...spec, g, strokes: [], width: 0, lab: null }
    fit(p)
    p.lab = p.label
      ? mkText(b.clips, g, p.label, p.cx, p.cy + p.size / 2 + 24, 22, COL.muted, 'middle', { weight: 500, maxW: Math.max(120, p.size + 40) })
      : null
    return p
  }
  const opPart =
    (p: Part): Op =>
    async () => {
      if (p.lookup) {
        const hit = await p.lookup
        if (hit && p.g.isConnected) {
          p.strokeDs = hit.strokes
          p.space = 24
          p.name = hit.name
          fit(p)
        }
      }
      await drawStrokes(p.g, p.strokes, COL[p.color], p.width, clamp(p.strokes.reduce((a, s) => a + s.len, 0) / 420, 0.5, 1.7))
      if (p.lab) await reveal(p.lab)
    }

  /* ---- photos: Wikimedia Commons via /api/photo, taped on like a polaroid. If it cannot load, a drawn picture takes its place. ---- */
  const fetchPhoto = (q: string) =>
    new Promise<PhotoHit | null>((res) => {
      const t = setTimeout(() => res(null), 6000)
      fetchJson<PhotoHit>(opts.photoUrl + encodeURIComponent(q), 6000, (j) => !!j.url).then((j) => {
        if (!j) return res(null)
        const im = new Image()
        im.onload = () => {
          clearTimeout(t)
          res(j)
        }
        im.onerror = () => res(null)
        im.src = j.url
      })
    })
  function buildPhoto(b: Board, spec: PartSpec): Part {
    const g = el('g', { 'data-id': spec.id }, b.g)
    tapTarget(g, spec)
    const w = spec.size * 1.3
    const h = spec.size * 0.9
    const frame = { x: spec.cx - w / 2 - 7, y: spec.cy - h / 2 - 7, fw: w + 14, fh: h + 28 }
    const photo = { w, h, drop: h / 2 + 22, frame, rot: ((spec.id.length % 3) - 1) * 1.6, promise: fetchPhoto(spec.name) }
    return { ...spec, g, strokes: [], width: 3, lab: null, photo }
  }
  const opPhoto =
    (b: Board, p: Part): Op =>
    async () => {
      if (!p.photo) return
      const { x, y, fw, fh } = p.photo.frame
      const c = COL[p.color]
      const inner = el('g', { transform: `rotate(${p.photo.rot} ${p.cx} ${p.cy})` }, p.g)
      el('rect', { x: x + 3, y: y + 4, width: fw, height: fh, fill: '#000', opacity: 0.08, rx: 3 }, inner)
      const card = el('rect', { x, y, width: fw, height: fh, fill: '#fff', stroke: '#c9ccd3', 'stroke-width': 1.5, rx: 3 }, inner)
      card.style.opacity = '0'
      await anim(0.35, (q) => {
        card.style.opacity = String(q)
        penTo(x + fw * q, y, c)
      })
      // The lesson keeps moving; the image fades in when it arrives.
      void p.photo.promise.then((data) => {
        if (p.g.isConnected) void showPhoto(b, p, inner, data)
      })
    }
  async function showPhoto(b: Board, p: Part, inner: SVGGElement, data: PhotoHit | null) {
    if (!p.photo) return
    const { x, y, fh } = p.photo.frame
    if (!data) {
      inner.remove()
      const pic = resolvePicture(p.name)
      const size = p.size * 0.75
      p.strokes = strokesToPx(pic.strokes, pic.space, [p.cx - size / 2, p.cy - size / 2, size, size], p.id)
      await drawStrokes(p.g, p.strokes, COL[p.color], inkW(size), 1.1)
      return
    }
    const cp = ink.newClip(b.clips)
    el('rect', { x: x + 7, y: y + 7, width: p.photo.w, height: p.photo.h }, cp)
    const fit = DIAGRAM.test(p.name) ? 'xMidYMid meet' : 'xMidYMid slice'
    const im = el(
      'image',
      { href: data.url, x: x + 7, y: y + 7, width: p.photo.w, height: p.photo.h, preserveAspectRatio: fit, 'clip-path': `url(#${cp.id})` },
      inner,
    )
    im.style.opacity = '0'
    await ink.fadeIn(im, 0.5)
    const credit = String(data.credit || '').slice(0, 44)
    if (credit)
      el('text', { x: x + 9, y: y + fh - 5, 'font-size': 10, 'font-family': 'Inter,system-ui,sans-serif', fill: '#8a8f99' }, inner).textContent = credit
  }

  /* ---- labels. diagram: a callout in a side column with an arrow. split: a tag under the picture. ---- */
  /** How badly would a straight arrow a->b run through pictures other than `selfId`? */
  const crossCost = (b: Board, from: Pt, to: Pt, selfId: string) => {
    let cost = 0
    b.parts.forEach((o) => {
      if (o.id !== selfId && distToSeg([o.cx, o.cy], from, to) < o.size * 0.58) cost += 160
    })
    return cost
  }
  /** The free side-column row closest to the part whose arrow crosses the fewest other pictures. */
  function planCallout(b: Board, part: Part) {
    const used = { left: new Set<number>(), right: new Set<number>() }
    b.callouts.forEach((c) => {
      if (c.side) used[c.side].add(c.y)
    })
    const s = stageOf(b.layout)
    const midX = s.x + s.w / 2
    const natural = Math.abs(part.cx - midX) < 40 ? '' : part.cx < midX ? 'left' : 'right'
    let best: { side: 'left' | 'right'; y: number; cost: number } | null = null
    for (const side of ['left', 'right'] as const) {
      for (const y of SIDE_Y) {
        if (used[side].has(y)) continue
        const from: Pt = [side === 'left' ? SIDE_X.left + 130 : SIDE_X.right - 14, y - 13]
        const cost =
          Math.abs(y - part.cy) +
          (natural && side !== natural ? 70 : 0) +
          (!natural ? used[side].size * 25 : 0) +
          crossCost(b, from, [part.cx, part.cy], part.id)
        if (!best || cost < best.cost) best = { side, y, cost }
      }
    }
    return best
  }
  const hitRect = (g: SVGGElement, x: number, y: number, w: number, h: number, id: string) =>
    el('rect', { x, y, width: w, height: h, fill: 'transparent', 'data-part': id, style: 'cursor:pointer' }, g)
  const underline = (g: SVGGElement, x1: number, x2: number, y: number, id: string, color: string, w: number) =>
    mkPath(g, toD(wobble(parsePath(wavyLine(x1, x2, y, 'u' + id)), { amp: 0.6, wl: 50, seed: 'uu' + id })), color, w)

  /** Null when the side columns are full. */
  function buildCallout(b: Board, part: Part, heading: string, note: string, color: ColorName): Callout | null {
    const c = COL[color]
    const g = el('g', { 'data-id': 'co-' + part.id }, b.g)
    if (b.layout === 'split') {
      const y = part.cy + (part.photo ? part.photo.drop : part.size / 2) + 28
      const h = mkText(b.clips, g, heading, part.cx, y, 30, c, 'middle', { weight: 700, maxW: 235 })
      const under = underline(g, part.cx - h.bb.width / 2, part.cx + h.bb.width / 2, y + 8, part.id, c, 3)
      const noteT = (note ? ink.wrap(note, 21, 500, 235, 2) : []).map((ln, i) =>
        mkText(b.clips, g, ln, part.cx, y + 25 + i * 22, 21, COL.ink, 'middle', { maxW: 240 }),
      )
      hitRect(g, part.cx - 125, y - 30, 250, 100, part.id)
      return { g, side: '', y, heading, note, color, h, under, noteT, arrow: null, partId: part.id, seg: null }
    }
    const plan = planCallout(b, part)
    if (!plan) {
      g.remove()
      return null
    }
    const { side, y } = plan
    const x = SIDE_X[side]
    const h = mkText(b.clips, g, heading, x, y, 40, c, 'start', { weight: 700, maxW: 236 })
    const under = underline(g, x, x + h.bb.width + 4, y + 10, part.id, c, 3.2)
    const lines = note ? ink.wrap(note, 25, 500, 236, 2) : []
    const noteT = lines.map((ln, i) => mkText(b.clips, g, ln, x + 2, y + 38 + i * 26, 25, COL.ink, 'start', { weight: 500, maxW: 240 }))
    const from: Pt = [side === 'left' ? x + h.bb.width + 14 : x - 14, y - 13]
    const to = edgePoint([part.cx, part.cy], part.size * 0.5 * 0.92 + 12, from)
    const ar = arrowPath(from, to, side === 'left' ? -0.14 : 0.14, 'ar' + part.id)
    hitRect(g, x - 6, y - 36, 250, 112, part.id)
    return { g, side, y, heading, note: lines.join(' '), color, h, under, noteT, arrow: mkPath(g, ar.d, c, 3.2), partId: part.id, seg: [from, to] }
  }
  const opCallout =
    (co: Callout): Op =>
    async () => {
      const c = COL[co.color]
      await reveal(co.h, c)
      if (co.arrow) await draw(co.arrow, 0.55, c)
      await draw(co.under, 0.3, c)
      for (const t of co.noteT) await reveal(t, c)
    }

  /* ---- link arrows, highlights and the tap pulse ---- */
  function buildLink(b: Board, A: Part, Z: Part, text: string, color: ColorName): Link {
    const s = edgePoint([A.cx, A.cy], A.size * 0.5 * 0.92 + 12, [Z.cx, Z.cy])
    const t = edgePoint([Z.cx, Z.cy], Z.size * 0.5 * 0.92 + 12, [A.cx, A.cy])
    const ar = arrowPath(s, t, 0.18, 'lk' + A.id + Z.id)
    const g = el('g', {}, b.g)
    const path = mkPath(g, ar.d, COL[color], 3.6)
    const vertical = Math.abs(t[1] - s[1]) > Math.abs(t[0] - s[0]) * 1.2
    const lab = !text
      ? null
      : vertical
        ? mkText(b.clips, g, text, ar.mid[0] + 16, ar.mid[1] + 8, 26, COL[color], 'start', { weight: 700, maxW: 200 })
        : mkText(b.clips, g, text, ar.mid[0], ar.mid[1] - 16, 26, COL[color], 'middle', { weight: 700, maxW: 200 })
    return { from: A.id, to: Z.id, path, lab, color, g }
  }
  const opLink =
    (L: Link): Op =>
    async () => {
      await draw(L.path, 0.6, COL[L.color])
      if (L.lab) await reveal(L.lab, COL[L.color])
    }
  /** The ring mark for highlight(): a loop, underline or tick around a part or node. */
  function highlightPath(kind: string, cx: number, cy: number, rx: number, ry: number, seed: string): string {
    if (kind === 'underline') return wavyLine(cx - rx * 0.9, cx + rx * 0.9, cy + ry + 6, seed)
    if (kind === 'check') return `M${f(cx + rx * 0.5)} ${f(cy - ry * 0.9)}L${f(cx + rx * 0.8)} ${f(cy - ry * 0.55)}L${f(cx + rx * 1.3)} ${f(cy - ry * 1.3)}`
    return toD(mapPts(parsePath(loopD(rx, ry, seed)), (x, y) => [x + cx, y + cy]))
  }
  /** Quick expanding ring when a picture is tapped. */
  function pulse(b: Board, p: Part) {
    const g = el('g', {}, b.g)
    const r = p.size * 0.54
    el(
      'path',
      {
        d: toD(mapPts(parsePath(loopD(r, r, 'pl' + p.id + b.seq++)), (x, y) => [x + p.cx, y + p.cy])),
        fill: 'none',
        stroke: COL[p.color],
        'stroke-width': 4,
        'stroke-linecap': 'round',
      },
      g,
    )
    void anim(0.9, (q) => {
      g.style.opacity = String(1 - q)
      g.setAttribute('transform', `translate(${p.cx} ${p.cy}) scale(${1 + q * 0.22}) translate(${-p.cx} ${-p.cy})`)
    }).then(() => g.remove())
  }

  /* ---- written lines ---- */
  const opBand =
    (W: BandWrite): Op =>
    async () => {
      if (W.dead) return
      await draw(W.box, 0.6, COL[W.color])
      if (W.fill) {
        W.box.setAttribute('fill', COL[W.color])
        W.box.setAttribute('fill-opacity', '0.07')
      }
      await reveal(W.t, COL[W.color])
    }
  const opStack =
    (W: StackWrite): Op =>
    async () => {
      if (W.dead) return
      await draw(W.dot, 0.2, COL[W.color])
      for (const t of W.lines) await reveal(t, COL[W.color])
    }

  /* ---- flow nodes: labelled ovals that glide to new places as more are added ---- */
  const nodeEdge = (a: FlowNode, b: FlowNode): Pt => {
    const dx = b.cx - a.cx
    const dy = b.cy - a.cy
    const d = Math.hypot(dx, dy) || 1
    const ux = dx / d
    const uy = dy / d
    const q = 1 / Math.hypot(ux / RX, uy / RY) + 10
    return [a.cx + ux * q, a.cy + uy * q]
  }
  function placeArrow(r: FlowArrow) {
    const [x1, y1] = nodeEdge(r.a, r.b)
    const [x2, y2] = nodeEdge(r.b, r.a)
    const mx = (x1 + x2) / 2 - (y2 - y1) * 0.12
    const my = (y1 + y2) / 2 + (x2 - x1) * 0.12
    const ang = Math.atan2(y2 - my, x2 - mx)
    const h = 17
    r.el.setAttribute(
      'd',
      `M${f(x1)} ${f(y1)}Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}` +
        `M${f(x2 - h * Math.cos(ang - 0.5))} ${f(y2 - h * Math.sin(ang - 0.5))}L${f(x2)} ${f(y2)}L${f(x2 - h * Math.cos(ang + 0.5))} ${f(y2 - h * Math.sin(ang + 0.5))}`,
    )
    if (r.label) {
      r.label.e.setAttribute('x', String(mx))
      r.label.e.setAttribute('y', String(my - 8))
    }
  }
  /** Move every node's target, then let the frame loop glide them there. */
  function layoutNodes(b: Board) {
    const list = [...b.nodes.values()]
    flowPositions(list.length).forEach(([x, y], i) => {
      list[i].tx = x
      list[i].ty = y
    })
  }
  /** One frame of the glide: nodes ease towards their targets and arrows follow. */
  function stepFlow(b: Board, dt: number) {
    for (const n of b.nodes.values()) {
      if (!n.g) continue
      n.cx += (n.tx - n.cx) * Math.min(1, dt * 7)
      n.cy += (n.ty - n.cy) * Math.min(1, dt * 7)
      n.g.setAttribute('transform', `translate(${f(n.cx)} ${f(n.cy)})`)
    }
    for (const r of b.arrows) placeArrow(r)
  }
  const opNode =
    (b: Board, n: FlowNode): Op =>
    async () => {
      layoutNodes(b)
      n.cx = n.tx
      n.cy = n.ty
      const g = el('g', { transform: `translate(${f(n.cx)} ${f(n.cy)})` }, b.g)
      n.g = g
      const p = mkPath(g, loopD(RX, RY, n.id), n.color, 4)
      p.style.opacity = '1'
      await anim(0.7, (q) => {
        const e = ink.ease(q)
        p.setAttribute('stroke-dashoffset', String(1 - e))
        const pt = p.getPointAtLength(p.getTotalLength() * e)
        penTo(pt.x + n.cx, pt.y + n.cy, n.color)
      })
      p.setAttribute('stroke-dasharray', 'none')
      p.removeAttribute('stroke-dashoffset')
      await reveal(mkText(b.clips, g, n.label, 0, 12, 34, n.color, 'middle', { weight: 700, maxW: 200 }), n.color)
      if (n.note) await reveal(mkText(b.clips, g, n.note, 0, 92, 25, COL.ink, 'middle', { maxW: 260 }), n.color)
    }
  const opNodeArrow =
    (b: Board, from: string, to: string, label: string): Op =>
    async () => {
      const A = b.nodes.get(from)
      const Z = b.nodes.get(to)
      if (!A || !Z) return
      const r: FlowArrow = { a: A, b: Z, el: mkPath(b.g, 'M0 0', A.color, 3.5), label: null }
      b.arrows.push(r)
      placeArrow(r)
      await draw(r.el, 0.6, A.color)
      if (label) {
        r.label = mkText(b.clips, b.g, label, 0, 0, 26, COL.ink, 'middle')
        placeArrow(r)
        await reveal(r.label)
      }
    }

  /* ---- chart ---- */
  const opChart =
    (b: Board, rec: Chart): Op =>
    async () => {
      const root = el('g', {}, b.g)
      const color = COL[rec.color]
      const { labels, values } = rec
      const n = values.length
      const max = Math.max(...values, 0.001)
      const plot = { l: 160, r: 1100, t: 200, b: 530 }
      const colX = (i: number) => plot.l + ((i + 0.5) * (plot.r - plot.l)) / n
      await draw(mkPath(root, `M${plot.l} ${plot.t}L${plot.l} ${plot.b}L${plot.r} ${plot.b}`, COL.ink, 3), 0.5)
      await reveal(mkText(b.clips, root, Number.isInteger(max) ? String(max) : max.toFixed(1), plot.l - 14, plot.t + 18, 24, COL.ink, 'end'))
      if (rec.kind === 'line') {
        const pts: Pt[] = values.map((v, i) => [colX(i), plot.b - (v / max) * (plot.b - plot.t - 24)])
        const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + f(x) + ' ' + f(y)).join('')
        await draw(mkPath(root, d, color, 4), 0.9)
        for (const [x, y] of pts) await draw(mkPath(root, circ(x, y, 6), color, 3), 0.2)
      } else {
        const slot = (plot.r - plot.l) / n
        for (let i = 0; i < n; i++) {
          const bw = slot * 0.52
          const x = plot.l + i * slot + (slot - bw) / 2
          const y = plot.b - (values[i] / max) * (plot.b - plot.t - 30)
          await draw(mkPath(root, `M${f(x)} ${f(plot.b)}L${f(x)} ${f(y)}L${f(x + bw)} ${f(y)}L${f(x + bw)} ${f(plot.b)}`, color, 4), 0.4)
        }
      }
      for (let i = 0; i < n; i++) await reveal(mkText(b.clips, root, labels[i], colX(i), plot.b + 40, n > 6 ? 20 : 28, COL.ink, 'middle'))
    }

  return {
    buildTitle,
    buildFigure,
    opTitle,
    fetchIcon,
    buildPart,
    opPart,
    buildPhoto,
    opPhoto,
    buildCallout,
    opCallout,
    buildLink,
    opLink,
    highlightPath,
    pulse,
    opBand,
    opStack,
    stepFlow,
    opNode,
    opNodeArrow,
    opChart,
  }
}
