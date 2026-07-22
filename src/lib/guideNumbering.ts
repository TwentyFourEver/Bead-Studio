import { beadKey, getBeadGeometry, isNumberableGuidePoint } from './geometry'
import type { GuideStartDirection, GuideStep, PatternDocument } from '../types'

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

// La comprobación completa de bifurcaciones es cuadrática. Los patrones densos
// ya usan el barrido lineal; este límite mantiene fluida la alternativa irregular.
const CONNECTIVITY_LOOKAHEAD_LIMIT = 1200
// Los recorridos irregulares medianos pueden necesitar deshacer decisiones.
// Los límites evitan que un caso sin solución bloquee el editor.
const BACKTRACK_VERTEX_LIMIT = 600
const BACKTRACK_STATE_LIMIT = 12000

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

interface DirectionalPosition {
  band: number
  offset: number
}

function directionalPosition(
  step: GuideStep,
  startDirection: GuideStartDirection,
): DirectionalPosition {
  switch (startDirection) {
    case 'bottom':
      return { band: -step.row, offset: -step.column }
    case 'right':
      return { band: -step.column, offset: step.row }
    case 'left':
      return { band: step.column, offset: -step.row }
    default:
      return { band: step.row, offset: step.column }
  }
}

function directionalReadingOrder(startDirection: GuideStartDirection) {
  return (left: GuideStep, right: GuideStep) => {
    const leftPosition = directionalPosition(left, startDirection)
    const rightPosition = directionalPosition(right, startDirection)
    return (
      leftPosition.band - rightPosition.band ||
      rightPosition.offset - leftPosition.offset
    )
  }
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
      if (!isNumberableGuidePoint(row, column, document.rows, document.columns)) continue
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

function findComponents(
  steps: GuideStep[],
  adjacency: Map<string, string[]>,
  compareOrder: (left: GuideStep, right: GuideStep) => number,
) {
  const unvisited = new Set(steps.map(guideKey))
  const byKey = new Map(steps.map((step) => [guideKey(step), step]))
  const components: GuideStep[][] = []

  while (unvisited.size) {
    const firstKey = unvisited.values().next().value as string
    const pending = [firstKey]
    const component: GuideStep[] = []
    unvisited.delete(firstKey)
    while (pending.length) {
      const key = pending.pop()!
      const step = byKey.get(key)
      if (step) component.push(step)
      for (const neighbor of adjacency.get(key) ?? []) {
        if (!unvisited.delete(neighbor)) continue
        pending.push(neighbor)
      }
    }
    components.push(component.sort(compareOrder))
  }

  return components.sort((left, right) => compareOrder(left[0], right[0]))
}

function directionalSweep(steps: GuideStep[], startDirection: GuideStartDirection) {
  const bands = new Map<number, GuideStep[]>()
  for (const step of steps) {
    const { band } = directionalPosition(step, startDirection)
    const bandSteps = bands.get(band) ?? []
    bandSteps.push(step)
    bands.set(band, bandSteps)
  }

  return [...bands.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, bandSteps], index) => [...bandSteps].sort((left, right) => {
      const leftOffset = directionalPosition(left, startDirection).offset
      const rightOffset = directionalPosition(right, startDirection).offset
      return index % 2 === 0
        ? rightOffset - leftOffset
        : leftOffset - rightOffset
    }))
}

function squaredDistance(left: GuideStep, right: GuideStep) {
  const rowDistance = left.row - right.row
  const columnDistance = left.column - right.column
  return rowDistance ** 2 + columnDistance ** 2
}

