import { describe, expect, it } from 'vitest'
import type { GuideStep, PatternDocument } from '../types'
import { beadKey, isBeadCell } from './geometry'
import { DEFAULT_PATTERN } from './patternState'
import {
  areGuideStepsNeighbors,
  findNumberableCrosses,
  generateAutomaticGuide,
} from './guideNumbering'

function documentForCrosses(crosses: GuideStep[], rows = 15, columns = 15): PatternDocument {
  const cells: Record<string, string> = {}
  for (const { row, column } of crosses) {
    for (const [beadRow, beadColumn] of [
      [row - 1, column],
      [row, column + 1],
      [row + 1, column],
      [row, column - 1],
    ]) {
      cells[beadKey(beadRow, beadColumn)] = '#14b8a6'
    }
  }
  return { ...DEFAULT_PATTERN, rows, columns, cells, guideSteps: [] }
}

function filledDocument(rows: number, columns: number): PatternDocument {
  const cells: Record<string, string> = {}
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (isBeadCell(row, column)) cells[beadKey(row, column)] = '#14b8a6'
    }
  }
  return { ...DEFAULT_PATTERN, rows, columns, cells, guideSteps: [] }
}

function expectConnectedRoute(steps: GuideStep[]) {
  for (let index = 1; index < steps.length; index += 1) {
    expect(areGuideStepsNeighbors(steps[index - 1], steps[index])).toBe(true)
  }
}

describe('numeración automática del recorrido', () => {
  it('acepta una cruz canónica y rechaza un intersticio con orientaciones invertidas', () => {
    expect(findNumberableCrosses(documentForCrosses([{ row: 2, column: 3 }]))).toEqual([
      { row: 2, column: 3 },
    ])
    expect(findNumberableCrosses(documentForCrosses([{ row: 3, column: 2 }]))).toEqual([])
  })

  it('exige las cuatro cuentas pintadas y permite centros junto al borde interior', () => {
    const document = documentForCrosses([{ row: 2, column: 1 }])
    expect(findNumberableCrosses(document)).toEqual([{ row: 2, column: 1 }])
    delete document.cells[beadKey(1, 1)]
    expect(findNumberableCrosses(document)).toEqual([])
  })

  it('conecta centros a dos posiciones, pero no intersticios ni saltos lejanos', () => {
    const center = { row: 4, column: 5 }
    expect(areGuideStepsNeighbors(center, { row: 4, column: 7 })).toBe(true)
    expect(areGuideStepsNeighbors(center, { row: 6, column: 5 })).toBe(true)
    expect(areGuideStepsNeighbors(center, { row: 6, column: 7 })).toBe(true)
    expect(areGuideStepsNeighbors(center, { row: 5, column: 6 })).toBe(false)
    expect(areGuideStepsNeighbors(center, { row: 4, column: 9 })).toBe(false)
  })

  it('usa una serpentina por filas y comienza arriba a la derecha en diseños altos', () => {
    const crosses = [
      { row: 2, column: 1 },
      { row: 2, column: 3 },
      { row: 4, column: 1 },
      { row: 4, column: 3 },
      { row: 6, column: 1 },
      { row: 6, column: 3 },
    ]
    const result = generateAutomaticGuide(documentForCrosses(crosses))

    expect(result.steps).toEqual([
      { row: 2, column: 3 },
      { row: 2, column: 1 },
      { row: 4, column: 1 },
      { row: 4, column: 3 },
      { row: 6, column: 3 },
      { row: 6, column: 1 },
    ])
    expect(result.continuous).toBe(true)
  })

  it('mantiene el barrido horizontal por filas incluso en diseños anchos', () => {
    const crosses = [
      { row: 2, column: 1 },
      { row: 4, column: 1 },
      { row: 2, column: 3 },
      { row: 4, column: 3 },
      { row: 2, column: 5 },
      { row: 4, column: 5 },
    ]
    const result = generateAutomaticGuide(documentForCrosses(crosses))

    expect(result.steps).toEqual([
      { row: 2, column: 5 },
      { row: 2, column: 3 },
      { row: 2, column: 1 },
      { row: 4, column: 1 },
      { row: 4, column: 3 },
      { row: 4, column: 5 },
    ])
    expect(result.continuous).toBe(true)
  })

  it('no altera el orden horizontal para forzar una conexión entre filas', () => {
    const result = generateAutomaticGuide(
      documentForCrosses([
        { row: 2, column: 1 },
        { row: 2, column: 3 },
        { row: 4, column: 5 },
      ]),
    )
    expect(result.steps).toEqual([
      { row: 2, column: 3 },
      { row: 2, column: 1 },
      { row: 4, column: 5 },
    ])
    expect(result.continuous).toBe(false)
  })

  it('reproduce filas de ancho variable como el diseño de referencia', () => {
    const result = generateAutomaticGuide(
      documentForCrosses([
        { row: 2, column: 5 },
        { row: 2, column: 7 },
        { row: 4, column: 5 },
        { row: 4, column: 7 },
        { row: 6, column: 3 },
        { row: 6, column: 5 },
        { row: 6, column: 7 },
        { row: 6, column: 9 },
      ]),
    )

    expect(result.steps).toEqual([
      { row: 2, column: 7 },
      { row: 2, column: 5 },
      { row: 4, column: 5 },
      { row: 4, column: 7 },
      { row: 6, column: 9 },
      { row: 6, column: 7 },
      { row: 6, column: 5 },
      { row: 6, column: 3 },
    ])
  })

  it('cubre e informa las secciones desconectadas', () => {
    const result = generateAutomaticGuide(
      documentForCrosses([
        { row: 2, column: 1 },
        { row: 2, column: 3 },
        { row: 10, column: 11 },
      ]),
    )
    expect(result.steps).toHaveLength(3)
    expect(new Set(result.steps.map((step) => beadKey(step.row, step.column))).size).toBe(3)
    expect(result.componentCount).toBe(2)
    expect(result.continuous).toBe(false)
  })

  it('una retícula 11 por 11 llena produce solo las 20 cruces canónicas', () => {
    const document = filledDocument(11, 11)
    const first = generateAutomaticGuide(document)
    const second = generateAutomaticGuide(document)

    expect(findNumberableCrosses(document)).toHaveLength(20)
    expect(first.steps).toEqual(second.steps)
    expect(first.continuous).toBe(true)
    expectConnectedRoute(first.steps)
  })

  it('procesa diseños densos grandes sin búsqueda exponencial', () => {
    const document = filledDocument(397, 397)
    const result = generateAutomaticGuide(document)

    expect(result.steps).toHaveLength(39006)
    expect(result.continuous).toBe(true)
  })
})
