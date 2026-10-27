// Microphone up as 16 kHz 16-bit PCM, voice down as 24 kHz PCM played gaplessly. Both as base64, the Live API's format.

export function toBase64(u8: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 4096)))
  return btoa(s)
}

/** Plays streamed voice chunks back to back. Gemini sends audio faster than real time, so chunks are scheduled ahead. */
export function createSpeaker() {
  let ctx: AudioContext | null = null
  let nextT = 0
  const sources = new Set<AudioBufferSourceNode>()

  const stop = () => {
    sources.forEach((s) => {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    })
    sources.clear()
    nextT = 0
  }

  return {
    async open() {
      ctx = new AudioContext({ sampleRate: 24000 })
      await ctx.resume()
    },
    close() {
      stop()
      if (ctx) void ctx.close().catch(() => {})
      ctx = null
    },
    /** Cut the voice off now (the student interrupted). */
    stop,
    play(b64pcm: string) {
      if (!ctx) return
      const bin = atob(b64pcm)
      const n = bin.length >> 1
      const buf = ctx.createBuffer(1, n, 24000)
      const ch = buf.getChannelData(0)
      for (let i = 0; i < n; i++) {
        let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
        if (v > 32767) v -= 65536
        ch[i] = v / 32768
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      nextT = Math.max(nextT, ctx.currentTime + 0.03)
      src.start(nextT)
      nextT += buf.duration
      sources.add(src)
      src.onended = () => sources.delete(src)
    },
    /** The audio clock (seconds) and when the queued voice ends, or null when closed. */
    clock(): { now: number; end: number } | null {
      return ctx ? { now: ctx.currentTime, end: nextT } : null
    },
    /** Milliseconds of voice still queued to play. */
    pendingMs(): number {
      return ctx ? Math.max(0, nextT - ctx.currentTime) * 1000 : 0
    },
  }
}
export type Speaker = ReturnType<typeof createSpeaker>

const WORKLET = `class P extends AudioWorkletProcessor{process(i){const c=i[0][0];if(c)this.port.postMessage(c.slice());return true}}registerProcessor('pcm',P)`

/** Opens the mic and calls onChunk with 100 ms of base64 16 kHz PCM at a time. */
export async function openMic(onChunk: (b64: string) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
  const ctx = new AudioContext()
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
  const node = new AudioWorkletNode(ctx, 'pcm')
  const ratio = ctx.sampleRate / 16000
  let pos = 0
  const pend: number[] = []
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const x = e.data
    // Linear-interpolation resample from the device rate down to 16 kHz.
    while (pos < x.length) {
      const i = Math.floor(pos)
      const a = x[i]
      const b = x[i + 1] ?? a
      pend.push(a + (b - a) * (pos - i))
      pos += ratio
    }
    pos -= x.length
    while (pend.length >= 1600) {
      const c = pend.splice(0, 1600)
      const i16 = new Int16Array(1600)
      for (let k = 0; k < 1600; k++) i16[k] = Math.max(-1, Math.min(1, c[k])) * 32767
      onChunk(toBase64(new Uint8Array(i16.buffer)))
    }
  }
  ctx.createMediaStreamSource(stream).connect(node)
  return {
    setEnabled(on: boolean) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = on
      })
    },
    close() {
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close().catch(() => {})
    },
  }
}
export type Mic = Awaited<ReturnType<typeof openMic>>
