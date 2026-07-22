import type { PatternDocument } from '../types'
import { IMPORT_VISIBLE_MARGIN, MAX_DIMENSION, beadKey } from './geometry'

const LOOSE_KEY = /^(-?\d+):(-?\d+)$/
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export interface NormalizedImport {
  rows: number
  columns: number
  cells: Record<string, string>
}

interface PreferredImportBounds {
  rows: number
  columns: number
}

function nextOddDimension(required: number) {
  const atLeastMinimum = Math.max(3, required)
  return atLeastMinimum % 2 === 0 ? atLeastMinimum + 1 : atLeastMinimum
}

export function parseImportKey(key: string): [number, number] | null {
  const match = LOOSE_KEY.exec(key)
  if (!match) return null
  const row = Number(match[1])
  const column = Number(match[2])
  return Number.isSafeInteger(row) && Number.isSafeInteger(column) ? [row, column] : null
}

export function normalizeImportedCells(
  source: Record<string, string>,
  preferredBounds?: PreferredImportBounds,
): NormalizedImport | null {
  const entries = Object.entries(source).flatMap(([key, color]) => {
    const position = parseImportKey(key)
    return position && (position[0] + position[1]) % 2 === 0 && HEX_COLOR.test(color)
      ? [{ position, color: color.toLowerCase() }]
      : []
  })
  if (!entries.length) return null

  if (
    preferredBounds &&
    preferredBounds.rows >= 3 &&
    preferredBounds.columns >= 3 &&
    preferredBounds.rows <= MAX_DIMENSION &&
    preferredBounds.columns <= MAX_DIMENSION &&
    preferredBounds.rows % 2 === 1 &&
    preferredBounds.columns % 2 === 1 &&
    entries.every(({ position: [row, column] }) => (
      row >= 0 &&
      row < preferredBounds.rows &&
      column >= 0 &&
      column < preferredBounds.columns
    ))
  ) {
    return {
      rows: preferredBounds.rows,
      columns: preferredBounds.columns,
      cells: Object.fromEntries(entries.map(({ position: [row, column], color }) => [
        beadKey(row, column),
        color,
      ])),
    }
  }

  const minRow = Math.min(...entries.map(({ position }) => position[0]))
  const minColumn = Math.min(...entries.map(({ position }) => position[1]))
  const gridMargin = IMPORT_VISIBLE_MARGIN * 2
  let rowShift = -minRow + gridMargin
  let columnShift = -minColumn + gridMargin
  if (Math.abs(rowShift) % 2 === 1) rowShift += 1
  if (Math.abs(columnShift) % 2 === 1) columnShift += 1

  const cells: Record<string, string> = {}
  let maxRow = 0
  let maxColumn = 0
  for (const { position: [row, column], color } of entries) {
    const normalizedRow = row + rowShift
    const normalizedColumn = column + columnShift
    maxRow = Math.max(maxRow, normalizedRow)
    maxColumn = Math.max(maxColumn, normalizedColumn)
    cells[beadKey(normalizedRow, normalizedColumn)] = color
  }

  const rows = nextOddDimension(maxRow + 1 + gridMargin)
  const columns = nextOddDimension(maxColumn + 1 + gridMargin)
  if (rows > MAX_DIMENSION || columns > MAX_DIMENSION) return null
  return { rows, columns, cells }
}

export function createImportedDocument(
  current: PatternDocument,
  imported: NormalizedImport,
): PatternDocument {
  return {
    ...current,
    rows: imported.rows,
    columns: imported.columns,
    cells: imported.cells,
    guideSteps: [],
    background: { ...current.background, mode: 'transparent' },
  }
}

export function paletteFromCells(cells: Record<string, string>) {
  const counts = new Map<string, number>()
  for (const color of Object.values(cells)) {
    const normalized = color.toLowerCase()
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((left, right) => right.count - left.count || left.color.localeCompare(right.color))
}
