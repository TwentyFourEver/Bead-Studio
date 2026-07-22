import { describe, expect, it } from 'vitest'
import {
  IMPORT_VISIBLE_MARGIN,
  analyzePatternImage,
  gridToSourcePoint,
  type PixelImage,
  type RGB,
} from './imageAnalysis'
import { normalizeImportedCells } from './imageImportState'

function createImage(width: number, height: number, background: RGB, alpha = 255): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = background.r
    data[index * 4 + 1] = background.g
    data[index * 4 + 2] = background.b
    data[index * 4 + 3] = alpha
  }
  return { width, height, data }
}

function paintPixel(image: PixelImage, x: number, y: number, color: RGB, alpha = 255) {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return
  const offset = (y * image.width + x) * 4
  image.data[offset] = color.r
  image.data[offset + 1] = color.g
  image.data[offset + 2] = color.b
  image.data[offset + 3] = alpha
}

function drawEllipse(
  image: PixelImage,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  rotationDegrees: number,
  color: RGB,
) {
  const radians = rotationDegrees * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const radius = Math.ceil(Math.max(radiusX, radiusY) + 2)
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y += 1) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      const localX = dx * cosine + dy * sine
      const localY = -dx * sine + dy * cosine
      if ((localX / radiusX) ** 2 + (localY / radiusY) ** 2 <= 1) {
        paintPixel(image, x, y, color)
      }
    }
  }
}

function drawRect(image: PixelImage, left: number, top: number, width: number, height: number, color: RGB) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) paintPixel(image, x, y, color)
  }
}

function drawAntialiasedEllipse(
  image: PixelImage,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  color: RGB,
) {
  for (let y = Math.floor(centerY - radiusY - 1); y <= Math.ceil(centerY + radiusY + 1); y += 1) {
    for (let x = Math.floor(centerX - radiusX - 1); x <= Math.ceil(centerX + radiusX + 1); x += 1) {
      let covered = 0
      for (const offsetY of [0.125, 0.375, 0.625, 0.875]) {
        for (const offsetX of [0.125, 0.375, 0.625, 0.875]) {
          if (
            ((x + offsetX - centerX) / radiusX) ** 2 +
            ((y + offsetY - centerY) / radiusY) ** 2 <= 1
          ) covered += 1
        }
      }
      if (!covered || x < 0 || x >= image.width || y < 0 || y >= image.height) continue
      const alpha = covered / 16
      const index = (y * image.width + x) * 4
      paintPixel(image, x, y, {
        r: image.data[index] * (1 - alpha) + color.r * alpha,
        g: image.data[index + 1] * (1 - alpha) + color.g * alpha,
        b: image.data[index + 2] * (1 - alpha) + color.b * alpha,
      })
    }
  }
}

function makePattern(rotationDegrees = 0, transparent = false) {
  const background = { r: 4, g: 57, b: 5 }
  const image = createImage(240, 220, background, transparent ? 0 : 255)
  const center = { x: image.width / 2, y: image.height / 2 }
  const cosine = Math.cos(rotationDegrees * Math.PI / 180)
  const sine = Math.sin(rotationDegrees * Math.PI / 180)
  const rotate = (x: number, y: number) => ({
    x: center.x + (x - center.x) * cosine - (y - center.y) * sine,
    y: center.y + (x - center.x) * sine + (y - center.y) * cosine,
  })
  const positions: Array<{ row: number; column: number; color: RGB }> = []
  for (let row = 0; row < 7; row += 1) {
    for (let column = row % 2; column < 9; column += 2) {
      if ((row === 0 || row === 6) && column > 5) continue
      if (row === 1 && column === 7) continue
      positions.push({
        row,
        column,
        color: row >= 3 && column >= 3 && column <= 5
          ? { r: 142 + (row % 2), g: 96, b: 42 }
          : row % 3 === 0
            ? { r: 23, g: 174 + (column % 3), b: 20 }
            : { r: 104, g: 245, b: 10 },
      })
    }
  }
  for (const bead of positions) {
    const point = rotate(38 + bead.column * 20, 42 + bead.row * 22)
    const horizontal = bead.row % 2 === 0
    drawEllipse(
      image,
      point.x,
      point.y,
      horizontal ? 13 : 8,
      horizontal ? 8 : 13,
      rotationDegrees,
      bead.color,
    )
  }
  if (!transparent) {
    drawRect(image, 14, 88, 3, 16, { r: 255, g: 255, b: 255 })
    drawRect(image, 10, 94, 11, 3, { r: 255, g: 255, b: 255 })
    drawRect(image, 205, 150, 20, 2, { r: 255, g: 255, b: 255 })
  }
  return { image, positions }
}

function makeCircularPattern(rotationDegrees: number) {
  const image = createImage(280, 280, { r: 7, g: 48, b: 9 })
  const center = { x: image.width / 2, y: image.height / 2 }
  const radians = rotationDegrees * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const positions: Array<[number, number]> = []
  for (let row = 0; row < 9; row += 1) {
    for (let column = row % 2; column < 11; column += 2) {
      const sourceX = 45 + column * 19
      const sourceY = 50 + row * 21
      const x = center.x + (sourceX - center.x) * cosine - (sourceY - center.y) * sine
      const y = center.y + (sourceX - center.x) * sine + (sourceY - center.y) * cosine
      drawEllipse(image, x, y, 6, 6, 0, { r: 82, g: 226, b: 24 })
      positions.push([row, column])
    }
  }
  return { image, positions }
}

