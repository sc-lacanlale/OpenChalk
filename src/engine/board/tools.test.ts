import { describe, expect, it } from 'vitest'
import { TOOLS, TOOL_NAMES } from './tools'

describe('TOOLS', () => {
  it('declares exactly the tools the board handles', () => {
    expect(TOOLS[0].functionDeclarations.map((d) => d.name).sort()).toEqual([...TOOL_NAMES].sort())
  })
  it('only marks declared properties as required', () => {
    for (const d of TOOLS[0].functionDeclarations) {
      for (const r of d.parameters.required) expect(Object.keys(d.parameters.properties)).toContain(r)
    }
  })
})
