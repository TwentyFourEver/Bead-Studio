import { describe, expect, it } from 'vitest'
import type { PatternDocument } from '../types'
import { getPaintedPatternBounds } from './exportPattern'

function createDocument(cells: Record<string, string>): PatternDocument {
  return {
    version: 1,
    rows: 5,
    columns: 5,
    cells,
    guideSteps: [],
    background: { mode: 'transparent', color: '#ffffff' },
  }
}

describe('getPaintedPatternBounds', () => {
  it('returns null when the design has no painted beads', () => {
    expect(getPaintedPatternBounds(createDocument({}))).toBeNull()
  })

  it('crops a single painted bead including its stroke margin', () => {
    expect(getPaintedPatternBounds(createDocument({ '2:2': '#ff0000' }))).toEqual({
      x: 52,
      y: 57,
      width: 32,
      height: 22,
    })
  })

  it('uses the outer edges of all painted beads', () => {
    expect(getPaintedPatternBounds(createDocument({
      '0:0': '#ff0000',
      '4:4': '#00ff00',
    }))).toEqual({
      x: 17,
      y: 12,
      width: 102,
      height: 112,
    })
  })

  it('ignores invalid or non-bead cell keys', () => {
    expect(getPaintedPatternBounds(createDocument({
      '1:0': '#ff0000',
      invalid: '#00ff00',
    }))).toBeNull()
  })
})
