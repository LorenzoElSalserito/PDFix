import { describe, expect, it } from 'vitest'
import { formatMemory, formatSize } from '../src/lib/format.js'

describe('formatSize', () => {
  it('sceglie l unita leggibile', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(2048)).toBe('2.0 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatSize(3 * 1024 ** 3)).toBe('3.00 GB')
  })

  it('gestisce valori non validi', () => {
    expect(formatSize(undefined)).toBe('—')
    expect(formatSize(-1)).toBe('—')
  })
})

describe('formatMemory', () => {
  it('passa a GB oltre il migliaio di MB', () => {
    expect(formatMemory(512)).toBe('512 MB')
    expect(formatMemory(4096)).toBe('4 GB')
    expect(formatMemory(1536)).toBe('1.5 GB')
    expect(formatMemory(null)).toBe('—')
  })
})