function compareLocalCandidates(
  current: GuideStep,
  startDirection: GuideStartDirection,
  horizontalDirection: -1 | 1,
  rowEntryDirection: -1 | 1,
  preferRowEdge: boolean,
  left: GuideStep,
  right: GuideStep,
) {
  const currentPosition = directionalPosition(current, startDirection)
  const leftPosition = directionalPosition(left, startDirection)
  const rightPosition = directionalPosition(right, startDirection)
  const candidateGroup = (candidate: GuideStep) => {
    const candidatePosition = directionalPosition(candidate, startDirection)
    const bandDelta = candidatePosition.band - currentPosition.band
    const offsetDelta = candidatePosition.offset - currentPosition.offset
    if (bandDelta === 0 && Math.sign(offsetDelta) === horizontalDirection) return 0
    if (bandDelta < 0) return 1
    if (bandDelta > 0) return 2
    return 3
  }

  const groupDifference = candidateGroup(left) - candidateGroup(right)
  if (groupDifference) return groupDifference

  if (
    preferRowEdge &&
    leftPosition.band !== currentPosition.band &&
    rightPosition.band !== currentPosition.band
  ) {
    const entryOrder = rowEntryDirection === -1
      ? rightPosition.offset - leftPosition.offset
      : leftPosition.offset - rightPosition.offset
    if (entryOrder) return entryOrder
  }

  return (
    squaredDistance(current, left) - squaredDistance(current, right) ||
    (horizontalDirection === -1
      ? rightPosition.offset - leftPosition.offset
      : leftPosition.offset - rightPosition.offset) ||
    leftPosition.band - rightPosition.band
  )
}

function countRemainingComponents(
  unvisited: Set<string>,
  omittedKey: string,
  adjacency: Map<string, string[]>,
) {
  const seen = new Set<string>()
  let componentCount = 0

  for (const firstKey of unvisited) {
    if (firstKey === omittedKey || seen.has(firstKey)) continue
    componentCount += 1
    const pending = [firstKey]
    seen.add(firstKey)
    while (pending.length) {
      const key = pending.pop()!
      for (const neighbor of adjacency.get(key) ?? []) {
        if (
          neighbor === omittedKey ||
          !unvisited.has(neighbor) ||
          seen.has(neighbor)
        ) {
          continue
        }
        seen.add(neighbor)
        pending.push(neighbor)
      }
    }
  }

  return componentCount
}

function routeSweepScore(
  route: GuideStep[],
  sweepRank: Map<string, number>,
) {
  return route.reduce(
    (score, step, index) => score + Math.abs((sweepRank.get(guideKey(step)) ?? index) - index),
    0,
  )
}

