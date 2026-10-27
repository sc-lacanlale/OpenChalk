import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Page = {
  title?: string
  index?: number
  imageinfo?: {
    thumburl?: string
    thumbwidth?: number
    thumbheight?: number
    mime?: string
    descriptionurl?: string
    extmetadata?: Record<string, { value?: string }>
  }[]
}

const strip = (s = '') =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const cache = new Map<string, unknown>()

// Free, keyless photo search (Wikimedia Commons). Only openly licensed images; the credit string is shown on the photo.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 80)
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })
  if (cache.has(q)) return NextResponse.json(cache.get(q))
  // "animal cell diagram", "water cycle", "heart anatomy": Commons has labelled textbook SVGs for these, so let them through.
  const diagram = /diagram|structure|anatomy|cycle|labell?ed|chart|map/i.test(q)
  try {
    const u = new URL('https://commons.wikimedia.org/w/api.php')
    const p: Record<string, string> = {
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: diagram ? q : q + ' filetype:bitmap',
      gsrlimit: '10',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: diagram ? '1000' : '640',
    }
    for (const k in p) u.searchParams.set(k, p[k])
    const r = await fetch(u, { headers: { 'User-Agent': 'OpenChalk/0.1 (educational whiteboard)' }, signal: AbortSignal.timeout(5000) })
    const j = (await r.json()) as { query?: { pages?: Record<string, Page> } }
    // search relevance first; for diagrams prefer the English labels over "_tr.svg", "_es.svg"
    const lang = (t = '') => {
      const m = t.match(/[ _(-]([a-z]{2,3})\)?\.(svg|png)$/i)
      return m ? m[1].toLowerCase() : ''
    }
    const langRank = (t?: string) => (!diagram ? 0 : lang(t) === 'en' ? 0 : lang(t) === '' ? 1 : 2)
    const words = q
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(diagram|labell?ed)$/.test(w))
    const fit = (t = '') => {
      const s = t.toLowerCase()
      return words.filter((w) => s.includes(w)).length * 2 + (/diagram|structure|anatomy|labell?ed/.test(s) ? 1 : 0)
    } // "cell structure" beats "cell cycle" for "cell diagram"
    const pages = Object.values(j.query?.pages || {}).sort(
      (a, b) => langRank(a.title) - langRank(b.title) || (diagram ? fit(b.title) - fit(a.title) : 0) || (a.index ?? 99) - (b.index ?? 99),
    )
    for (const pg of pages) {
      const ii = pg.imageinfo?.[0]
      if (!ii?.thumburl || !(diagram ? /^image\/(jpeg|png|svg\+xml)$/ : /^image\/(jpeg|png)$/).test(ii.mime || '')) continue
      if ((ii.thumbwidth || 0) < 360 || (ii.thumbheight || 0) < 240) continue
      const m = ii.extmetadata || {}
      const out = {
        url: ii.thumburl,
        credit: [strip(m.Artist?.value).slice(0, 28), strip(m.LicenseShortName?.value)].filter(Boolean).join(' · '),
        page: ii.descriptionurl,
      }
      if (cache.size > 1000) cache.clear()
      cache.set(q, out)
      return NextResponse.json(out)
    }
    return NextResponse.json({ error: 'no photo' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
