import { describe, expect, it } from 'vitest'
import {
  beadKey,
  generateBeads,
  getBeadGeometry,
  getMirroredCells,
  hitTestBead,
  isBeadCell,
  pointInBead,
} from './geometry'

describe('geometría del patrón', () => {
  it('solo genera posiciones alternas y cambia la orientación por fila', () => {
    const beads = generateBeads(4, 5)
    expect(beads).toHaveLength(10)
    expect(beads.every((bead) => isBeadCell(bead.row, bead.column))).toBe(true)
    expect(getBeadGeometry(0, 0).orientation).toBe('vertical')
    expect(getBeadGeometry(1, 1).orientation).toBe('horizontal')
  })

  it('detecta centro, borde exacto y exterior de una elipse', () => {
    const bead = getBeadGeometry(0, 0)
    expect(pointInBead(bead.centerX, bead.centerY, bead)).toBe(true)
    expect(pointInBead(bead.centerX + bead.radiusX, bead.centerY, bead)).toBe(true)
    expect(pointInBead(bead.centerX + bead.radiusX + 0.01, bead.centerY, bead)).toBe(false)
    expect(hitTestBead(bead.centerX, bead.centerY, 5, 5)).toEqual(bead)
    expect(hitTestBead(bead.centerX + 18, bead.centerY, 5, 5)).toBeNull()
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