function findContinuousRouteToTarget(
  steps: GuideStep[],
  adjacency: Map<string, string[]>,
  startDirection: GuideStartDirection,
  targetKey: string | null,
) {
  const compareOrder = directionalReadingOrder(startDirection)
  const orderedSteps = [...steps].sort(compareOrder)
  const indexByKey = new Map(orderedSteps.map((step, index) => [guideKey(step), index]))
  const neighbors = orderedSteps.map((step) =>
    (adjacency.get(guideKey(step)) ?? []).flatMap((key) => {
      const index = indexByKey.get(key)
      return index === undefined ? [] : [index]
    }),
  )
  const sweep = directionalSweep(orderedSteps, startDirection)
  const sweepRankByKey = new Map(sweep.map((step, index) => [guideKey(step), index]))
  const sweepRank = orderedSteps.map((step) => sweepRankByKey.get(guideKey(step)) ?? 0)
  const bandSizes = new Map<number, number>()
  for (const step of orderedSteps) {
    const band = directionalPosition(step, startDirection).band
    bandSizes.set(band, (bandSizes.get(band) ?? 0) + 1)
  }
  const targetIndex = targetKey === null ? null : indexByKey.get(targetKey)
  if (targetKey !== null && targetIndex === undefined) return null

  const visited = new Uint8Array(orderedSteps.length)
  const seen = new Uint32Array(orderedSteps.length)
  const route: number[] = []
  let seenToken = 0
  let exploredStates = 0

  const remainingIsViable = (nextIndex: number, remainingCount: number) => {
    if (remainingCount === 0) {
      return targetIndex === null || nextIndex === targetIndex
    }

    visited[nextIndex] = 1
    let viable = neighbors[nextIndex].some((neighbor) => !visited[neighbor])
    let firstUnvisited = -1
    let degreeOneCount = 0

    for (let index = 0; viable && index < orderedSteps.length; index += 1) {
      if (visited[index]) continue
      if (firstUnvisited < 0) firstUnvisited = index

      let availableDegree = 0
      for (const neighbor of neighbors[index]) {
        if (!visited[neighbor] || neighbor === nextIndex) availableDegree += 1
      }
      if (availableDegree === 0) {
        viable = false
      } else if (availableDegree === 1) {
        if (targetIndex === null) {
          degreeOneCount += 1
          if (degreeOneCount > 1) viable = false
        } else if (index !== targetIndex) {
          viable = false
        }
      }
    }

    if (viable) {
      seenToken += 1
      const pending = [firstUnvisited]
      seen[firstUnvisited] = seenToken
      let connectedCount = 0

      while (pending.length) {
        const index = pending.pop()!
        connectedCount += 1
        for (const neighbor of neighbors[index]) {
          if (visited[neighbor] || seen[neighbor] === seenToken) continue
          seen[neighbor] = seenToken
          pending.push(neighbor)
        }
      }
      viable = connectedCount === remainingCount
    }

    visited[nextIndex] = 0
    return viable
  }

  const search = (currentIndex: number): boolean => {
    exploredStates += 1
    if (exploredStates > BACKTRACK_STATE_LIMIT) return false

    visited[currentIndex] = 1
    route.push(currentIndex)
    const remainingCount = orderedSteps.length - route.length
    if (remainingCount === 0) {
      const complete = targetIndex === null || currentIndex === targetIndex
      if (!complete) {
        route.pop()
        visited[currentIndex] = 0
      }
      return complete
    }

    const currentStep = orderedSteps[currentIndex]
    const currentPosition = directionalPosition(currentStep, startDirection)
    const currentRank = sweepRank[currentIndex]
    const candidates = neighbors[currentIndex]
      .filter((index) => (
        !visited[index] &&
        (targetIndex === null || index !== targetIndex || remainingCount === 1)
      ))
      .filter((index) => remainingIsViable(index, remainingCount - 1))
      .sort((left, right) => {
        const forwardGroup = (index: number) => {
          const position = directionalPosition(orderedSteps[index], startDirection)
          return position.band === currentPosition.band && sweepRank[index] > currentRank ? 0 : 1
        }
        const groupDifference = forwardGroup(left) - forwardGroup(right)
        if (groupDifference) return groupDifference
        if ((bandSizes.get(currentPosition.band) ?? 0) === 1) {
          const distanceDifference =
            squaredDistance(currentStep, orderedSteps[left]) -
            squaredDistance(currentStep, orderedSteps[right])
          if (distanceDifference) return distanceDifference
        }
        return (
          sweepRank[left] - sweepRank[right] ||
          compareOrder(orderedSteps[left], orderedSteps[right])
        )
      })

    for (const candidate of candidates) {
      if (search(candidate)) return true
      if (exploredStates > BACKTRACK_STATE_LIMIT) break
    }

    route.pop()
    visited[currentIndex] = 0
    return false
  }

  return search(0) ? route.map((index) => orderedSteps[index]) : null
}

function continuousStitchRoute(
  steps: GuideStep[],
  adjacency: Map<string, string[]>,
  startDirection: GuideStartDirection,
) {
  if (steps.length > BACKTRACK_VERTEX_LIMIT) return null

  const sweep = directionalSweep(steps, startDirection)
  const sweepRank = new Map(sweep.map((step, index) => [guideKey(step), index]))
  const lastBand = directionalPosition(sweep[sweep.length - 1], startDirection).band
  const lastBandSteps = sweep.filter(
    (step) => directionalPosition(step, startDirection).band === lastBand,
  )
  const targetKeys = [lastBandSteps[0], lastBandSteps[lastBandSteps.length - 1]]
    .map(guideKey)
    .filter((key, index, keys) => keys.indexOf(key) === index)

  let bestRoute: GuideStep[] | null = null
  let bestScore = Number.POSITIVE_INFINITY
  // Probar ambos extremos conserva la lectura en serpentina y evita terminar
  // atrapado en el centro de una figura cuando existe una salida más natural.
  for (const target of targetKeys) {
    const route = findContinuousRouteToTarget(steps, adjacency, startDirection, target)
    if (!route) continue
    const score = routeSweepScore(route, sweepRank)
    if (score < bestScore) {
      bestRoute = route
      bestScore = score
    }
  }

  return bestRoute ?? findContinuousRouteToTarget(steps, adjacency, startDirection, null)
}

