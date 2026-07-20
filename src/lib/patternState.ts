import { beadKey, clampDimension, isBeadCell, isGuidePoint, parseBeadKey } from './geometry'
import type { PatternDocument } from '../types'

export const STORAGE_KEY = 'bead-studio-pattern-v1'

export const DEFAULT_PATTERN: PatternDocument = {
  version: 1,
  rows: 30,
  columns: 30,
  cells: {},
  guideSteps: [],
  background: {
    mode: 'transparent',
    color: '#f7f3ed',
  },
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function isPatternDocument(value: unknown): value is PatternDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PatternDocument>
  if (
    candidate.version !== 1 ||
    typeof candidate.rows !== 'number' ||
    typeof candidate.columns !== 'number' ||
    candidate.rows !== clampDimension(candidate.rows) ||
    candidate.columns !== clampDimension(candidate.columns) ||
    !candidate.cells ||
    typeof candidate.cells !== 'object' ||
    !candidate.background ||
    (candidate.background.mode !== 'transparent' && candidate.background.mode !== 'solid') ||
    !COLOR_PATTERN.test(candidate.background.color ?? '')
  ) {
    return false
  }

  const validCells = Object.entries(candidate.cells).every(([key, color]) => {
    const position = parseBeadKey(key)
    return (
      position !== null &&
      position[0] < candidate.rows! &&
      position[1] < candidate.columns! &&
      isBeadCell(position[0], position[1]) &&
      typeof color === 'string' &&
      COLOR_PATTERN.test(color)
    )
  })
  if (!validCells) return false

  if (candidate.guideSteps === undefined) return true
  if (!Array.isArray(candidate.guideSteps)) return false
  const uniqueSteps = new Set<string>()
  return candidate.guideSteps.every((step) => {
    if (
      !step ||
      typeof step !== 'object' ||
      !Number.isInteger(step.row) ||
      !Number.isInteger(step.column) ||
      !isGuidePoint(step.row, step.column, candidate.rows!, candidate.columns!)
    ) {
      return false
    }
    const key = beadKey(step.row, step.column)
    if (uniqueSteps.has(key)) return false
    uniqueSteps.add(key)
    return true
  })
}

export function loadPattern(storage: Pick<Storage, 'getItem'> = localStorage): PatternDocument {
  try {
    const saved = storage.getItem(STORAGE_KEY)
    if (!saved) return structuredClone(DEFAULT_PATTERN)
    const parsed: unknown = JSON.parse(saved)
    return isPatternDocument(parsed) ? parsed : structuredClone(DEFAULT_PATTERN)
  } catch {
    return structuredClone(DEFAULT_PATTERN)
  }
}

export function savePattern(
  document: PatternDocument,
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  storage.setItem(STORAGE_KEY, JSON.stringify(document))
}

function centeredShift(oldRows: number, oldColumns: number, newRows: number, newColumns: number) {
  const idealRow = (newRows - oldRows) / 2
  const idealColumn = (newColumns - oldColumns) / 2
  let best = { row: 0, column: 0, score: Number.POSITIVE_INFINITY }

  for (let row = Math.floor(idealRow) - 1; row <= Math.ceil(idealRow) + 1; row += 1) {
    for (
      let column = Math.floor(idealColumn) - 1;
      column <= Math.ceil(idealColumn) + 1;
      column += 1
    ) {
      if ((row + column) % 2 !== 0) continue
      const score = (row - idealRow) ** 2 + (column - idealColumn) ** 2
      if (score < best.score) best = { row, column, score }
    }
  }
  return best
}

export function resizePattern(
  document: PatternDocument,
  requestedRows: number,
  requestedColumns: number,
): PatternDocument {
  const rows = clampDimension(requestedRows)
  const columns = clampDimension(requestedColumns)
  const shift = centeredShift(document.rows, document.columns, rows, columns)
  const cells: Record<string, string> = {}

  for (const [key, color] of Object.entries(document.cells)) {
    const position = parseBeadKey(key)
    if (!position) continue
    const row = position[0] + shift.row
    const column = position[1] + shift.column
    if (row >= 0 && row < rows && column >= 0 && column < columns && isBeadCell(row, column)) {
      cells[beadKey(row, column)] = color
    }
  }

  const guideSteps = (document.guideSteps ?? []).flatMap((step) => {
    const row = step.row + shift.row
    const column = step.column + shift.column
    return isGuidePoint(row, column, rows, columns) ? [{ row, column }] : []
  })

  return { ...document, rows, columns, cells, guideSteps }
}

export function paintCells(
  document: PatternDocument,
  positions: Array<[number, number]>,
  color: string | null,
) {
  const cells = { ...document.cells }
  for (const [row, column] of positions) {
    const key = beadKey(row, column)
    if (color === null) delete cells[key]
    else cells[key] = color
  }
  return { ...document, cells }
}

export function moveCells(
  document: PatternDocument,
  selectedKeys: Iterable<string>,
  rowDelta: number,
  columnDelta: number,
) {
  if (rowDelta === 0 && columnDelta === 0) return document

  const selected = [...new Set(selectedKeys)].flatMap((key) => {
    const position = parseBeadKey(key)
    const color = document.cells[key]
    return position && color ? [{ key, position, color }] : []
  })
  if (!selected.length) return document

  const destinations = selected.map(({ position: [row, column], color }) => ({
    row: row + rowDelta,
    column: column + columnDelta,
    color,
  }))
  if (
    destinations.some(
      ({ row, column }) =>
        row < 0 ||
        row >= document.rows ||
        column < 0 ||
        column >= document.columns ||
        !isBeadCell(row, column),
    )
  ) {
    return document
  }

  const cells = { ...document.cells }
  for (const { key } of selected) delete cells[key]
  for (const { row, column, color } of destinations) cells[beadKey(row, column)] = color
  return { ...document, cells }
}
