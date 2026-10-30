import type { ViewTransform } from '../types'
import { clampScale } from './geometry'

export interface TouchPoint { x: number; y: number }

export function touchGesture(points: TouchPoint[]) {
  const [first, second] = points
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
  }
}

export function transformTouchGesture(view: ViewTransform, start: ReturnType<typeof touchGesture>, next: ReturnType<typeof touchGesture>): ViewTransform {
  const scale = clampScale(view.scale * next.distance / start.distance)
  return {
    scale,
    offsetX: next.x - (start.x - view.offsetX) / view.scale * scale,
    offsetY: next.y - (start.y - view.offsetY) / view.scale * scale,
  }
}
