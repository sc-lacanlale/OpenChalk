// The live session: connects to Gemini Live, streams the mic up and the voice down, passes tool calls to the board,
// handles interruptions and reconnects, and wires up the page controls.
import { promptFor } from '../prompts'
import type { BoardApi } from '../types'
import { createSpeaker, openMic, type Mic } from './audio'
import { argsOf, functionCalls, setupMessage, socketUrl, type LiveMessage, type TokenResponse } from './protocol'
import { createTranscript } from './transcript'

/** Sent when the student stays quiet mid-lesson, so the talk keeps moving. */
const NUDGE = '(Continue the presentation with the next piece. If you have covered everything, give the takeaway and ask what they want to explore next.)'
const NUDGE_AFTER_MS = 3500
const MAX_NUDGES = 8
const MAX_RECONNECTS = 4

function must<T extends Element>(root: ParentNode, sel: string): T {
  const node = root.querySelector<T>(sel)
  if (!node) throw new Error('missing ' + sel)
  return node
}

export function mountSession(root: ParentNode, board: BoardApi): () => void {
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel)
  const statusEl = must<HTMLElement>(root, '#status')
  const goBtn = must<HTMLButtonElement>(root, '#go')
  const mode = must<HTMLSelectElement>(root, '#mode')
  const quick = $('#quick')
  const ac = new AbortController()
  const { signal } = ac

  const speaker = createSpeaker()
  const chat = createTranscript(must(root, '#log'), must(root, '#caption'), () => speaker.clock())
  let ws: WebSocket | null = null
  let mic: Mic | null = null
  let micOn = true
  let resumeHandle = ''
  let userStop = false
  let reconnecting = false
  let reconnects = 0
  /** After a reconnect without a resume handle, the model has to be re-briefed on what is on the board. */
  let reconnectedFresh = false
  /** Text typed or tapped before the session was ready; sent on setupComplete. */
  let pendingText = ''
  let autoOn = true
  let autoTimer = 0
  let autoCount = 0

  const isOpen = () => !!ws && ws.readyState === WebSocket.OPEN
  const send = (o: unknown) => {
    if (isOpen()) ws!.send(JSON.stringify(o))
  }
  const setStatus = (t: string, on?: boolean) => {
    statusEl.textContent = t
    statusEl.classList.toggle('on', !!on)
  }
  /** What is happening right now, so the student knows whether to wait, talk or tap. */
  const phase = (t: string) => {
    if (isOpen()) setStatus(t, true)
  }
  const hideQuick = () => quick?.setAttribute('hidden', '')
  const showQuick = () => {
    if (ws) quick?.removeAttribute('hidden')
  }

  /* ---- auto-continue: if the student stays quiet after the tutor stops, nudge it on. Speaking or typing cancels it. ---- */
  const clearAuto = () => {
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = 0
  }
  const armAuto = (afterMs: number) => {
    clearAuto()
    if (!autoOn || !ws || board.stage() !== 'teaching' || autoCount >= MAX_NUDGES) return
    autoTimer = window.setTimeout(() => {
      autoTimer = 0
      if (!isOpen() || board.stage() !== 'teaching') return
      autoCount++
      send({ realtimeInput: { text: NUDGE } })
    }, afterMs + NUDGE_AFTER_MS)
  }
  /** Once the queued voice has finished playing, it is the student's turn (or the nudge is coming). */
  const settleToYourTurn = () => {
    const wait = speaker.pendingMs()
    armAuto(wait)
    setTimeout(() => {
      if (speaker.pendingMs() <= 50) phase(autoTimer ? 'Next piece coming. Speak to jump in' : 'Your turn. Speak, type or tap')
    }, wait + 150)
  }
  const sendUser = (t: string) => {
    clearAuto()
    autoCount = 0
    send({ realtimeInput: { text: t } })
    hideQuick()
  }
  /** Type, tap a chip, or tap the board: if not connected yet, connect and send once the session is ready. */
  const ask = (text: string, shown?: string) => {
    // A fresh session starts clean, but start() must not wipe what they just tapped.
    if (!isOpen() && !ws && !reconnecting) chat.clearLog()
    chat.say('you', shown || 'You: ' + text)
    if (isOpen()) sendUser(text)
    else {
      pendingText = text
      if (!ws && !reconnecting) void start()
    }
  }

  /* ---- messages from Gemini ---- */
  /** Gemini streams audio faster than it plays. Draw when the matching words are actually heard. */
  const drawAt = () => performance.now() + speaker.pendingMs()
  async function onMessage(ev: MessageEvent) {
    const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text()
    const m = JSON.parse(raw) as LiveMessage
    if (m.setupComplete) {
      setStatus('Live. Speak, or type here.', true)
      chat.say('sys', 'Connected.')
      if (pendingText) {
        const t = pendingText
        pendingText = ''
        sendUser(t)
      } else if (reconnectedFresh) {
        reconnectedFresh = false
        send({ realtimeInput: { text: '(Session restarted. ' + board.summary() + ' Carry on from here without repeating yourself.)' } })
      }
      return
    }
    const sc = m.serverContent
    if (sc) {
      if (sc.interrupted) {
        speaker.stop()
        board.flush()
        chat.breakAi()
        chat.clearCaption()
        phase('Listening…')
      }
      if (sc.outputTranscription?.text) chat.ai(sc.outputTranscription.text)
      for (const p of sc.modelTurn?.parts || []) {
        if (p.inlineData?.data && /audio/.test(p.inlineData.mimeType || '')) {
          speaker.play(p.inlineData.data)
          phase('Speaking. Talk to interrupt')
        }
      }
      if (sc.inputTranscription?.text) chat.you(sc.inputTranscription.text)
      if (sc.turnComplete) {
        chat.endTurn()
        showQuick()
        settleToYourTurn()
      }
      if (sc.inputTranscription) {
        chat.breakAi()
        hideQuick()
        clearAuto()
        autoCount = 0
        phase('Listening…')
      }
    }
    const calls = functionCalls(m)
    if (calls.length) {
      const functionResponses = calls.map((c) => {
        const response = board.exec(c.name, argsOf(c.args), drawAt())
        if (response.error) chat.say('sys', c.name + ' failed: ' + response.error)
        return { id: c.id, name: c.name, response }
      })
      send({ toolResponse: { functionResponses } })
    }
    if (m.toolCallCancellation) board.flush()
    if (m.sessionResumptionUpdate) {
      if (m.sessionResumptionUpdate.newHandle) resumeHandle = m.sessionResumptionUpdate.newHandle
      if (m.sessionResumptionUpdate.resumable === false) resumeHandle = ''
    }
    if (m.goAway) chat.say('sys', 'Refreshing the session…')
  }

  /* ---- connect, reconnect, stop ---- */
  /** keep: a reconnect, so the board and chat stay as they are. */
  async function start(opts: { keep?: boolean } = {}) {
    if (userStop && opts.keep) return
    if (!opts.keep) userStop = false
    goBtn.disabled = true
    setStatus(opts.keep ? 'Reconnecting…' : 'Connecting…')
    if (!opts.keep && !pendingText) chat.clearLog()
    try {
      await board.ready // text is measured when a tool runs, so the handwriting font has to be loaded first
      const j = (await (await fetch('/api/token')).json()) as TokenResponse
      if (!j.token || !j.model) throw new Error(j.error || 'No token')
      if (userStop) return
      await speaker.open()
      const sock = new WebSocket(socketUrl({ kind: j.kind, token: j.token }))
      ws = sock
      sock.onmessage = (ev) => void onMessage(ev)
      sock.onclose = (e) => {
        if (userStop) return cleanup()
        chat.say('sys', e.reason ? 'Connection dropped: ' + e.reason : 'Connection dropped.')
        void reconnect()
      }
      sock.onerror = () => chat.say('sys', 'Connection error.')
      await new Promise<void>((res, rej) => {
        sock.onopen = () => res()
        setTimeout(() => rej(new Error('Connection timed out')), 10000)
      })
      if (userStop) return
      reconnectedFresh = !!opts.keep && !resumeHandle
      send(setupMessage({ model: j.model, prompt: promptFor(mode.value), tools: board.TOOLS, resumeHandle }))
      try {
        mic = await openMic((data) => {
          if (micOn) send({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } })
        })
      } catch (e) {
        chat.say('sys', 'Microphone unavailable (' + (e instanceof Error ? e.message : 'unavailable') + '). You can still type.')
      }
      goBtn.textContent = 'Stop'
      goBtn.classList.add('live')
      reconnects = 0
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      chat.say('sys', message)
      if (opts.keep) throw e
      pendingText = ''
      cleanup()
      setStatus('Could not connect: ' + message.slice(0, 70))
    }
    goBtn.disabled = false
  }

  /** Close the socket and audio but keep the board, chat and settings. */
  function closeIo() {
    const old = ws
    ws = null
    if (old) {
      old.onclose = null
      if (old.readyState <= WebSocket.OPEN) old.close()
    }
    speaker.close()
    mic?.close()
    mic = null
  }

  async function reconnect() {
    if (userStop || reconnecting) return
    if (reconnects >= MAX_RECONNECTS) {
      chat.say('sys', 'Could not reconnect. Press Start.')
      cleanup()
      return
    }
    reconnecting = true
    reconnects++
    closeIo()
    try {
      await start({ keep: true })
    } catch {
      if (!userStop) {
        setTimeout(() => {
          reconnecting = false
          void reconnect()
        }, 1200)
      }
    } finally {
      reconnecting = false
    }
  }

  function cleanup() {
    userStop = true
    clearAuto()
    chat.reset()
    closeIo()
    goBtn.textContent = 'Start'
    goBtn.classList.remove('live')
    hideQuick()
    setStatus('Not connected')
  }

  /* ---- page controls ---- */
  const on = (sel: string, type: string, fn: (e: Event) => void) => $(sel)?.addEventListener(type, fn, { signal })

  board.onPick = (p) => {
    chat.breakAi()
    ask('(They tapped on: ' + p.label + '. Explain that part in two sentences, then ask them one question about it.)', 'Tapped: ' + p.label)
  }
  // Topic chips and quick replies carry their message in data-say.
  root.addEventListener(
    'click',
    (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-say]')
      if (t) ask(t.dataset.say || '', 'You: ' + (t.dataset.label || t.dataset.say))
    },
    { signal },
  )
  goBtn.addEventListener('click', () => (ws || reconnecting ? cleanup() : void start()), { signal })

  on('#mute', 'click', () => {
    micOn = !micOn
    const mute = $('#mute')
    mute?.setAttribute('aria-pressed', String(!micOn))
    mute?.setAttribute('aria-label', micOn ? 'Mute microphone' : 'Unmute microphone')
    const label = $('#muteLabel')
    if (label) label.textContent = micOn ? '' : 'Muted'
    mic?.setEnabled(micOn)
  })
  on('#assistToggle', 'click', () => {
    const assist = $('#assist')
    const toggle = $('#assistToggle')
    if (!assist || !toggle) return
    const opening = assist.hasAttribute('hidden')
    assist.toggleAttribute('hidden')
    toggle.setAttribute('aria-expanded', String(opening))
    toggle.textContent = opening ? 'Hide' : 'Assistant'
  })

  const input = must<HTMLInputElement>(root, '#txt')
  const sendText = () => {
    const t = input.value.trim()
    if (!t) return
    input.value = ''
    ask(t)
  }
  on('#send', 'click', sendText)
  on('#txt', 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') sendText()
  })

  on('#auto', 'click', (e) => {
    autoOn = !autoOn
    if (!autoOn) clearAuto()
    const btn = e.currentTarget as HTMLElement
    btn.textContent = autoOn ? 'Auto' : 'Paused'
    btn.setAttribute('aria-pressed', String(!autoOn))
  })
  on('#undo', 'click', () => {
    if (!board.undo()) chat.say('sys', 'Nothing to undo.')
  })
  on('#newBoard', 'click', () => {
    board.clear()
    hideQuick()
  })
  on('#save', 'click', () => {
    void board.snapshot(1600).then((b64) => {
      const a = document.createElement('a')
      a.href = 'data:image/jpeg;base64,' + b64
      a.download = 'openchalk.jpg'
      a.click()
    })
  })

  return () => {
    cleanup()
    board.destroy()
    ac.abort()
  }
}
