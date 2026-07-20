import { beadKey, getBeadGeometry, isGuidePoint } from './geometry'
import type { GuideStep, PatternDocument } from '../types'

const ROUTE_NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-2, 0],
  [0, 2],
  [2, 0],
  [0, -2],
  [-2, -2],
  [-2, 2],
  [2, -2],
  [2, 2],
]

export interface AutomaticGuideResult {
  steps: GuideStep[]
  componentCount: number
  continuous: boolean
}

function guideKey(step: GuideStep) {
  return beadKey(step.row, step.column)
}

function compareReadingOrder(left: GuideStep, right: GuideStep) {
  return left.row - right.row || right.column - left.column
}

export function areGuideStepsNeighbors(left: GuideStep, right: GuideStep) {
  const rowDistance = Math.abs(left.row - right.row)
  const columnDistance = Math.abs(left.column - right.column)
  return (
    (rowDistance === 2 && (columnDistance === 0 || columnDistance === 2)) ||
    (columnDistance === 2 && rowDistance === 0)
  )
}

export function findNumberableCrosses(document: PatternDocument): GuideStep[] {
  const steps: GuideStep[] = []

  for (let row = 1; row < document.rows - 1; row += 1) {
    for (let column = 1; column < document.columns - 1; column += 1) {
      if (!isGuidePoint(row, column, document.rows, document.columns)) continue
      const surroundingBeads = [
        { row: row - 1, column, orientation: 'vertical' },
        { row, column: column + 1, orientation: 'horizontal' },
        { row: row + 1, column, orientation: 'vertical' },
        { row, column: column - 1, orientation: 'horizontal' },
      ] as const
      const isCompleteCross = surroundingBeads.every((bead) => {
        const color = document.cells[beadKey(bead.row, bead.column)]
        const geometry = getBeadGeometry(bead.row, bead.column, document.rows)
        return Boolean(color) && geometry.orientation === bead.orientation
      })
      if (isCompleteCross) steps.push({ row, column })
    }
  }

  return steps.sort(compareReadingOrder)
}

function buildAdjacency(steps: GuideStep[]) {
  const stepKeys = new Set(steps.map(guideKey))
  const adjacency = new Map<string, string[]>()

  for (const step of steps) {
    const neighbors = ROUTE_NEIGHBORS.flatMap(([rowDelta, columnDelta]) => {
      const key = beadKey(step.row + rowDelta, step.column + columnDelta)
      return stepKeys.has(key) ? [key] : []
    })
    adjacency.set(guideKey(step), neighbors)
  }

  return adjacency
}

function countComponents(steps: GuideStep[], adjacency: Map<string, string[]>) {
  const unvisited = new Set(steps.map(guideKey))
  let componentCount = 0

  while (unvisited.size) {
    componentCount += 1
    const firstKey = unvisited.values().next().value as string
    const pending = [firstKey]
    unvisited.delete(firstKey)
    while (pending.length) {
      const key = pending.pop()!
      for (const neighbor of adjacency.get(key) ?? []) {
        if (!unvisited.delete(neighbor)) continue
        pending.push(neighbor)
      }
    }
  }

  return componentCount
}

function horizontalRowSweep(steps: GuideStep[]) {
  const rows = new Map<number, GuideStep[]>()
  for (const step of steps) {
    const row = rows.get(step.row) ?? []
    row.push(step)
    rows.set(step.row, row)
  }

  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, row], index) =>
      [...row].sort((left, right) =>
        index % 2 === 0
          ? right.column - left.column
          : left.column - right.column,
      ),
    )
}

function routeIsContinuous(route: GuideStep[]) {
  return route.every(
    (step, index) => index === 0 || areGuideStepsNeighbors(route[index - 1], step),
  )
}

export function generateAutomaticGuide(document: PatternDocument): AutomaticGuideResult {
  const numberableCrosses = findNumberableCrosses(document)
  if (!numberableCrosses.length) {
    return { steps: [], componentCount: 0, continuous: true }
  }

  const adjacency = buildAdjacency(numberableCrosses)
  const componentCount = countComponents(numberableCrosses, adjacency)
  const steps = horizontalRowSweep(numberableCrosses)

  return {
    steps,
    componentCount,
    continuous: componentCount === 1 && routeIsContinuous(steps),
  }
}
