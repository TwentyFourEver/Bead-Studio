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

function parseCrosses(source: string): GuideStep[] {
  return source.trim().split(/\s+/).map((key) => {
    const [row, column] = key.split(':').map(Number)
    return { row, column }
  })
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

  it('evita el salto del diseño de referencia desde arriba y desde la izquierda', () => {
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

    expect(fromTop.continuous).toBe(true)
    expectConnectedRoute(fromTop.steps)
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

  it('resuelve el recorrido irregular de Snoopy sin saltos ni puntos repetidos', () => {
    const crosses = parseCrosses(`
      10:35 10:33 10:31 10:29 10:27 12:25 12:27 12:29 12:31 12:33 12:35 12:37
      14:39 14:37 14:35 14:33 14:31 14:29 14:27 14:25 14:23 16:21 16:23 16:25
      16:27 16:29 16:31 16:33 16:35 16:37 16:39 18:41 18:39 18:37 18:35 18:33
      18:31 18:29 18:27 18:25 18:23 18:21 18:19 16:19 18:17 18:15 20:13 20:15
      20:17 20:19 20:21 20:23 20:25 20:27 20:29 20:31 20:33 20:35 20:37 20:39
      20:41 22:41 22:39 22:37 22:35 22:33 22:31 22:29 22:27 22:25 22:23 22:21
      22:19 22:17 22:15 24:17 24:19 26:21 24:21 24:23 26:23 26:25 24:25 24:27
      26:27 26:29 24:29 24:31 26:31 26:33 24:33 24:35 26:35 26:37 24:37 24:39
      24:41 26:41 26:39 28:39 28:37 28:35 28:33 28:31 28:29 28:27 28:25 30:25
      30:27 30:29 30:31 32:29 32:27 32:25 32:23 34:23 34:25 34:27 34:29 36:31
      36:29 36:27 36:25 36:23 36:21 38:21 38:23 38:25 38:27 38:29 38:31 40:31
      40:29 40:27 40:25 40:23 40:21 42:23 42:25 42:27 42:29 42:31 42:33 44:33
      44:31 44:29 44:27 44:25 46:25 46:27 46:29 46:31 46:33 48:31 48:29 48:27
      48:25 48:23 48:21 50:21 50:23 50:25 50:27 50:29 50:31
    `)
    const result = generateAutomaticGuide(documentForCrosses(crosses, 63, 55))

    expect(result.steps).toHaveLength(crosses.length)
    expect(new Set(result.steps.map((step) => beadKey(step.row, step.column))).size).toBe(
      crosses.length,
    )
    expect(result.componentCount).toBe(1)
    expect(result.continuous).toBe(true)
    expectConnectedRoute(result.steps)
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
