import { describe, expect, it } from 'vitest'
import { touchGesture, transformTouchGesture } from './touchGesture'
import { clampScale } from './geometry'

describe('gestos del lienzo en tablet', () => {
  const view = { scale: 1, offsetX: 20, offsetY: 30 }
  const start = touchGesture([{ x: 100, y: 100 }, { x: 200, y: 100 }])

  it('mueve el lienzo con dos dedos sin cambiar el zoom', () => {
    const next = touchGesture([{ x: 130, y: 120 }, { x: 230, y: 120 }])
    expect(transformTouchGesture(view, start, next)).toEqual({ scale: 1, offsetX: 50, offsetY: 50 })
  })

  it('amplía alrededor del punto entre los dedos mientras se mueve', () => {
    const next = touchGesture([{ x: 80, y: 140 }, { x: 280, y: 140 }])
    const result = transformTouchGesture(view, start, next)
    expect(result.scale).toBe(2)
    expect((next.x - result.offsetX) / result.scale).toBe((start.x - view.offsetX) / view.scale)
    expect((next.y - result.offsetY) / result.scale).toBe((start.y - view.offsetY) / view.scale)
  })

  it('limita el zoom y admite dedos que se juntan sin producir valores inválidos', () => {
    const next = touchGesture([{ x: 150, y: 100 }, { x: 150, y: 100 }])
    const result = transformTouchGesture(view, start, next)
    expect(result.scale).toBe(clampScale(.01))
    expect(Number.isFinite(result.offsetX)).toBe(true)
    expect(Number.isFinite(result.offsetY)).toBe(true)
  })
})
