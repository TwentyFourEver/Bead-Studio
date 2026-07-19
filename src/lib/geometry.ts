import type { BeadGeometry, MirrorMode, ViewTransform } from '../types'

export const GRID_STEP = 20
export const BEAD_MAJOR_RADIUS = 14
export const BEAD_MINOR_RADIUS = 9
export const PATTERN_PADDING = 28
export const MIN_DIMENSION = 2
export const MAX_DIMENSION = 199
export const MIN_SCALE = 0.25
export const MAX_SCALE = 6

export function beadKey(row: number, column: number) {
  return `${row}:${column}`
}

export function parseBeadKey(key: string): [number, number] | null {
  const match = /^(\d+):(\d+)$/.exec(key)
  if (!match) return null
  return [Number(match[1]), Number(match[2])]
}

export function isBeadCell(row: number, column: number) {
  return row >= 0 && column >= 0 && (row + column) % 2 === 0
}

export function getBeadGeometry(row: number, column: number): BeadGeometry {
  const vertical = row % 2 === 0
  return {
    row,
    column,
    centerX: PATTERN_PADDING + column * GRID_STEP,
    centerY: PATTERN_PADDING + row * GRID_STEP,
    radiusX: vertical ? BEAD_MINOR_RADIUS : BEAD_MAJOR_RADIUS,
    radiusY: vertical ? BEAD_MAJOR_RADIUS : BEAD_MINOR_RADIUS,
    orientation: vertical ? 'vertical' : 'horizontal',
  }
}

export function generateBeads(rows: number, columns: number) {
  const beads: BeadGeometry[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = row % 2; column < columns; column += 2) {
      beads.push(getBeadGeometry(row, column))
    }
  }
  return beads
}

export function getPatternSize(rows: number, columns: number) {
  return {
    width: PATTERN_PADDING * 2 + Math.max(0, columns - 1) * GRID_STEP,
    height: PATTERN_PADDING * 2 + Math.max(0, rows - 1) * GRID_STEP,
  }
}

export function pointInBead(x: number, y: number, bead: BeadGeometry) {
  const dx = (x - bead.centerX) / bead.radiusX
  const dy = (y - bead.centerY) / bead.radiusY
  return dx * dx + dy * dy <= 1
}

export function hitTestBead(
  x: number,
  y: number,
  rows: number,
  columns: number,
): BeadGeometry | null {
  const centerColumn = Math.round((x - PATTERN_PADDING) / GRID_STEP)
  const centerRow = Math.round((y - PATTERN_PADDING) / GRID_STEP)

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      const row = centerRow + rowOffset
      const column = centerColumn + columnOffset
      if (
        row < 0 ||
        row >= rows ||
        column < 0 ||
        column >= columns ||
        !isBeadCell(row, column)
      ) {
        continue
      }
      const bead = getBeadGeometry(row, column)
      if (pointInBead(x, y, bead)) return bead
    }
  }
  return null
}

export function getMirroredCells(
  row: number,
  column: number,
  rows: number,
  columns: number,
  mirrorMode: MirrorMode,
) {
  const candidates: Array<[number, number]> = [[row, column]]
  if (mirrorMode === 'vertical' || mirrorMode === 'both') {
    candidates.push([row, columns - 1 - column])
  }
  if (mirrorMode === 'horizontal' || mirrorMode === 'both') {
    candidates.push([rows - 1 - row, column])
  }
  if (mirrorMode === 'both') {
    candidates.push([rows - 1 - row, columns - 1 - column])
  }

  const unique = new Map<string, [number, number]>()
  for (const [candidateRow, candidateColumn] of candidates) {
    if (isBeadCell(candidateRow, candidateColumn)) {
      unique.set(beadKey(candidateRow, candidateColumn), [candidateRow, candidateColumn])
    }
  }
  return [...unique.values()]
}

export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top'>,
  view: ViewTransform,
) {
  return {
    x: (clientX - rect.left - view.offsetX) / view.scale,
    y: (clientY - rect.top - view.offsetY) / view.scale,
  }
}

export function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function clampDimension(value: number) {
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(value)))
}

export function fitPatternInViewport(
  viewportWidth: number,
  viewportHeight: number,
  rows: number,
  columns: number,
  margin = 48,
): ViewTransform {
  const pattern = getPatternSize(rows, columns)
  const availableWidth = Math.max(1, viewportWidth - margin * 2)
  const availableHeight = Math.max(1, viewportHeight - margin * 2)
  const scale = clampScale(Math.min(availableWidth / pattern.width, availableHeight / pattern.height))
  return {
    scale,
    offsetX: (viewportWidth - pattern.width * scale) / 2,
    offsetY: (viewportHeight - pattern.height * scale) / 2,
  }
}
