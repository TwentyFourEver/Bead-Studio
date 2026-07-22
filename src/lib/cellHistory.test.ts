import { describe, expect, it } from 'vitest'
import type { PatternDocument, TraceImage } from '../types'
import {
  createEditorHistory,
  recordEditorChange,
  redoEditorChange,
  undoEditorChange,
  type EditorHistoryState,
  type EditorSnapshot,
} from './cellHistory'

function documentAt(step: number): PatternDocument {
  return {
    version: 1,
    rows: step * 2 + 1,
    columns: step * 2 + 3,
    cells: step === 0 ? {} : { [`${step}:${step * 2}`]: '#14b8a6' },
    guideSteps: step === 0 ? [] : [{ row: step, column: step * 2 }],
    background: {
      mode: step % 2 === 0 ? 'transparent' : 'solid',
      color: step % 2 === 0 ? '#ffffff' : '#052e16',
    },
  }
}

function traceAt(step: number): TraceImage {
  return {
    src: `data:image/png;base64,${step}`,
    name: `reference-${step}.png`,
    naturalWidth: 100 + step,
    naturalHeight: 80 + step,
    baseScale: 1,
    scalePercent: 100 + step,
    x: step,
    y: -step,
    opacity: 0.5,
    visible: true,
  }
}

function snapshotAt(step: number): EditorSnapshot {
  return {
    document: documentAt(step),
    traceImage: step === 0 ? null : traceAt(step),
    referenceMode: step % 2 === 0 ? 'floating' : 'trace',
  }
}

function applyUndo(history: EditorHistoryState, snapshot: EditorSnapshot) {
  const transition = undoEditorChange(history, snapshot)
  if (!transition) throw new Error('Expected an undo transition')
  return transition
}

function applyRedo(history: EditorHistoryState, snapshot: EditorSnapshot) {
  const transition = redoEditorChange(history, snapshot)
  if (!transition) throw new Error('Expected a redo transition')
  return transition
}

describe('editor history', () => {
  it('undoes and redoes complete snapshots in order', () => {
    const snapshots = [snapshotAt(0), snapshotAt(1), snapshotAt(2), snapshotAt(3)]
    let history = createEditorHistory()
    history = recordEditorChange(history, snapshots[0])
    history = recordEditorChange(history, snapshots[1])
    history = recordEditorChange(history, snapshots[2])

    let current = snapshots[3]
    const undoRows: number[] = []
    for (let index = 0; index < 3; index += 1) {
      const transition = applyUndo(history, current)
      history = transition.history
      current = transition.snapshot
      undoRows.push(current.document.rows)
    }
    expect(undoRows).toEqual([5, 3, 1])
    expect(undoEditorChange(history, current)).toBeNull()

    const redoRows: number[] = []
    for (let index = 0; index < 3; index += 1) {
      const transition = applyRedo(history, current)
      history = transition.history
      current = transition.snapshot
      redoRows.push(current.document.rows)
    }
    expect(redoRows).toEqual([3, 5, 7])
    expect(redoEditorChange(history, current)).toBeNull()
  })

  it('clears redo entries as soon as a new edit is recorded', () => {
    const initial = snapshotAt(0)
    let history = recordEditorChange(createEditorHistory(), initial)
    const undone = applyUndo(history, snapshotAt(1))
    history = recordEditorChange(undone.history, undone.snapshot)

    expect(history.future).toEqual([])
    expect(redoEditorChange(history, snapshotAt(2))).toBeNull()
  })

  it('keeps the latest fifty undo entries', () => {
    const snapshots = Array.from({ length: 65 }, (_, step) => snapshotAt(step))
    let history = createEditorHistory()
    for (const snapshot of snapshots) {
      history = recordEditorChange(history, snapshot)
    }

    expect(history.past).toHaveLength(50)
    expect(history.past[0]).toBe(snapshots[15])
    expect(history.past.at(-1)).toBe(snapshots[64])
  })

  it('restores document and reference state as one immutable snapshot', () => {
    const previous = snapshotAt(4)
    const current = snapshotAt(5)
    const recorded = recordEditorChange(createEditorHistory(), previous)
    const transition = applyUndo(recorded, current)

    expect(recorded.past[0]).toBe(previous)
    expect(transition.snapshot).toBe(previous)
    expect(transition.history.future[0]).toBe(current)
    expect(transition.snapshot.document).toMatchObject({
      rows: 9,
      columns: 11,
      guideSteps: [{ row: 4, column: 8 }],
      background: { mode: 'transparent', color: '#ffffff' },
    })
    expect(transition.snapshot.traceImage).toEqual(traceAt(4))
    expect(transition.snapshot.referenceMode).toBe('floating')
  })
})
