// The board engine. The model never sends coordinates: it asks for semantic pieces (a titled board, a picture with a
// label, a keypoint, an arrow) and this file decides where they go, records them, and queues their drawing so the pen
// moves in time with the voice. Every tool returns what is now on the board plus one line of coaching.
import { circ, clamp, distToSeg, parsePath, toD, wobble } from '../path'
import { resolvePicture, suggest } from '../pictures'
import type { BoardApi, ToolArgs, ToolResult } from '../types'
import { arg, cleanId, list, shorten, str } from './args'
import { boardLines, hint, stageOf as lessonStage } from './coach'
import { createInk } from './ink'
import {
  BAND_Y,
  DIAGRAM,
  FIGURES,
  RX,
  RY,
  SIZES,
  SLOTS,
  SPLIT_ORDER,
  SPLIT_SLOTS,
  STACK,
  maxParts,
  normSlot,
  orderOf,
  slotXY,
  slotsOf,
  stageOf,
  type Layout,
} from './layout'
import { createPieces, type Op, type PartSpec } from './pieces'
import {
  bandItems,
  freshBoard,
  stackRows,
  type BandWrite,
  type Board,
  type Chart,
  type FlowNode,
  type IconHit,
  type Link,
  type Part,
  type StackWrite,
} from './state'
import { AUTO, COL, pickColor, type ColorName } from './style'
import { TOOLS, TOOL_NAMES } from './tools'

type QueuedOp = { run: Op; at: number; keep?: boolean; cancel?: () => void }
type Handler = (a: ToolArgs, at: number) => ToolResult

const PHOTO_URL = '/api/photo?q='

