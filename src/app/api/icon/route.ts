import { NextResponse } from 'next/server'
import svgpath from 'svgpath'

export const dynamic = 'force-dynamic'

// Picture lookup for words the built-in icon set does not know. Iconify (api.iconify.design) searches about 200 open icon sets.
// Only sets with permissive licences (MIT / Apache / ISC) and a line-drawing style are used, best-looking first.
const SETS = ['tabler', 'ph', 'iconoir', 'mdi', 'healthicons', 'material-symbols', 'carbon']
const DECORATED = /(bold|fill|filled|duotone|light|thin|broken|solid|sharp|rounded|24px|off|plus|minus|-[0-9]+)(-|$)/

type Hit = { name: string; strokes: string[] }
const cache = new Map<string, Hit | null>()

const num = (v: string | undefined): number => +(v ?? '') || 0
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`

function shapeD(tag: string, a: Record<string, string>): string {
  switch (tag) {
    case 'path':
      return a.d || ''
    case 'circle':
      return ell(num(a.cx), num(a.cy), num(a.r), num(a.r))
    case 'ellipse':
      return ell(num(a.cx), num(a.cy), num(a.rx), num(a.ry))
    case 'line':
      return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`
    case 'polyline':
    case 'polygon': {
      const p = (a.points || '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
      let d = ''
      for (let i = 0; i + 1 < p.length; i += 2) d += (i ? 'L' : 'M') + p[i] + ' ' + p[i + 1]
      return tag === 'polygon' ? d + 'Z' : d
    }
    case 'rect': {
      const x = num(a.x),
        y = num(a.y),
        w = num(a.width),
        h = num(a.height)
      return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
    }
    default:
      return ''
  }
}

/** Icon body (SVG inner markup) -> absolute M/L/C/Q/Z strokes in a 24x24 box, or null if it needs features we do not draw. */
function toStrokes(body: string, w: number, h: number): string[] | null {
  if (/<(mask|clipPath|defs|use|image|text|style)\b|<g[^>]*transform/i.test(body)) return null
  const out: string[] = []
  for (const m of body.matchAll(/<(path|circle|ellipse|line|polyline|polygon|rect)\b([^>]*?)\/?>/gi)) {
    const a: Record<string, string> = {}
    for (const k of m[2].matchAll(/([\w:-]+)="([^"]*)"/g)) a[k[1]] = k[2]
    if (a.stroke === 'none' && a.fill === 'none') continue
    if (a.opacity && +a.opacity < 0.5) continue
    const d = shapeD(m[1].toLowerCase(), a)
    if (!d || /^M0 0h24v24H0z$/i.test(d)) continue
    let p = svgpath(d)
    if (a.transform) p = p.transform(a.transform)
    const norm = p
      .abs()
      .unshort()
      .unarc()
      .scale(24 / w, 24 / h)
      .iterate((seg, _i, x, y) => (seg[0] === 'H' ? [['L', seg[1], y]] : seg[0] === 'V' ? [['L', x, seg[1]]] : undefined))
      .round(1)
      .toString()
    out.push(...norm.split(/(?=M)/).filter(Boolean))
  }
  const size = out.reduce((n, s) => n + s.length, 0)
  return out.length && size < 7000 ? out : null
}

async function lookup(q: string): Promise<Hit | null> {
  const slug = q.toLowerCase().replace(/[\s_]+/g, '-')
  const r = await fetch('https://api.iconify.design/search?limit=40&prefixes=' + SETS.join(',') + '&query=' + encodeURIComponent(q), {
    signal: AbortSignal.timeout(4000),
  })
  const j = (await r.json()) as { icons?: string[] }
  const ranked = (j.icons || [])
    .map((id) => {
      const [prefix, name] = id.split(':')
      const rel = name === slug ? 0 : name.startsWith(slug) ? 1 : name.includes(slug) ? 2 : 3
      const bare = DECORATED.test(name.replace(slug, '')) && name !== slug ? 4 : 0
      return { id, prefix, name, score: (rel + bare) * 10 + SETS.indexOf(prefix) }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
  for (const c of ranked) {
    const res = await fetch(`https://api.iconify.design/${c.prefix}.json?icons=${encodeURIComponent(c.name)}`, { signal: AbortSignal.timeout(4000) })
    const set = (await res.json()) as { width?: number; height?: number; icons?: Record<string, { body: string; width?: number; height?: number }> }
    const icon = set.icons?.[c.name]
    if (!icon) continue
    const strokes = toStrokes(icon.body, icon.width || set.width || 24, icon.height || set.height || 24)
    if (strokes) return { name: c.id, strokes }
  }
  return null
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().replace(/-/g, ' ').slice(0, 60)
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })
  try {
    if (cache.size > 1000) cache.clear()
    if (!cache.has(q)) cache.set(q, await lookup(q))
    const hit = cache.get(q)
    return hit ? NextResponse.json(hit) : NextResponse.json({ error: 'no icon' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
