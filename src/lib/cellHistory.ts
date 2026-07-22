import type { PatternDocument, ReferenceMode, TraceImage } from '../types'

export interface EditorSnapshot {
  document: PatternDocument
  traceImage: TraceImage | null
  referenceMode: ReferenceMode
}

export interface EditorHistoryState {
  past: EditorSnapshot[]
  future: EditorSnapshot[]
}

export interface EditorHistoryTransition {
  history: EditorHistoryState
  snapshot: EditorSnapshot
}

const HISTORY_LIMIT = 50

function appendSnapshot(stack: EditorSnapshot[], snapshot: EditorSnapshot) {
  return [...stack.slice(-(HISTORY_LIMIT - 1)), snapshot]
}

export function createEditorHistory(): EditorHistoryState {
  return { past: [], future: [] }
}

export function recordEditorChange(
  history: EditorHistoryState,
  previousSnapshot: EditorSnapshot,
): EditorHistoryState {
  return {
    past: appendSnapshot(history.past, previousSnapshot),
    future: [],
  }
}

export function undoEditorChange(
  history: EditorHistoryState,
  currentSnapshot: EditorSnapshot,
): EditorHistoryTransition | null {
  const previousSnapshot = history.past.at(-1)
  if (!previousSnapshot) return null

  return {
    snapshot: previousSnapshot,
    history: {
      past: history.past.slice(0, -1),
      future: appendSnapshot(history.future, currentSnapshot),
    },
  }
}

export function redoEditorChange(
  history: EditorHistoryState,
  currentSnapshot: EditorSnapshot,
): EditorHistoryTransition | null {
  const nextSnapshot = history.future.at(-1)
  if (!nextSnapshot) return null

  return {
    snapshot: nextSnapshot,
    history: {
      past: appendSnapshot(history.past, currentSnapshot),
      future: history.future.slice(0, -1),
    },
  }
}
