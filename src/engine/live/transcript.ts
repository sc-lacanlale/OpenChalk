// The chat panel and the live caption under the board.

const BUBBLE = {
  you: 'm-0 max-w-[88%] self-end rounded-[18px_18px_4px_18px] bg-[#0071e3] px-3.5 py-2.5 text-white',
  ai: 'm-0 max-w-[88%] self-start rounded-[18px_18px_18px_4px] border border-[#e8e8ed] bg-white px-3.5 py-2.5',
  sys: 'm-0 self-start p-0 text-xs text-[#6e6e73]',
} as const
export type Speaker = keyof typeof BUBBLE

/** Transcripts sometimes start with a stray "text" token ("textHello"). */
const spoken = (t: string) => String(t || '').replace(/^text(?=[A-Z])/, '')

/**
 * The student's speech transcript arrives as overlapping, sometimes repeated, chunks.
 * Given everything heard so far, returns the new text to show (or null) and the updated history.
 */
export function foldHeard(heard: string, raw: string): { heard: string; add: string | null } {
  let t = spoken(raw).replace(/\s+/g, ' ')
  const compact = t.trim()
  if (!compact || compact === heard || (heard && heard.endsWith(compact))) return { heard, add: null }
  if (heard && compact.startsWith(heard)) t = compact.slice(heard.length)
  else {
    t = compact
    // shortcut: collapses an immediate repeated phrase. A deliberate repeat of 8+ characters is collapsed too.
    const dup = t.match(/^(.{8,}?)\1(.*)$/)
    if (dup) t = (dup[1] + dup[2]).replace(/\s+/g, ' ').trim()
  }
  if (!t.trim()) return { heard, add: null }
  if (!heard) t = t.trim()
  else if (!/^\s/.test(t)) t = ' ' + t
  return { heard: (heard + t).replace(/\s+/g, ' ').trim(), add: t }
}

/** The last sentence of what has been spoken so far, at most 160 characters. */
export function captionText(text: string): string {
  const bits = spoken(text)
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
  const last = bits.length ? bits[bits.length - 1] : spoken(text).trim()
  return last.length > 160 ? last.slice(-160).replace(/^\S*\s/, '') : last
}

/** `clock` is the speaker's audio clock, so captions appear when the words are heard rather than when they arrive. */
export function createTranscript(log: HTMLElement, cap: HTMLElement, clock: () => { now: number; end: number } | null) {
  let open: { you: HTMLParagraphElement | null; ai: HTMLParagraphElement | null } = { you: null, ai: null }
  let heard = ''
  const cues: { at: number; text: string }[] = []
  let raf = 0

  const say = (who: Speaker, text: string) => {
    const p = document.createElement('p')
    p.className = BUBBLE[who]
    p.textContent = text
    log.appendChild(p)
    log.scrollTop = log.scrollHeight
    return p
  }
  /** Append to the open bubble for this speaker, starting one if needed. */
  const append = (who: 'you' | 'ai', text: string) => {
    const node = (open[who] ??= say(who, who === 'you' ? 'You: ' : 'Board: '))
    node.textContent += text
    log.scrollTop = log.scrollHeight
  }

  function paint() {
    raf = 0
    const c = clock()
    if (!c) return
    let text = ''
    for (const e of cues) if (e.at <= c.now + 0.05) text += e.text
    cap.textContent = captionText(text)
    if (cues.some((e) => e.at > c.now + 0.05)) raf = requestAnimationFrame(paint)
  }
  function clearCaption() {
    cues.length = 0
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    cap.textContent = ''
  }

  return {
    say,
    clearCaption,
    clearLog: () => log.replaceChildren(),
    /** A chunk of the student's speech transcript. */
    you(raw: string) {
      const r = foldHeard(heard, raw)
      heard = r.heard
      if (r.add) append('you', r.add)
    },
    /** A chunk of the tutor's speech: into the chat now, onto the caption when it is heard. */
    ai(chunk: string) {
      append('ai', chunk)
      const c = clock()
      // A new sentence after a pause starts a fresh caption.
      if (c && cues.length && cues[cues.length - 1].at < c.now - 0.2 && c.end <= c.now + 0.05) cues.length = 0
      // shortcut: cued before this message's audio is scheduled. A transcript that arrives after its audio shows late.
      cues.push({ at: c ? Math.max(c.end, c.now) : 0, text: spoken(chunk) })
      if (!raf) raf = requestAnimationFrame(paint)
    },
    /** The next tutor speech starts a new bubble (after an interruption or a tap). */
    breakAi() {
      open.ai = null
    },
    endTurn() {
      open = { you: null, ai: null }
    },
    /** Forget the student's speech history (a new session). */
    reset() {
      heard = ''
      clearCaption()
    },
  }
}
export type Transcript = ReturnType<typeof createTranscript>
