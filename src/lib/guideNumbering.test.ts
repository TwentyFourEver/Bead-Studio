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

  it('genera una serpentina distinta desde cada lado elegido', () => {
    const document = documentForCrosses([
      { row: 2, column: 1 },
      { row: 2, column: 3 },
      { row: 4, column: 1 },
      { row: 4, column: 3 },
    ])

    expect(generateAutomaticGuide(document).steps).toEqual(
      generateAutomaticGuide(document, 'top').steps,
    )
    expect(generateAutomaticGuide(document, 'top').steps).toEqual([
      { row: 2, column: 3 },
      { row: 2, column: 1 },
      { row: 4, column: 1 },
      { row: 4, column: 3 },
    ])
    expect(generateAutomaticGuide(document, 'right').steps).toEqual([
      { row: 4, column: 3 },
      { row: 2, column: 3 },
      { row: 2, column: 1 },
      { row: 4, column: 1 },
    ])
    expect(generateAutomaticGuide(document, 'bottom').steps).toEqual([
      { row: 4, column: 1 },
      { row: 4, column: 3 },
      { row: 2, column: 3 },
      { row: 2, column: 1 },
    ])
    expect(generateAutomaticGuide(document, 'left').steps).toEqual([
      { row: 2, column: 1 },
      { row: 4, column: 1 },
      { row: 4, column: 3 },
      { row: 2, column: 3 },
    ])
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

  it('atiende una rama corta antes de dejarla aislada', () => {
    const result = generateAutomaticGuide(
      documentForCrosses([
        { row: 2, column: 1 },
        { row: 2, column: 3 },
        { row: 2, column: 5 },
        { row: 2, column: 7 },
        { row: 4, column: 5 },
      ]),
    )

    expect(result.steps).toEqual([
      { row: 2, column: 7 },
      { row: 2, column: 5 },
      { row: 4, column: 5 },
      { row: 2, column: 3 },
      { row: 2, column: 1 },
    ])
    expect(result.continuous).toBe(true)
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

  it('continúa junto al punto superior cuando la fila siguiente es mucho más ancha', () => {
    const result = generateAutomaticGuide(
      documentForCrosses([
        { row: 2, column: 7 },
        { row: 4, column: 1 },
        { row: 4, column: 3 },
        { row: 4, column: 5 },
        { row: 4, column: 7 },
        { row: 4, column: 9 },
        { row: 4, column: 11 },
        { row: 4, column: 13 },
        { row: 6, column: 1 },
        { row: 6, column: 3 },
        { row: 6, column: 5 },
        { row: 6, column: 7 },
        { row: 6, column: 9 },
        { row: 6, column: 11 },
        { row: 6, column: 13 },
      ]),
    )

    expect(result.steps[0]).toEqual({ row: 2, column: 7 })
    expect(result.steps[1]).toEqual({ row: 4, column: 7 })
    expect(areGuideStepsNeighbors(result.steps[0], result.steps[1])).toBe(true)
    expect(result.continuous).toBe(true)
    expectConnectedRoute(result.steps)
  })

  it('evita el salto 36 a 37 del diseño de referencia al comenzar por la izquierda', () => {
    const range = (start: number, end: number) => {
      const columns: number[] = []
      for (let column = start; column <= end; column += 2) columns.push(column)
      return columns
    }
    const crosses = [
      ...range(5, 15).map((column) => ({ row: 2, column })),
      ...range(5, 19).map((column) => ({ row: 4, column })),
      ...range(1, 19).map((column) => ({ row: 6, column })),
      ...range(5, 15).map((column) => ({ row: 8, column })),
      ...range(5, 15).map((column) => ({ row: 10, column })),
      ...range(7, 13).map((column) => ({ row: 12, column })),
    ]
    const document = documentForCrosses(crosses, 15, 21)
    const fromTop = generateAutomaticGuide(document, 'top')
    const fromLeft = generateAutomaticGuide(document, 'left')

    expect(fromTop.steps[35]).toEqual({ row: 6, column: 1 })
    expect(fromTop.steps[36]).toEqual({ row: 12, column: 7 })
    expect(areGuideStepsNeighbors(fromTop.steps[35], fromTop.steps[36])).toBe(false)
    expect(fromLeft.steps[0]).toEqual({ row: 6, column: 1 })
    expect(fromLeft.continuous).toBe(true)
    expectConnectedRoute(fromLeft.steps)
  })

  it('termina una rama separada antes de pasar a la siguiente', () => {
    const bodyColumns = [1, 3, 5, 7, 9, 11, 13, 15]
    const crosses = [
      ...bodyColumns.map((column) => ({ row: 2, column })),
      ...bodyColumns.map((column) => ({ row: 4, column })),
      ...[6, 8, 10].flatMap((row) => [
        { row, column: 1 },
        { row, column: 3 },
        { row, column: 13 },
        { row, column: 15 },
      ]),
      ...[1, 3, 5, 11, 13, 15].map((column) => ({ row: 12, column })),
    ]
    const result = generateAutomaticGuide(documentForCrosses(crosses, 17, 17))
    const branchGroups = result.steps
      .filter((step) => step.row >= 6)
      .map((step) => (step.column <= 5 ? 'left' : 'right'))
    const groupChanges = branchGroups.reduce(
      (count, group, index) => count + (index > 0 && branchGroups[index - 1] !== group ? 1 : 0),
      0,
    )
    expect(groupChanges).toBeLessThanOrEqual(1)
    expect(result.continuous).toBe(true)
    expectConnectedRoute(result.steps)
    expect(new Set(result.steps.map((step) => beadKey(step.row, step.column))).size).toBe(
      crosses.length,
    )
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

  it('agota cada sección desconectada sin alternar entre ellas', () => {
    const firstSection = [
      { row: 2, column: 7 },
      ...[1, 3, 5, 7, 9, 11, 13].map((column) => ({ row: 4, column })),
      { row: 6, column: 1 },
      { row: 8, column: 1 },
      { row: 6, column: 13 },
      { row: 8, column: 13 },
    ]
    const secondSection = [
      { row: 12, column: 1 },
      { row: 12, column: 3 },
      { row: 14, column: 1 },
      { row: 14, column: 3 },
    ]
    const firstKeys = new Set(firstSection.map((step) => beadKey(step.row, step.column)))
    const result = generateAutomaticGuide(
      documentForCrosses([...firstSection, ...secondSection], 17, 17),
    )
    const sections = result.steps.map((step) =>
      firstKeys.has(beadKey(step.row, step.column)) ? 'first' : 'second',
    )
    const sectionChanges = sections.reduce(
      (count, section, index) =>
        count + (index > 0 && sections[index - 1] !== section ? 1 : 0),
      0,
    )

    expect(result.componentCount).toBe(2)
    expect(sectionChanges).toBe(1)
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
