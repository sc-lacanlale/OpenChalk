// The Gemini Live API wire format: what the server sends, and the messages we build. No DOM, so it is easy to test.
// Reference: https://ai.google.dev/gemini-api/docs/live

export type FunctionCall = { id?: string; name?: string; args?: unknown }

export type LiveMessage = {
  setupComplete?: boolean
  goAway?: unknown
  toolCallCancellation?: unknown
  toolCall?: { functionCalls?: FunctionCall[] }
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean }
  serverContent?: {
    interrupted?: boolean
    turnComplete?: boolean
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
    modelTurn?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; functionCall?: FunctionCall }> }
  }
}

/** What /api/token returns. kind "key" is the raw-key dev mode; anything else is a one-use ephemeral token. */
export type TokenResponse = { token?: string; error?: string; kind?: string; model?: string }

const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage'

export const socketUrl = (t: { kind?: string; token: string }): string =>
  t.kind === 'key'
    ? `${WS}.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(t.token)}`
    : `${WS}.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(t.token)}`

/** gemini-3.8-live defaults to non-blocking tool calls; the board wants the model to wait for each result. Older models ignore this. */
export function toolsFor(model: string, tools: unknown): unknown {
  if (!/3\.8/.test(model)) return tools
  const t = JSON.parse(JSON.stringify(tools)) as { functionDeclarations: Record<string, unknown>[] }[]
  t.forEach((g) =>
    g.functionDeclarations.forEach((d) => {
      d.behavior = 'BLOCKING'
    }),
  )
  return t
}

export const setupMessage = (o: { model: string; prompt: string; tools: unknown; resumeHandle: string }) => ({
  setup: {
    model: 'models/' + o.model,
    generationConfig: { responseModalities: ['AUDIO'] },
    systemInstruction: { parts: [{ text: o.prompt }] },
    tools: toolsFor(o.model, o.tools),
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: o.resumeHandle ? { handle: o.resumeHandle } : {},
    // Long lessons would overflow the context window without this.
    contextWindowCompression: { slidingWindow: {} },
  },
})

/** Function calls can arrive in toolCall or inside the model turn, sometimes both. Each call is returned once. */
export function functionCalls(m: LiveMessage): { id: string; name: string; args: unknown }[] {
  const out: { id: string; name: string; args: unknown }[] = []
  const seen = new Set<string>()
  const add = (c?: FunctionCall) => {
    if (!c || !c.name) return
    const id = c.id || c.name + '#' + out.length
    if (c.id && seen.has(c.id)) return
    if (!c.id && out.some((x) => x.name === c.name)) return
    seen.add(id)
    out.push({ id, name: c.name, args: c.args })
  }
  for (const c of m.toolCall?.functionCalls || []) add(c)
  for (const p of m.serverContent?.modelTurn?.parts || []) if (p.functionCall) add(p.functionCall)
  return out
}

/** Tool arguments arrive as an object or a JSON string. */
export function argsOf(a: unknown): Record<string, unknown> {
  if (typeof a === 'string') {
    try {
      return JSON.parse(a) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return a && typeof a === 'object' ? (a as Record<string, unknown>) : {}
}
