export type ToolArgs = Record<string, unknown>

export type ToolResult = {
  ok?: boolean
  error?: string
  /** Something the model should know but that is not a failure (a slot was taken, a word had no picture...). */
  note?: string
  id?: string
  /** What is on the board right now. The model is told to trust this over its memory. */
  board: string[]
  free_slots: string[]
  /** One line of coaching for the next move (balance of drawing and writing, when to ask a question...). */
  next: string
}

export type PickInfo = { id: string; label: string }

export type BoardApi = {
  dirty: boolean
  busy: boolean
  onIdle: (() => void) | null
  /** Called when the student taps a part or label on the board. */
  onPick: ((p: PickInfo) => void) | null
  /** Resolves when the handwriting font is ready; text is measured when a tool is called, so wait for this first. */
  ready: Promise<unknown>
  /** `at` is a performance.now() time (ms). The drawing starts then. Omit to start as soon as the pen is free. */
  exec: (name: string, args?: ToolArgs, at?: number) => ToolResult
  /** Barge-in: drop drawing that has not started yet. */
  flush: () => void
  /** One-line description of the board, used to re-brief the model after a lost session. */
  summary: () => string
  /** Where the lesson is, so the app knows whether to keep the presentation moving. */
  stage: () => 'idle' | 'teaching' | 'done'
  /** Remove the newest part or written line. False when there is nothing to remove. Shortcut: not flow nodes or charts. */
  undo: () => boolean
  /** Wipe the board back to the empty "what do you want to learn" state. */
  clear: () => void
  /** Base64 JPEG of the board at the given pixel width. */
  snapshot: (width?: number) => Promise<string>
  destroy: () => void
  photoUrl?: string
  TOOLS: unknown
}