describe('análisis de diseños de cuentas', () => {
  it('descarta fondo y anotaciones, conserva posiciones y agrupa colores similares', () => {
    const { image, positions } = makePattern()
    const result = analyzePatternImage(image)

    expect(result.canApply).toBe(true)
    expect(result.beads).toHaveLength(positions.length)
    expect(Object.keys(result.cells)).toHaveLength(positions.length)
    expect(result.palette.length).toBe(3)
    expect(result.rows % 2).toBe(1)
    expect(result.columns % 2).toBe(1)
    const gridMargin = IMPORT_VISIBLE_MARGIN * 2
    const detectedRows = result.beads.map((bead) => bead.row)
    const detectedColumns = result.beads.map((bead) => bead.column)
    expect(Math.min(...detectedRows)).toBeGreaterThanOrEqual(gridMargin)
    expect(Math.min(...detectedColumns)).toBeGreaterThanOrEqual(gridMargin)
    expect(result.rows - 1 - Math.max(...detectedRows)).toBeGreaterThanOrEqual(gridMargin)
    expect(result.columns - 1 - Math.max(...detectedColumns)).toBeGreaterThanOrEqual(gridMargin)
    expect(normalizeImportedCells(result.cells)).toEqual({
      rows: result.rows,
      columns: result.columns,
      cells: result.cells,
    })
    expect(result.warnings.some((warning) => warning.includes('ignoraron'))).toBe(true)
  })

  it('corrige una inclinación leve y expone la transformación inversa', () => {
    const { image, positions } = makePattern(10)
    const result = analyzePatternImage(image)

    expect(result.canApply).toBe(true)
    expect(result.beads).toHaveLength(positions.length)
    expect(result.transform).not.toBeNull()
    expect(result.transform?.rotationDegrees).toBeCloseTo(10, 0)
    const first = result.beads[0]
    const point = gridToSourcePoint(result.transform!, first.row, first.column)
    expect(Math.hypot(point.x - first.sourceX, point.y - first.sourceY)).toBeLessThan(1)
  })

  it('corrige rotación negativa y rechaza un óvalo fuera de la retícula', () => {
    const { image, positions } = makePattern(-9)
    drawEllipse(image, 208, 30, 13, 8, -9, { r: 165, g: 30, b: 210 })
    const result = analyzePatternImage(image)

    expect(result.canApply).toBe(true)
    expect(result.transform?.rotationDegrees).toBeCloseTo(-9, 0)
    expect(result.beads).toHaveLength(positions.length)
    expect(result.palette.some((entry) => entry.color === '#a51ed2')).toBe(false)
  })

  it.each([-15, -14, -12, 12, 14, 15])(
    'corrige círculos sin orientación propia rotados %s°',
    (rotationDegrees) => {
      const { image, positions } = makeCircularPattern(rotationDegrees)
      const result = analyzePatternImage(image)

      expect(result.canApply).toBe(true)
      expect(result.beads).toHaveLength(positions.length)
      expect(result.transform?.rotationDegrees).toBeCloseTo(rotationDegrees, 0)
    },
  )

  it('muestrea el interior sin convertir una anotación superpuesta en otro color', () => {
    const { image, positions } = makePattern()
    drawRect(image, 37, 38, 3, 8, { r: 255, g: 255, b: 255 })
    const result = analyzePatternImage(image)

    expect(result.beads).toHaveLength(positions.length)
    expect(result.palette.some((entry) => entry.color === '#ffffff')).toBe(false)
  })

  it('admite transparencia como fondo', () => {
    const { image, positions } = makePattern(0, true)
    const result = analyzePatternImage(image)

    expect(result.background).toBeNull()
    expect(result.beads).toHaveLength(positions.length)
    expect(result.canApply).toBe(true)
  })

  it('tolera bordes antialias sin crear colores adicionales', () => {
    const image = createImage(130, 130, { r: 245, g: 242, b: 235 })
    const beadColor = { r: 40, g: 170, b: 70 }
    for (const [row, column] of [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]]) {
      drawAntialiasedEllipse(image, 35 + column * 22, 35 + row * 22, 12, 8, beadColor)
    }
    const result = analyzePatternImage(image)

    expect(result.canApply).toBe(true)
    expect(result.beads).toHaveLength(5)
    expect(result.palette).toHaveLength(1)
  })

  it('permite seleccionar manualmente un fondo parecido a las cuentas', () => {
    const image = createImage(100, 100, { r: 10, g: 70, b: 10 })
    const color = { r: 14, g: 105, b: 16 }
    for (const [row, column] of [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]]) {
      drawEllipse(image, 30 + column * 18, 30 + row * 18, 10, 7, 0, color)
    }
    const result = analyzePatternImage(image, {
      backgroundMode: 'manual',
      backgroundColor: { r: 10, g: 70, b: 10 },
      backgroundTolerance: 4,
    })

    expect(result.canApply).toBe(true)
    expect(result.beads).toHaveLength(5)
  })

  it('bloquea imágenes sin una retícula suficiente', () => {
    const image = createImage(80, 80, { r: 255, g: 255, b: 255 })
    drawEllipse(image, 40, 40, 10, 7, 0, { r: 255, g: 0, b: 0 })
    const result = analyzePatternImage(image)

    expect(result.canApply).toBe(false)
    expect(result.cells).toEqual({})
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
