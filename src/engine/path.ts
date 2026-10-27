// Path engine. Everything is normalised to absolute M/L/C/Q/Z so one transform and one wobble cover
// icons, motifs and model-drawn strokes alike.
export type Seg = [string, ...number[]]
export type Pt = [number, number]

export const f = (n: number): string => String(Math.round(n * 10) / 10)
export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x))

export function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2 }

/** Parse any SVG path made of M L H V C S Q T Z (absolute or relative; no arcs) into absolute M/L/C/Q/Z. */
export function parsePath(d: string): Seg[] {
  const segs: Seg[] = []
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0
  let pc: Pt | null = null,
    pq: Pt | null = null
  const re = /([MmLlHhVvCcSsQqTtZz])([^MmLlHhVvCcSsQqTtZz]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) {
    const cmd = m[1],
      rel = cmd >= 'a',
      C = cmd.toUpperCase()
    const nums = (m[2].match(NUM) || []).map(Number)
    if (C === 'Z') {
      segs.push(['Z'])
      cx = sx
      cy = sy
      pc = pq = null
      continue
    }
    const k = ARITY[C]
    if (!nums.length) continue
    for (let i = 0; i + k <= nums.length; i += k) {
      const a = nums.slice(i, i + k),
        ox = rel ? cx : 0,
        oy = rel ? cy : 0
      if (C === 'M') {
        const x = a[0] + ox,
          y = a[1] + oy
        if (i === 0) {
          segs.push(['M', x, y])
          sx = x
          sy = y
        } else segs.push(['L', x, y])
        cx = x
        cy = y
        pc = pq = null
      } else if (C === 'L') {
        const x = a[0] + ox,
          y = a[1] + oy
        segs.push(['L', x, y])
        cx = x
        cy = y
        pc = pq = null
      } else if (C === 'H') {
        const x = a[0] + ox
        segs.push(['L', x, cy])
        cx = x
        pc = pq = null
      } else if (C === 'V') {
        const y = a[0] + oy
        segs.push(['L', cx, y])
        cy = y
        pc = pq = null
      } else if (C === 'C') {
        const p = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy]
        segs.push(['C', ...p])
        pc = [p[2], p[3]]
        pq = null
        cx = p[4]
        cy = p[5]
      } else if (C === 'S') {
        const r: Pt = pc ? [2 * cx - pc[0], 2 * cy - pc[1]] : [cx, cy],
          p = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy]
        segs.push(['C', r[0], r[1], p[0], p[1], p[2], p[3]])
        pc = [p[0], p[1]]
        pq = null
        cx = p[2]
        cy = p[3]
      } else if (C === 'Q') {
        const p = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy]
        segs.push(['Q', ...p])
        pq = [p[0], p[1]]
        pc = null
        cx = p[2]
        cy = p[3]
      } else if (C === 'T') {
        const r: Pt = pq ? [2 * cx - pq[0], 2 * cy - pq[1]] : [cx, cy],
          x = a[0] + ox,
          y = a[1] + oy
        segs.push(['Q', r[0], r[1], x, y])
        pq = r
        pc = null
        cx = x
        cy = y
      }
    }
  }
  return segs
}

export const toD = (segs: Seg[]): string =>
  segs
    .map(
      (s) =>
        s[0] +
        s
          .slice(1)
          .map((n) => f(n as number))
          .join(' '),
    )
    .join('')

export function mapPts(segs: Seg[], fn: (x: number, y: number) => Pt): Seg[] {
  return segs.map((s) => {
    if (s[0] === 'Z') return s
    const o: Seg = [s[0]]
    for (let i = 1; i < s.length; i += 2) {
      const p = fn(s[i] as number, s[i + 1] as number)
      o.push(p[0], p[1])
    }
    return o
  })
}

/** Split long straight lines so the wobble has something to bend. */
export function refine(segs: Seg[], maxLen: number): Seg[] {
  const out: Seg[] = []
  let cx = 0,
    cy = 0,
    sx = 0,
    sy = 0
  for (const s of segs) {
    if (s[0] === 'M') {
      out.push(s)
      cx = sx = s[1] as number
      cy = sy = s[2] as number
    } else if (s[0] === 'L') {
      const x = s[1] as number,
        y = s[2] as number,
        len = Math.hypot(x - cx, y - cy),
        n = Math.max(1, Math.ceil(len / maxLen))
      for (let i = 1; i <= n; i++) out.push(['L', cx + ((x - cx) * i) / n, cy + ((y - cy) * i) / n])
      cx = x
      cy = y
    } else if (s[0] === 'C') {
      out.push(s)
      cx = s[5] as number
      cy = s[6] as number
    } else if (s[0] === 'Q') {
      out.push(s)
      cx = s[3] as number
      cy = s[4] as number
    } else {
      out.push(s)
      cx = sx
      cy = sy
    }
  }
  return out
}

/** Smooth position-based displacement: the same point always moves the same way, so closed shapes stay closed. */
export function wobble(segs: Seg[], o: { amp: number; wl: number; seed: string }): Seg[] {
  const r = rng(o.seed),
    P = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28],
    k = 6.2832 / o.wl
  return mapPts(refine(segs, o.wl * 0.5), (x, y): Pt => [
    x + o.amp * (Math.sin(y * k + P[0]) + 0.6 * Math.sin(x * k * 1.7 + P[1])),
    y + o.amp * (Math.sin(x * k + P[2]) + 0.6 * Math.sin(y * k * 1.7 + P[3])),
  ])
}

export function smoothClosed(pts: Pt[], seed: string, jit = 0): string {
  const r = rng(seed),
    p = pts.map(([x, y]): Pt => [x + (r() - 0.5) * jit, y + (r() - 0.5) * jit]),
    n = p.length,
    g = (i: number) => p[(i + n) % n]
  let d = `M${f(p[0][0])} ${f(p[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = g(i - 1),
      p1 = g(i),
      p2 = g(i + 1),
      p3 = g(i + 2)
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d + 'Z'
}

export function smoothOpen(pts: Pt[]): string {
  const n = pts.length,
    g = (i: number) => pts[Math.max(0, Math.min(n - 1, i))]
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1),
      p1 = g(i),
      p2 = g(i + 1),
      p3 = g(i + 2)
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

export function circ(cx: number, cy: number, r: number): string {
  const k = r * 0.5523,
    n = f
  return `M${n(cx - r)} ${n(cy)}C${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)}C${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)}C${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)}C${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)}Z`
}

/** A hand-drawn loop (for circling things), centred on 0,0. */
export function loopD(rx: number, ry: number, seed: string): string {
  const r = rng(seed),
    off = r() * 6,
    pts: Pt[] = []
  for (let i = 0; i < 14; i++) {
    const a = off + (i / 14) * Math.PI * 2,
      k = 1 + (r() - 0.5) * 0.07
    pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k])
  }
  return smoothClosed(pts, seed, 2.5)
}

export function wavyLine(x1: number, x2: number, y: number, seed: string): string {
  const r = rng(seed),
    n = Math.max(3, Math.round((x2 - x1) / 40)),
    pts: Pt[] = []
  for (let i = 0; i <= n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y + (r() - 0.5) * 5 + (i % 2 ? 1.5 : -1.5)])
  return smoothOpen(pts)
}

/** Distance from point p to segment a-b. */
export function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l2 = dx * dx + dy * dy
  const t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}
