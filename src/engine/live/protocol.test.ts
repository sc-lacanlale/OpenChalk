import { describe, expect, it } from 'vitest'
import { argsOf, functionCalls, setupMessage, socketUrl, toolsFor } from './protocol'

describe('functionCalls', () => {
  it('returns each call once even when it arrives in both places', () => {
    const call = { id: 'c1', name: 'part', args: { what: 'sun' } }
    const calls = functionCalls({ toolCall: { functionCalls: [call] }, serverContent: { modelTurn: { parts: [{ functionCall: call }] } } })
    expect(calls).toEqual([{ id: 'c1', name: 'part', args: { what: 'sun' } }])
  })
  it('gives id-less calls an id and skips nameless ones', () => {
    const calls = functionCalls({ toolCall: { functionCalls: [{ name: 'write' }, { args: {} }] } })
    expect(calls).toEqual([{ id: 'write#0', name: 'write', args: undefined }])
  })
})

describe('argsOf', () => {
  it('accepts objects and JSON strings', () => {
    expect(argsOf({ a: 1 })).toEqual({ a: 1 })
    expect(argsOf('{"a":1}')).toEqual({ a: 1 })
    expect(argsOf('not json')).toEqual({})
    expect(argsOf(null)).toEqual({})
  })
})

describe('socketUrl', () => {
  it('uses the constrained endpoint for ephemeral tokens', () => {
    expect(socketUrl({ kind: 'ephemeral', token: 'auth_tokens/x' })).toContain('BidiGenerateContentConstrained?access_token=auth_tokens%2Fx')
    expect(socketUrl({ kind: 'key', token: 'k' })).toContain('BidiGenerateContent?key=k')
  })
})

describe('toolsFor', () => {
  const tools = [{ functionDeclarations: [{ name: 'part' }] }]
  it('marks tools blocking only for 3.8 models, without changing the original', () => {
    expect(toolsFor('gemini-3.1-flash-live-preview', tools)).toBe(tools)
    expect(toolsFor('gemini-3.8-live', tools)).toEqual([{ functionDeclarations: [{ name: 'part', behavior: 'BLOCKING' }] }])
    expect(tools[0].functionDeclarations[0]).toEqual({ name: 'part' })
  })
})

describe('setupMessage', () => {
  it('resumes a session when there is a handle', () => {
    expect(setupMessage({ model: 'm', prompt: 'p', tools: [], resumeHandle: 'h' }).setup.sessionResumption).toEqual({ handle: 'h' })
    expect(setupMessage({ model: 'm', prompt: 'p', tools: [], resumeHandle: '' }).setup.model).toBe('models/m')
  })
})
