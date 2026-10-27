import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-live-preview'
const LIMIT = Number(process.env.TOKENS_PER_HOUR) || 30
const hits = new Map<string, number[]>()

// shortcut: per-instance memory, so the limit is per server process; put a shared store or your host's rate limiting in front for multi-instance deploys.
function allowed(ip: string): boolean {
  const now = Date.now(),
    recent = (hits.get(ip) || []).filter((t) => now - t < 3600e3)
  if (hits.size > 5000) hits.clear()
  if (recent.length >= LIMIT) return false
  hits.set(ip, [...recent, now])
  return true
}

async function mintToken(key: string): Promise<string> {
  const now = Date.now()
  const r = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60e3).toISOString(),
      newSessionExpireTime: new Date(now + 10 * 60e3).toISOString(),
    }),
  })
  const j = (await r.json()) as { name?: string; error?: { message?: string } }
  if (!r.ok || !j.name) throw new Error('Gemini refused the token request: ' + (j.error?.message || r.status))
  return j.name
}

export async function GET(req: Request) {
  // Browsers send Sec-Fetch-Site; refuse other websites trying to spend this key.
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local'
  if (!allowed(ip)) return NextResponse.json({ error: 'Too many sessions started. Try again later.' }, { status: 429 })

  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'The server has no GEMINI_API_KEY. Add it to .env and restart.' }, { status: 500 })
  try {
    if (process.env.ALLOW_RAW_KEY === '1' && process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ kind: 'key', token: key, model: MODEL })
    }
    return NextResponse.json({ kind: 'ephemeral', token: await mintToken(key), model: MODEL })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
