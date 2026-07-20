import { describe, expect, it } from 'vitest'
import {
  createCellHistory,
  recordCellChange,
  redoCellChange,
  undoCellChange,
  type CellHistoryState,
  type CellSnapshot,
} from './cellHistory'

function painted(count: number): CellSnapshot {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`0:${index * 2}`, '#14b8a6']),
  )
}

function applyUndo(history: CellHistoryState, cells: CellSnapshot) {
  const transition = undoCellChange(history, cells)
  if (!transition) throw new Error('Expected an undo transition')
  return transition
}

function applyRedo(history: CellHistoryState, cells: CellSnapshot) {
  const transition = redoCellChange(history, cells)
  if (!transition) throw new Error('Expected a redo transition')
  return transition
}

describe('cell history', () => {
  it('undoes and redoes every step in order during repeated actions', () => {
    let history = createCellHistory()
    history = recordCellChange(history, painted(0))
    history = recordCellChange(history, painted(1))
    history = recordCellChange(history, painted(2))

    let current = painted(3)
    const undoCounts: number[] = []
    for (let index = 0; index < 3; index += 1) {
      const transition = applyUndo(history, current)
      history = transition.history
      current = transition.cells
      undoCounts.push(Object.keys(current).length)
    }
    expect(undoCounts).toEqual([2, 1, 0])
    expect(undoCellChange(history, current)).toBeNull()

    const redoCounts: number[] = []
    for (let index = 0; index < 3; index += 1) {
      const transition = applyRedo(history, current)
      history = transition.history
      current = transition.cells
      redoCounts.push(Object.keys(current).length)
    }
    expect(redoCounts).toEqual([1, 2, 3])
    expect(redoCellChange(history, current)).toBeNull()
  })

  it('clears redo entries as soon as a new edit is recorded', () => {
    let history = recordCellChange(createCellHistory(), painted(0))
    const undone = applyUndo(history, painted(1))
    history = recordCellChange(undone.history, undone.cells)

    expect(history.future).toEqual([])
    expect(redoCellChange(history, painted(2))).toBeNull()
  })

  it('keeps the latest fifty undo entries', () => {
    let history = createCellHistory()
    for (let count = 0; count < 65; count += 1) {
      history = recordCellChange(history, painted(count))
    }

    expect(history.past).toHaveLength(50)
    expect(Object.keys(history.past[0])).toHaveLength(15)
    expect(Object.keys(history.past.at(-1) ?? {})).toHaveLength(64)
  })
})
