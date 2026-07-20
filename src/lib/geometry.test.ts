import { describe, expect, it } from 'vitest'
import {
  beadCountToGridDimension,
  beadKey,
  generateBeads,
  getBeadGeometry,
  getMirroredCells,
  gridDimensionToBeadCount,
  hitTestBead,
  hitTestGuidePoint,
  isBeadCell,
  pointInBead,
} from './geometry'

describe('geometría del patrón', () => {
  it('convierte las dimensiones de la retícula a cuentas visibles por eje', () => {
    expect(gridDimensionToBeadCount(30)).toBe(15)
    expect(beadCountToGridDimension(30)).toBe(59)
    expect(generateBeads(59, 59).filter((bead) => bead.row === 0)).toHaveLength(30)
    expect(generateBeads(59, 59).filter((bead) => bead.column === 0)).toHaveLength(30)
  })

  it('orienta los bordes como una cruz: verticales arriba y abajo, horizontales a los lados', () => {
    const beads = generateBeads(5, 5)
    expect(beads).toHaveLength(13)
    expect(beads.every((bead) => isBeadCell(bead.row, bead.column))).toBe(true)
    expect(getBeadGeometry(0, 0).orientation).toBe('vertical')
    expect(getBeadGeometry(1, 1).orientation).toBe('vertical')
    expect(getBeadGeometry(2, 0, 5).orientation).toBe('horizontal')
    expect(beads.filter((bead) => bead.row === 4).every((bead) => bead.orientation === 'vertical')).toBe(true)
    expect(
      generateBeads(4, 5)
        .filter((bead) => bead.row === 3)
        .every((bead) => bead.orientation === 'vertical'),
    ).toBe(true)
  })

  it('detecta centro, borde exacto y exterior de una elipse', () => {
    const bead = getBeadGeometry(0, 0)
    expect(pointInBead(bead.centerX, bead.centerY, bead)).toBe(true)
    expect(pointInBead(bead.centerX + bead.radiusX, bead.centerY, bead)).toBe(true)
    expect(pointInBead(bead.centerX + bead.radiusX + 0.01, bead.centerY, bead)).toBe(false)
    expect(hitTestBead(bead.centerX, bead.centerY, 5, 5)).toEqual(bead)
    expect(hitTestBead(bead.centerX + 18, bead.centerY, 5, 5)).toBeNull()
  })

  it('detecta los centros disponibles para numerar el recorrido', () => {
    expect(hitTestGuidePoint(48, 28, 5, 5)).toEqual([0, 1])
    expect(hitTestGuidePoint(28, 28, 5, 5)).toBeNull()
    expect(hitTestGuidePoint(61, 28, 5, 5)).toBeNull()
  })

  it('calcula parejas exactas en ambos ejes para dimensiones impares', () => {
    const mirrored = getMirroredCells(0, 0, 5, 5, 'both')
      .map(([row, column]) => beadKey(row, column))
      .sort()
    expect(mirrored).toEqual(['0:0', '0:4', '4:0', '4:4'])
  })

  it('evita devolver posiciones inexistentes', () => {
    expect(isBeadCell(0, 1)).toBe(false)
    expect(getMirroredCells(0, 0, 4, 4, 'vertical')).toEqual([[0, 0]])
  })
})