export function createBoard(root: ParentNode): BoardApi {
  const $ = <T extends Element>(sel: string) => {
    const node = root.querySelector<T>(sel)
    if (!node) throw new Error('missing ' + sel)
    return node
  }
  const svg = $<SVGSVGElement>('#board')
  const gInk = $<SVGGElement>('#gInk')
  const gPen = $<SVGGElement>('#gPen')
  const defs = $<SVGDefsElement>('#defs')
  const emptyEl = root.querySelector('#empty')
  const ac = new AbortController()
  let alive = true

  const ink = createInk(svg, gPen, defs)
  const P = createPieces(ink, { signal: ac.signal, photoUrl: PHOTO_URL })
  const fresh = () => freshBoard(ink.el('g', {}, gInk))
  let cur: Board = fresh()

  const free = () => {
    const used = new Set([...cur.parts.values()].map((p) => p.slot).filter(Boolean))
    return orderOf(cur.layout).filter((s) => !used.has(s))
  }
  const ok = (extra: Partial<ToolResult> = {}): ToolResult => ({ ok: true, board: boardLines(cur), free_slots: free(), next: hint(cur), ...extra })
  const err = (error: string): ToolResult => ({ error, board: boardLines(cur), free_slots: free(), next: hint(cur) })
  const withNote = (extra: Partial<ToolResult>, ...notes: string[]) => {
    const note = notes.filter(Boolean).join('; ')
    return ok(note ? { ...extra, note } : extra)
  }

  /* ---- pen queue: ops run one at a time, each no earlier than its `at` time (when the matching words are heard) ---- */
  let queue: QueuedOp[] = []
  let running = false
  let lastAt = 0
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  /** keep: still runs after a barge-in, because the board state already assumes it happened (clearing, erasing). */
  function enqueue(op: Omit<QueuedOp, 'at'>, at: number) {
    const timed = { ...op, at: Math.max(at || 0, lastAt) }
    lastAt = timed.at
    queue.push(timed)
    B.dirty = true
    void pump()
  }
  /** A drawing that a barge-in may drop; `cancel` then removes it from the board state. */
  const later = (run: Op, at: number, cancel: () => void) => enqueue({ run, cancel }, at)
  async function pump() {
    if (running) return
    running = true
    B.busy = true
    while (queue.length && alive) {
      const op = queue[0]
      const wait = op.at - performance.now()
      if (wait > 16) {
        await sleep(wait)
        if (queue[0] !== op) continue
      }
      queue.shift()
      try {
        await op.run()
      } catch (e) {
        console.error('board: drawing failed', e)
      }
    }
    ink.hidePen()
    running = false
    B.busy = false
    lastAt = 0
    B.onIdle?.()
  }
  async function retire(b: Board) {
    await ink.fadeOut(b.g, 0.35)
    b.g.remove()
    b.clips.forEach((c) => c.remove())
  }
  const fadeAway =
    (...gs: (SVGElement | null | undefined)[]) =>
    async () => {
      const live = gs.filter((g): g is SVGElement => !!g)
      await Promise.all(live.map((g) => ink.fadeOut(g, 0.3)))
      live.forEach((g) => g.remove())
    }
  /** Remove a written line now; its fade still runs after a barge-in. */
  function killWrite(id: string, at: number) {
    const w = cur.writes.get(id)
    if (!w) return
    cur.writes.delete(id)
    w.dead = true
    enqueue({ keep: true, run: fadeAway(w.g) }, at)
  }

  /* ---- taps and the flow-node glide ---- */
  svg.addEventListener(
    'click',
    (e) => {
      const hit = (e.target as Element | null)?.closest?.('[data-part]')
      const part = hit ? cur.parts.get(hit.getAttribute('data-part') || '') : undefined
      if (!part) return
      P.pulse(cur, part)
      B.onPick?.({ id: part.id, label: cur.callouts.get(part.id)?.heading || part.name })
    },
    { signal: ac.signal },
  )
  let last = performance.now()
  const tick = (now: number) => {
    if (!alive) return
    P.stepFlow(cur, Math.min(0.1, (now - last) / 1000))
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  /* ---- helpers shared by the tools ---- */
  const hideEmpty = () => emptyEl?.setAttribute('hidden', '')
  /** Tools other than new_board may be called first; start an untitled board rather than fail. */
  const ensureBoard = () => {
    if (cur.started) return ''
    cur.started = true
    cur.kind = 'scene'
    hideEmpty()
    return 'There was no board, so I started one. Call set_title to name it.'
  }
  const sceneOnly = () =>
    cur.kind === 'chart'
      ? 'This board is a chart. Call new_board for a new one.'
      : cur.kind === 'flow'
        ? 'This board is a flow diagram. Call new_board for a new one.'
        : ''
  const partIds = () => [...cur.parts.keys()].join(', ') || 'none yet'

  function addCallout(part: Part, heading: string, note: string, color: ColorName, at: number) {
    const co = P.buildCallout(cur, part, heading, note, color)
    if (!co) return false
    const b = cur
    b.callouts.set(part.id, co)
    later(P.opCallout(co), at, () => {
      b.callouts.delete(part.id)
      co.g.remove()
    })
    return true
  }
  /** Label a new part from its heading/note args. Returns a note for the model when no label was drawn. */
  function labelPart(part: Part, a: ToolArgs, heading: string, at: number) {
    if (!heading) return 'no heading, so no label was drawn. Add one with callout.'
    return addCallout(part, heading, shorten(arg(a, 'note', 'caption', 'description', 'detail'), 52), part.color, at) ? '' : 'no room for another label'
  }

  /** The slot the model asked for, or the nearest free one that no label arrow runs through. */
  function chooseSlot(asked: string): { slot: string; note: string } {
    const split = cur.layout === 'split'
    const table = slotsOf(cur.layout)
    const open = free()
    let want = normSlot(asked)
    if (split && want && !table[want]) {
      const [wx, wy] = SLOTS[want]
      want = SPLIT_ORDER.slice().sort(
        (p, q) => Math.hypot(SPLIT_SLOTS[p][0] - wx, SPLIT_SLOTS[p][1] - wy) - Math.hypot(SPLIT_SLOTS[q][0] - wx, SPLIT_SLOTS[q][1] - wy),
      )[0]
    }
    if (want && open.includes(want)) return { slot: want, note: '' }
    const arrowHits = (s: string) => {
      const xy = slotXY(cur.layout, s)
      let n = 0
      cur.callouts.forEach((c) => {
        if (c.seg && distToSeg(xy, c.seg[0], c.seg[1]) < 70) n += 1
      })
      return n
    }
    const [wx, wy] = want ? table[want] : [0.5, 0.5]
    const cost = (s: string) => (want ? Math.hypot(table[s][0] - wx, table[s][1] - wy) * 100 : orderOf(cur.layout).indexOf(s) * 12) + arrowHits(s) * 60
    const slot = open.slice().sort((p, q) => cost(p) - cost(q))[0] || ''
    return { slot, note: want && slot ? want + ' was taken, used ' + slot : '' }
  }

  /** part, sketch and photo share placement, sizing, colour and labelling. */
  function placePicture(kind: 'part' | 'sketch' | 'photo', a: ToolArgs, at: number): ToolResult {
    const notes = [ensureBoard()]
    const bad = sceneOnly()
    if (bad) return err(bad)
    if (kind === 'photo' && [...cur.parts.values()].filter((p) => p.photo).length >= 2) return err('Max 2 photos per board. Use part for the rest.')
    if (cur.parts.size >= maxParts(cur.layout)) return err('The board has ' + cur.parts.size + ' parts, which is full. Call new_board for the next topic.')
    const want = str(arg(a, 'id', 'name_id'))
    const id = cleanId(want, 'p' + ++cur.pid, new Set(cur.parts.keys()))
    if (want && id !== want) notes.push('id "' + want + '" was taken or invalid, used "' + id + '"')

    let pic: { name: string; strokes: string[]; space: number }
    let lookup: Promise<IconHit | null> | null = null
    if (kind === 'photo') {
      const q = shorten(arg(a, 'query', 'what', 'search', 'name'), 60)
      if (!q) return err('query is required: 2 to 4 search words, e.g. "rainforest canopy"')
      pic = { name: q, strokes: [], space: 24 }
    } else if (kind === 'sketch') {
      const strokes = String(arg(a, 'strokes', 'paths') || '')
        .split('||')
        .map((s) =>
          s
            .trim()
            .replace(/^[a-z]+\|?[\d.]*\|/i, '')
            .trim(),
        )
        .filter(Boolean)
      if (!strokes.length || strokes.length > 10) return err('strokes: 1 to 10 SVG paths separated by ||, drawn in a 0-100 box')
      for (const d of strokes) {
        if (!/^[Mm]/.test(d) || !/^[MmLlHhVvCcSsQqTtZz0-9eE.,\s+-]+$/.test(d))
          return err('each stroke must be a path using only M L H V C S Q T Z, no arcs (A)')
      }
      pic = { name: 'sketch', strokes, space: 100 }
    } else {
      const found = resolvePicture(arg(a, 'what', 'icon', 'name', 'picture', 'draw', 'shape'))
      const word = str(arg(a, 'what', 'icon', 'name', 'picture', 'draw'))
      // A loose stand-in or a plain blob gets replaced if the icon library has something better.
      if ((found.approx || found.guessed) && word) lookup = P.fetchIcon(word)
      if (found.guessed) {
        notes.push(
          'no built-in picture for "' +
            word +
            '", so I am searching a bigger icon library. If nothing fits, a plain shape stays and the label carries the meaning. (Close words: ' +
            (suggest(word).join(', ') || 'none') +
            '.)',
        )
      }
      pic = found
    }

    const split = cur.layout === 'split'
    const asked = str(arg(a, 'at', 'place', 'slot', 'position', 'where'))
    const xy = asked.match(/^(\d{1,3})\s*[, ]\s*(\d{1,3})$/)
    let slot = ''
    let cx: number
    let cy: number
    if (xy && !split) {
      const s = stageOf(cur.layout)
      cx = s.x + (clamp(+xy[1], 8, 92) / 100) * s.w
      cy = s.y + (clamp(+xy[2], 8, 92) / 100) * s.h
    } else {
      const choice = chooseSlot(asked)
      if (!choice.slot) return err('no free slot')
      slot = choice.slot
      notes.push(choice.note)
      ;[cx, cy] = slotXY(cur.layout, slot)
    }
    const base = SIZES[str(arg(a, 'size')).toLowerCase()] || SIZES.m
    const size =
      kind === 'photo'
        ? DIAGRAM.test(pic.name)
          ? split
            ? 260
            : 360
          : split
            ? 140
            : 150
        : split
          ? Math.round(base * 1.15)
          : cur.figure
            ? base
            : Math.round(base * 1.3)
    const color = pickColor(arg(a, 'color')) || AUTO[cur.colorIdx++ % AUTO.length]
    const spec: PartSpec = {
      id,
      name: pic.name,
      strokeDs: pic.strokes,
      space: pic.space,
      slot,
      cx,
      cy,
      size,
      color,
      label: shorten(arg(a, 'label', 'caption_under'), 26),
      lookup,
    }

    const b = cur
    let part: Part
    if (kind === 'photo') {
      part = P.buildPhoto(b, spec)
      later(P.opPhoto(b, part), at, () => {
        b.parts.delete(id)
        part.g.remove()
      })
    } else {
      part = P.buildPart(b, spec)
      if (!part.strokes.length) {
        part.g.remove()
        return err('that picture could not be drawn. Try another word.')
      }
      later(P.opPart(part), at, () => {
        b.parts.delete(id)
        part.g.remove()
      })
    }
    b.parts.set(id, part)
    b.hist.push(id)
    const heading = shorten(arg(a, 'heading', 'text', 'title', ...(kind === 'photo' ? [] : ['label_text']), 'label'), 22, 3)
    notes.push(labelPart(part, a, heading, at))
    return withNote({ id }, ...notes)
  }

  /** Keypoint in the left-hand stack of a split board. */
  function writeStack(a: ToolArgs, text: string, at: number): ToolResult {
    const lines = ink.wrap(text, STACK.size, 500, STACK.maxW, STACK.maxLines)
    const rows = stackRows(cur)
    if (rows + lines.length > STACK.maxRows) return err('The notes area is full. Call new_board for the next topic.')
    const id = 'l' + ++cur.seq
    const b = cur
    const g = ink.el('g', { 'data-id': id }, b.g)
    const color = pickColor(arg(a, 'color')) || AUTO[(b.writes.size + 1) % AUTO.length]
    const W: StackWrite = {
      text,
      g,
      rows: lines.length,
      band: false,
      style: 'line',
      color,
      dead: false,
      lines: lines.map((ln, i) =>
        ink.mkText(b.clips, g, ln, STACK.x, STACK.y0 + (rows + i) * STACK.step, STACK.size, COL[color], 'start', { weight: 500, maxW: STACK.maxW }),
      ),
      dot: ink.mkPath(g, circ(STACK.dotX, STACK.y0 + rows * STACK.step - STACK.size * 0.28, 6), COL[color], 3.5),
    }
    b.writes.set(id, W)
    b.hist.push(id)
    later(P.opStack(W), at, () => {
      b.writes.delete(id)
      g.remove()
    })
    return ok({ id })
  }

  /** Note, takeaway or question in one of the two rows along the bottom. When both are used, the oldest goes. */
  function writeBand(style: BandWrite['style'], text: string, color: ColorName, at: number, startNote: string): ToolResult {
    const id = style === 'note' ? 'n' + ++cur.seq : style
    let row: number | undefined
    let evicted = ''
    const existing = cur.writes.get(id)
    if (existing?.band) {
      row = existing.row
      killWrite(id, at)
    } else {
      const used = new Set(bandItems(cur).map(([, w]) => w.row))
      row = [0, 1].find((r) => !used.has(r))
      if (row === undefined) {
        const [oldId, old] = bandItems(cur).sort((x, y) => x[1].seq - y[1].seq)[0]
        row = old.row
        evicted = old.text
        killWrite(oldId, at)
      }
    }
    const b = cur
    const y = BAND_Y[row]
    const g = ink.el('g', { 'data-id': id }, b.g)
    const left = style === 'note'
    const t = ink.mkText(b.clips, g, style === 'question' ? 'Your turn: ' + text : text, left ? 100 : 600, y, 34, COL[color], left ? 'start' : 'middle', {
      weight: 700,
      maxW: left ? 1040 : 1000,
    })
    const { bb } = t
    const pad = 22
    const outline = left
      ? circ(78, y - 11, 6)
      : `M${bb.x - pad} ${bb.y - 1}L${bb.x + bb.width + pad} ${bb.y - 1}L${bb.x + bb.width + pad} ${bb.y + bb.height + 1}L${bb.x - pad} ${bb.y + bb.height + 1}Z`
    const box = ink.mkPath(g, toD(wobble(parsePath(outline), { amp: left ? 0.4 : 1.2, wl: 90, seed: 'bd' + id })), COL[color], left ? 3.5 : 3)
    const W: BandWrite = { text, g, box, t, band: true, style, row, seq: ++b.seq, color, fill: !left, dead: false }
    b.writes.set(id, W)
    if (style === 'question') b.asked++
    b.hist.push(id)
    later(P.opBand(W), at, () => {
      b.writes.delete(id)
      g.remove()
    })
    const note = [startNote, evicted ? 'The two bottom rows were full, so "' + evicted + '" was removed. Say it out loud instead.' : '']
      .filter(Boolean)
      .join(' ')
    return ok(note ? { id, note } : { id })
  }

  /* ---- the tools ---- */
  const tools: Record<(typeof TOOL_NAMES)[number], Handler> = {
    new_board(a, at) {
      const title = shorten(arg(a, 'title', 'text', 'name', 'topic'), 40)
      if (!title) return err('title is required')
      let shape = str(arg(a, 'figure', 'outline', 'shape')).toLowerCase() || 'none'
      if (!FIGURES.includes(shape)) shape = 'none'
      // Keypoints need a column, so split unless they asked for a diagram or an outline figure.
      const asked = str(arg(a, 'layout')).toLowerCase()
      const layout: Layout = asked === 'diagram' || (asked !== 'split' && shape !== 'none') ? 'diagram' : 'split'
      const note = layout === 'split' && shape !== 'none' ? 'split boards have no outline figure' : ''
      if (note) shape = 'none'
      const prev = cur
      cur = fresh()
      Object.assign(cur, { started: true, kind: 'scene', layout, title, subtitle: shorten(arg(a, 'subtitle', 'tagline'), 70) })
      hideEmpty()
      const T = P.buildTitle(cur, title, cur.subtitle)
      const fig = shape === 'none' ? null : P.buildFigure(cur, shape, shorten(arg(a, 'figure_label', 'figureLabel', 'caption'), 28))
      cur.figure = fig
      cur.titleG = T.g
      enqueue(
        {
          keep: true,
          run: async () => {
            await retire(prev)
            await P.opTitle(T, fig)()
          },
        },
        at,
      )
      return ok(note ? { note } : {})
    },

    set_title(a, at) {
      const note = ensureBoard()
      const title = shorten(arg(a, 'title', 'text', 'name'), 40)
      if (!title) return err('title is required')
      const b = cur
      const old = b.titleG
      b.title = title
      b.subtitle = shorten(arg(a, 'subtitle', 'tagline'), 70)
      const T = P.buildTitle(b, title, b.subtitle)
      b.titleG = T.g
      enqueue(
        {
          keep: true,
          run: async () => {
            if (old) await fadeAway(old)()
            await P.opTitle(T, null)()
          },
        },
        at,
      )
      return ok(note ? { note } : {})
    },

    part: (a, at) => placePicture('part', a, at),
    sketch: (a, at) => placePicture('sketch', a, at),
    photo: (a, at) => placePicture('photo', a, at),

    callout(a, at) {
      ensureBoard()
      const bad = sceneOnly()
      if (bad) return err(bad)
      const p = cur.parts.get(str(arg(a, 'target', 'id', 'part')))
      if (!p) return err('target must be an existing part id: ' + partIds())
      const heading = shorten(arg(a, 'heading', 'text', 'label', 'title'), 22, 3)
      if (!heading) return err('heading is required')
      const old = cur.callouts.get(p.id)
      if (old) {
        cur.callouts.delete(p.id)
        enqueue({ keep: true, run: fadeAway(old.g) }, at)
      }
      const added = addCallout(p, heading, shorten(arg(a, 'note', 'caption', 'description'), 52), pickColor(arg(a, 'color')) || p.color, at)
      return added ? ok() : err('no room for another label (max 8). Erase one or start a new board.')
    },

    link(a, at) {
      ensureBoard()
      const bad = sceneOnly()
      if (bad) return err(bad)
      const A = cur.parts.get(str(arg(a, 'from', 'a', 'source', 'start')))
      const Z = cur.parts.get(str(arg(a, 'to', 'b', 'target', 'end')))
      if (!A || !Z) return err('from and to must be existing part ids: ' + partIds())
      if (A === Z) return err('from and to must be different parts')
      const L: Link = P.buildLink(cur, A, Z, shorten(arg(a, 'label', 'text'), 18), pickColor(arg(a, 'color')) || A.color)
      const b = cur
      b.links.push(L)
      later(P.opLink(L), at, () => {
        b.links = b.links.filter((k) => k !== L)
        L.g.remove()
      })
      return ok()
    },

    highlight(a, at) {
      ensureBoard()
      const target = str(arg(a, 'target', 'id', 'part'))
      const kind = ['circle', 'underline', 'check'].includes(str(a.kind)) ? str(a.kind) : 'circle'
      const p = cur.parts.get(target)
      const n = cur.nodes.get(target)
      if (!p && !n) {
        // The model often names a part by its heading or picture word; fall back to the newest part.
        const key = target.toLowerCase()
        const all = [...cur.parts.values()]
        const hit =
          all.find(
            (q) => q.id.toLowerCase() === key || q.name.toLowerCase().includes(key) || (cur.callouts.get(q.id)?.heading || '').toLowerCase().includes(key),
          ) || (cur.nodes.size ? null : all[all.length - 1])
        if (hit) return tools.highlight({ ...a, target: hit.id }, at)
        return err('target must be an existing part or node id: ' + ([...cur.parts.keys(), ...cur.nodes.keys()].join(', ') || 'none yet'))
      }
      const [cx, cy, rx, ry] = p
        ? [p.cx, p.cy - p.size * 0.05, p.photo ? p.photo.w * 0.62 : p.size * 0.54, p.photo ? p.photo.h * 0.66 : p.size * 0.54]
        : [n!.tx, n!.ty, RX + 22, RY + 14]
      const c = COL[pickColor(arg(a, 'color')) || 'red']
      const g = ink.el('g', {}, cur.g)
      const path = ink.mkPath(g, P.highlightPath(kind, cx, cy, rx, ry, 'hl' + target), c, 4.5)
      later(
        () => ink.draw(path, 0.6, c),
        at,
        () => g.remove(),
      )
      return ok()
    },

    write(a, at) {
      const startNote = ensureBoard()
      const raw = str(arg(a, 'style', 'kind', 'type'))
      const style = raw === 'takeaway' || raw === 'question' ? raw : 'note'
      const text = shorten(arg(a, 'text', 'line', 'content'), style === 'question' ? 90 : 100)
      if (!text) return err('text is required')
      if (style === 'note' && cur.kind === 'scene' && cur.layout === 'split') return writeStack(a, text, at)
      const color = pickColor(arg(a, 'color')) || (style === 'takeaway' ? 'green' : style === 'question' ? 'orange' : 'teal')
      return writeBand(style, text, color, at, startNote)
    },

    chart(a, at) {
      const note = ensureBoard()
      if (cur.parts.size || cur.figure || cur.nodes.size || cur.chart || stackRows(cur)) return err('This board is not empty. Call new_board, then chart.')
      const kind = str(a.kind).toLowerCase() === 'line' ? 'line' : 'bar'
      const labels = list(a.labels)
      const values = (Array.isArray(a.values) ? a.values : String(a.values || '').split(/[|,]/)).map((s) => Number(String(s).trim()))
      if (labels.length < 2 || labels.length > 8) return err('a chart needs 2 to 8 labels')
      if (values.length !== labels.length || values.some((v) => !Number.isFinite(v) || v < 0))
        return err('values must be one zero-or-positive number per label')
      const short = labels.map((s) => shorten(s, 12))
      const chart: Chart = {
        kind,
        labels: short,
        values,
        color: pickColor(arg(a, 'color')) || 'blue',
        desc: kind + ' ' + short.map((s, i) => s + ' ' + values[i]).join(', '),
      }
      const b = cur
      b.kind = 'chart'
      b.chart = chart
      later(P.opChart(b, chart), at, () => {
        b.chart = null
        b.kind = 'scene'
      })
      return ok(note ? { note } : {})
    },

    add_node(a, at) {
      const note = ensureBoard()
      if (cur.parts.size || cur.figure || cur.chart || stackRows(cur)) return err('This board is not a flow. Call new_board, then add_node.')
      if (cur.nodes.size >= 8) return err('The board is full (8 nodes). Call new_board.')
      const label = shorten(arg(a, 'label', 'text', 'title'), 14, 3)
      if (!label) return err('label is required')
      const id = cleanId(arg(a, 'id'), 'n' + (cur.nodes.size + 1), new Set(cur.nodes.keys()))
      const b = cur
      b.kind = 'flow'
      const n: FlowNode = {
        id,
        label,
        note: shorten(arg(a, 'note', 'caption'), 26),
        color: COL[pickColor(arg(a, 'color')) || AUTO[b.nodes.size % AUTO.length]],
        cx: 600,
        cy: 370,
        tx: 600,
        ty: 370,
        g: null,
      }
      b.nodes.set(id, n)
      later(P.opNode(b, n), at, () => b.nodes.delete(id))
      return ok(note ? { id, note } : { id })
    },

    add_arrow(a, at) {
      const from = str(arg(a, 'from', 'a', 'source'))
      const to = str(arg(a, 'to', 'b', 'target'))
      if (!cur.nodes.has(from) || !cur.nodes.has(to)) return err('from and to must be existing node ids: ' + ([...cur.nodes.keys()].join(', ') || 'none yet'))
      later(P.opNodeArrow(cur, from, to, shorten(arg(a, 'label', 'text'), 16)), at, () => {})
      return ok()
    },

    erase(a, at) {
      const id = str(arg(a, 'id', 'target'))
      const p = cur.parts.get(id)
      if (!p && !cur.writes.has(id))
        return err('no part or written line with that id. Ids: ' + ([...cur.parts.keys(), ...cur.writes.keys()].join(', ') || 'none'))
      if (!p) {
        killWrite(id, at)
        return ok()
      }
      const co = cur.callouts.get(id)
      const links = cur.links.filter((k) => k.from === id || k.to === id)
      cur.parts.delete(id)
      cur.callouts.delete(id)
      cur.links = cur.links.filter((k) => !links.includes(k))
      enqueue({ keep: true, run: fadeAway(p.g, co?.g, ...links.map((k) => k.g)) }, at)
      return ok()
    },
  }

  /* ---- public API ---- */
  const B: BoardApi = {
    dirty: false,
    busy: false,
    onIdle: null,
    onPick: null,
    TOOLS,
    ready:
      typeof document !== 'undefined' && document.fonts?.load
        ? Promise.all([document.fonts.load('700 40px Caveat'), document.fonts.load('500 24px Caveat')]).catch(() => {})
        : Promise.resolve(),

    exec(name, a = {}, at = performance.now()) {
      const args = a && typeof a === 'object' ? a : {}
      const run = (tools as Record<string, Handler | undefined>)[name]
      return run ? run(args, at) : err('unknown tool "' + name + '". Tools: ' + TOOL_NAMES.join(', ') + '.')
    },

    /** Barge-in: drop drawing that has not started. Kept ops (clearing, erasing) still run so the board stays consistent. */
    flush() {
      const kept: QueuedOp[] = []
      for (const op of queue) {
        if (op.keep) kept.push(op)
        else {
          try {
            op.cancel?.()
          } catch (e) {
            console.warn('board: cancel failed', e)
          }
        }
      }
      queue = kept
      lastAt = 0
    },

    summary: () => 'Board right now: ' + boardLines(cur).join('; ') + '.',
    stage: () => lessonStage(cur),

    undo() {
      // shortcut: parts and written lines only; flow nodes and charts need New.
      while (cur.hist.length) {
        const id = cur.hist.pop()!
        if (cur.parts.has(id) || cur.writes.has(id)) {
          tools.erase({ id }, performance.now())
          return true
        }
      }
      return false
    },

    clear() {
      B.flush()
      const prev = cur
      cur = fresh()
      lastAt = 0
      enqueue({ keep: true, run: () => retire(prev) }, performance.now())
      emptyEl?.removeAttribute('hidden')
    },

    /** JPEG of the board for the Save button. Not sent to the model: video input caps a live session at 2 minutes. */
    async snapshot(width = 768) {
      const s = svg.cloneNode(true) as SVGSVGElement
      s.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      s.setAttribute('width', '1200')
      s.setAttribute('height', '700')
      s.querySelector('#gPen')?.remove()
      s.insertBefore(ink.el('rect', { x: 0, y: 0, width: 1200, height: 700, fill: '#fdfcf8' }), s.firstChild)
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s))
      await img.decode()
      const c = document.createElement('canvas')
      c.width = width
      c.height = Math.round((width * 700) / 1200)
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
      B.dirty = false
      return c.toDataURL('image/jpeg', 0.9).split(',')[1]
    },

    destroy() {
      alive = false
      ac.abort()
    },
  }
  return B
}
