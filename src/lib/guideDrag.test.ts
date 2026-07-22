import { describe, expect, it } from 'vitest'
import { PATTERN_PADDING, GRID_STEP } from './geometry'
import { collectGuidePointsAlongSegment } from './guideDrag'

const center = (row: number, column: number) => ({
  x: PATTERN_PADDING + column * GRID_STEP,
  y: PATTERN_PADDING + row * GRID_STEP,
})

describe('collectGuidePointsAlongSegment', () => {
  it('collects guide points in drag order, including points crossed between events', () => {
    expect(collectGuidePointsAlongSegment(
      center(0, 1),
      center(0, 5),
      7,
      7,
      new Set(),
    )).toEqual([[0, 1], [0, 3], [0, 5]])
  })

  it('does not return points already visited during the same gesture', () => {
    const visited = new Set(['0:1'])
    expect(collectGuidePointsAlongSegment(
      center(0, 1),
      center(0, 3),
      5,
      5,
      visited,
    )).toEqual([[0, 3]])
  })

  it('returns no points when the drag misses the guide grid', () => {
    expect(collectGuidePointsAlongSegment(
      { x: -100, y: -100 },
      { x: -50, y: -50 },
      5,
      5,
      new Set(),
    )).toEqual([])
  })

  it('ignores the alternating gaps that cannot contain numbering', () => {
    expect(collectGuidePointsAlongSegment(
      center(1, 0),
      center(1, 4),
      5,
      5,
      new Set(),
    )).toEqual([])
  })
})
