// Ink colours and the handwriting font. Pictures get AUTO colours in turn so neighbours never match.
export const COL = {
  purple: '#7a4bc2',
  orange: '#d9822b',
  teal: '#1f8a9e',
  pink: '#d4526e',
  red: '#d6403a',
  green: '#2f8f5b',
  blue: '#2f6fd6',
  gold: '#c99a1a',
  slate: '#56635d',
  ink: '#232834',
  muted: '#667085',
} as const

export type ColorName = keyof typeof COL

export const AUTO: ColorName[] = ['purple', 'orange', 'teal', 'pink', 'green', 'blue']

export const FONT = "Caveat,'Segoe Print','Bradley Hand',cursive"

/** The colour name the model asked for, or '' if it is not one of ours. */
export const pickColor = (c: unknown): ColorName | '' => {
  const k = String(c ?? '')
    .toLowerCase()
    .trim()
  return k in COL ? (k as ColorName) : ''
}

/** Stroke width that looks hand-drawn at any picture size. */
export const inkW = (size: number): number => Math.min(4.2, Math.max(2.3, size / 34))
