import { expect, it } from 'vitest'
import { fitPatternInViewport } from './geometry'
import { resizeCanvasView } from './viewportResize'

it('mantiene el patrón completo al girar la tablet o abrir el panel si estaba ajustado', () => {
  const portrait = { width: 480, height: 800 }
  const landscape = { width: 740, height: 500 }
  const fitted = fitPatternInViewport(portrait.width, portrait.height, 29, 29)
  expect(resizeCanvasView(fitted, portrait, landscape, 29, 29))
    .toEqual(fitPatternInViewport(landscape.width, landscape.height, 29, 29))
})

it('conserva el zoom y el punto central de un detalle ampliado al cambiar de orientación', () => {
  const view = { scale: 3, offsetX: -300, offsetY: -500 }
  const result = resizeCanvasView(view, { width: 480, height: 800 }, { width: 740, height: 500 }, 29, 29)
  expect(result.scale).toBe(3)
  expect((740 / 2 - result.offsetX) / result.scale).toBe((480 / 2 - view.offsetX) / view.scale)
  expect((500 / 2 - result.offsetY) / result.scale).toBe((800 / 2 - view.offsetY) / view.scale)
})
