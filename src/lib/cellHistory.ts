export type CellSnapshot = Record<string, string>

export interface CellHistoryState {
  past: CellSnapshot[]
  future: CellSnapshot[]
}

export interface CellHistoryTransition {
  history: CellHistoryState
  cells: CellSnapshot
}

const HISTORY_LIMIT = 50

function appendSnapshot(stack: CellSnapshot[], snapshot: CellSnapshot) {
  return [...stack.slice(-(HISTORY_LIMIT - 1)), snapshot]
}

export function createCellHistory(): CellHistoryState {
  return { past: [], future: [] }
}

export function recordCellChange(
  history: CellHistoryState,
  previousCells: CellSnapshot,
): CellHistoryState {
  return {
    past: appendSnapshot(history.past, previousCells),
    future: [],
  }
}

export function undoCellChange(
  history: CellHistoryState,
  currentCells: CellSnapshot,
): CellHistoryTransition | null {
  const previousCells = history.past.at(-1)
  if (!previousCells) return null

  return {
    cells: previousCells,
    history: {
      past: history.past.slice(0, -1),
      future: appendSnapshot(history.future, currentCells),
    },
  }
}

export function redoCellChange(
  history: CellHistoryState,
  currentCells: CellSnapshot,
): CellHistoryTransition | null {
  const nextCells = history.future.at(-1)
  if (!nextCells) return null

  return {
    cells: nextCells,
    history: {
      past: appendSnapshot(history.past, currentCells),
      future: history.future.slice(0, -1),
    },
  }
}
