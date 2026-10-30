import type { ViewTransform } from '../types'
import { fitPatternInViewport } from './geometry'

interface Viewport { width: number; height: number }

export function resizeCanvasView(view: ViewTransform, previous: Viewport, next: Viewport, rows: number, columns: number) {
  if (!previous.width || !previous.height || !next.width || !next.height) return view
  const fitted = fitPatternInViewport(previous.width, previous.height, rows, columns)
  if (Math.abs(view.scale - fitted.scale) < .001 &&
      Math.abs(view.offsetX - fitted.offsetX) < 1 && Math.abs(view.offsetY - fitted.offsetY) < 1) {
    return fitPatternInViewport(next.width, next.height, rows, columns)
  }
  return { ...view,
    offsetX: view.offsetX + (next.width - previous.width) / 2,
    offsetY: view.offsetY + (next.height - previous.height) / 2,
  }
}
