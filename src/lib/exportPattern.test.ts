import { describe, expect, it, vi } from 'vitest'
import type { PatternDocument } from '../types'
import { drawGuideSteps, getGuideRoutePoints, getPaintedPatternBounds } from './exportPattern'

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

describe('getGuideRoutePoints', () => {
  it('keeps the numbering order and converts each valid step to canvas coordinates', () => {
    const document = createDocument({})
    document.guideSteps = [
      { row: 2, column: 3 },
      { row: 2, column: 1 },
      { row: 1, column: 2 },
    ]

    expect(getGuideRoutePoints(document)).toEqual([
      { x: 88, y: 68 },
      { x: 48, y: 68 },
    ])
  })
})

describe('drawGuideSteps', () => {
  function createContext() {
    return {
      beginPath: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      lineTo: vi.fn(),
      measureText: vi.fn(() => ({ width: 5 })),
      moveTo: vi.fn(),
      restore: vi.fn(),
      roundRect: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D
  }

  it('draws guide numbers without connecting lines when the route is hidden', () => {
    const document = createDocument({})
    document.guideSteps = [
      { row: 0, column: 1 },
      { row: 0, column: 3 },
    ]
    const context = createContext()

    drawGuideSteps(context, document, { showRoute: false })

    expect(context.lineTo).not.toHaveBeenCalled()
    expect(context.fillText).toHaveBeenCalledTimes(2)
  })

  it('keeps the connecting line visible by default in the editor', () => {
    const document = createDocument({})
    document.guideSteps = [
      { row: 0, column: 1 },
      { row: 0, column: 3 },
    ]
    const context = createContext()

    drawGuideSteps(context, document)

    expect(context.lineTo).toHaveBeenCalled()
    expect(context.fillText).toHaveBeenCalledTimes(2)
  })
})