function localStitchRoute(
  steps: GuideStep[],
  adjacency: Map<string, string[]>,
  startDirection: GuideStartDirection,
) {
  const compareOrder = directionalReadingOrder(startDirection)
  const byKey = new Map(steps.map((step) => [guideKey(step), step]))
  const readingOrder = [...steps].sort(compareOrder)
  const unvisited = new Set(readingOrder.map(guideKey))
  const route: GuideStep[] = []
  let current: GuideStep | null = readingOrder[0]
  let horizontalDirection: -1 | 1 = -1
  let horizontalMovesOnRow = 0

  const closestUnvisited = (from: GuideStep) => {
    let closest: GuideStep | null = null
    for (const candidate of readingOrder) {
      if (!unvisited.has(guideKey(candidate))) continue
      if (
        !closest ||
        squaredDistance(from, candidate) < squaredDistance(from, closest) ||
        (squaredDistance(from, candidate) === squaredDistance(from, closest) &&
          compareOrder(candidate, closest) < 0)
      ) {
        closest = candidate
      }
    }
    return closest
  }

  while (current) {
    const currentStep: GuideStep = current
    const currentKey = guideKey(currentStep)
    if (!unvisited.delete(currentKey)) break
    route.push(currentStep)
    if (!unvisited.size) break

    const neighbors = (adjacency.get(currentKey) ?? []).flatMap((key) => {
      const step = byKey.get(key)
      return step && unvisited.has(key) ? [step] : []
    })
    const rowEntryDirection: -1 | 1 = horizontalMovesOnRow > 0
      ? (horizontalDirection === -1 ? 1 : -1)
      : horizontalDirection
    const remainingComponents = new Map<string, number>()
    if (neighbors.length > 1 && unvisited.size <= CONNECTIVITY_LOOKAHEAD_LIMIT) {
      for (const candidate of neighbors) {
        const candidateKey = guideKey(candidate)
        remainingComponents.set(
          candidateKey,
          countRemainingComponents(unvisited, candidateKey, adjacency),
        )
      }
    }
    const next: GuideStep | null = neighbors.length
      ? [...neighbors].sort((left, right) => {
          const componentDifference =
            (remainingComponents.get(guideKey(left)) ?? 0) -
            (remainingComponents.get(guideKey(right)) ?? 0)
          return componentDifference || compareLocalCandidates(
            currentStep,
            startDirection,
            horizontalDirection,
            rowEntryDirection,
            horizontalMovesOnRow > 0,
            left,
            right,
          )
        })[0]
      : closestUnvisited(currentStep)
    if (!next) break

    const currentPosition = directionalPosition(currentStep, startDirection)
    const nextPosition = directionalPosition(next, startDirection)
    if (nextPosition.band === currentPosition.band) {
      horizontalDirection = nextPosition.offset < currentPosition.offset ? -1 : 1
      horizontalMovesOnRow += 1
    } else {
      horizontalDirection = rowEntryDirection
      if (!neighbors.length && nextPosition.offset !== currentPosition.offset) {
        horizontalDirection = nextPosition.offset > currentPosition.offset ? -1 : 1
      }
      horizontalMovesOnRow = 0
    }
    current = next
  }

  return route
}

function routeIsContinuous(route: GuideStep[]) {
  return route.every(
    (step, index) => index === 0 || areGuideStepsNeighbors(route[index - 1], step),
  )
}

export function generateAutomaticGuide(
  document: PatternDocument,
  startDirection: GuideStartDirection = 'top',
): AutomaticGuideResult {
  const numberableCrosses = findNumberableCrosses(document)
  if (!numberableCrosses.length) {
    return { steps: [], componentCount: 0, continuous: true }
  }

  const adjacency = buildAdjacency(numberableCrosses)
  const compareOrder = directionalReadingOrder(startDirection)
  const components = findComponents(numberableCrosses, adjacency, compareOrder)
  const sweep = directionalSweep(numberableCrosses, startDirection)
  const steps = routeIsContinuous(sweep)
    ? sweep
    : components.flatMap((component) =>
        continuousStitchRoute(component, adjacency, startDirection) ??
        localStitchRoute(component, adjacency, startDirection),
      )

  return {
    steps,
    componentCount: components.length,
    continuous: components.length === 1 && routeIsContinuous(steps),
  }
}
