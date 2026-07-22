import { GRID_STEP, hitTestGuidePoint } from './geometry'

interface Point {
  x: number
  y: number
}

export function collectGuidePointsAlongSegment(
  start: Point,
  end: Point,
  rows: number,
  columns: number,
  visited: Set<string>,
) {
  const positions: Array<[number, number]> = []
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const samples = Math.max(1, Math.ceil(distance / (GRID_STEP * 0.35)))

  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples
    const guidePoint = hitTestGuidePoint(
      start.x + (end.x - start.x) * progress,
      start.y + (end.y - start.y) * progress,
      rows,
      columns,
    )
    if (!guidePoint) continue
    const key = `${guidePoint[0]}:${guidePoint[1]}`
    if (visited.has(key)) continue
    visited.add(key)
    positions.push(guidePoint)
  }

  return positions
}
