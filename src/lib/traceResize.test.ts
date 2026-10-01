import { describe, expect, it } from 'vitest'
import { getTraceImageSize, type TraceImage } from '../types'
import { resizeTraceFromCorner, type TraceCorner } from './traceResize'

export const sampleTrace: TraceImage = {
  src: 'data:image/png;base64,test', name: 'test.png', naturalWidth: 200, naturalHeight: 100,
  baseScale: 0.5, scalePercent: 100, x: 20, y: 30, opacity: 0.5, visible: true,
}

describe('redimensionar el calcado', () => {
  it('amplía desde una esquina conservando proporciones y mantiene el otro extremo fijo', () => {
    const resized = resizeTraceFromCorner(sampleTrace, 'se', 50, 5)
    expect(getTraceImageSize(resized)).toEqual({ width: 150, height: 75 })
    expect(resized.x).toBe(20)
    expect(resized.y).toBe(30)
    expect(getTraceImageSize(sampleTrace)).toEqual({ width: 100, height: 50 })
  })

  it.each<TraceCorner>(['nw', 'ne', 'sw', 'se'])('ajusta ancho y alto por separado desde %s', (corner) => {
    const left = corner.endsWith('w')
    const top = corner.startsWith('n')
    const resized = resizeTraceFromCorner(sampleTrace, corner, left ? -20 : 20, top ? -30 : 30, false)
    expect(getTraceImageSize(resized)).toEqual({ width: 120, height: 80 })
    expect(resized.x).toBe(left ? 0 : 20)
    expect(resized.y).toBe(top ? 0 : 30)
  })

  it('permite reducir y detiene el arrastre antes de invertir la imagen', () => {
    const resized = resizeTraceFromCorner(sampleTrace, 'nw', 500, 500)
    expect(getTraceImageSize(resized)).toEqual({ width: 16, height: 8 })
    expect(resized.x + getTraceImageSize(resized).width).toBe(120)
    expect(resized.y + getTraceImageSize(resized).height).toBe(80)
    expect(getTraceImageSize(resizeTraceFromCorner(sampleTrace, 'se', -500, -500, false)))
      .toEqual({ width: 8, height: 8 })
  })

  it('respeta el tamaño y las proporciones ya modificados al volver a arrastrar o usar el deslizador', () => {
    const stretched = resizeTraceFromCorner({ ...sampleTrace, scalePercent: 150 }, 'se', 50, 25, false)
    expect(getTraceImageSize(stretched)).toEqual({ width: 200, height: 100 })
    const bigger = resizeTraceFromCorner(stretched, 'se', 100, 0)
    expect(getTraceImageSize(bigger)).toEqual({ width: 300, height: 150 })
    expect(getTraceImageSize({ ...bigger, scalePercent: 75 })).toEqual({ width: 150, height: 75 })
    expect(resizeTraceFromCorner(sampleTrace, 'se', 0, 0)).toBe(sampleTrace)
  })
})
