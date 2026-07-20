import { describe, expect, it } from 'vitest'
import type { PatternDocument } from '../types'
import {
  DEFAULT_PATTERN,
  STORAGE_KEY,
  isPatternDocument,
  loadPattern,
  moveCells,
  paintCells,
  resizePattern,
  savePattern,
} from './patternState'

const base: PatternDocument = {
  ...DEFAULT_PATTERN,
  rows: 5,
  columns: 5,
  cells: { '0:0': '#ff0000', '2:2': '#00ff00', '4:4': '#0000ff' },
}

describe('estado del patrón', () => {
  it('pinta y borra sin mutar el documento previo', () => {
    const painted = paintCells(base, [[0, 2]], '#abcdef')
    expect(painted.cells['0:2']).toBe('#abcdef')
    expect(base.cells['0:2']).toBeUndefined()
    const erased = paintCells(painted, [[0, 2]], null)
    expect(erased.cells['0:2']).toBeUndefined()
  })

  it('mueve una seleccion conservando sus colores y reemplaza el destino', () => {
    const moved = moveCells(base, ['0:0', '2:2'], 0, 2)
    expect(moved.cells).toEqual({
      '0:2': '#ff0000',
      '2:4': '#00ff00',
      '4:4': '#0000ff',
    })
    expect(base.cells['0:0']).toBe('#ff0000')
  })

  it('no mueve una seleccion fuera del lienzo ni a huecos invalidos', () => {
    expect(moveCells(base, ['0:0'], -1, -1)).toBe(base)
    expect(moveCells(base, ['0:0'], 0, 1)).toBe(base)
  })

  it('conserva el contenido alrededor del centro al ampliar', () => {
    const resized = resizePattern({ ...base, guideSteps: [{ row: 1, column: 2 }] }, 7, 7)
    expect(resized.rows).toBe(7)
    expect(resized.columns).toBe(7)
    expect(Object.keys(resized.cells)).toHaveLength(3)
    expect(resized.cells['3:3']).toBe('#00ff00')
    expect(resized.guideSteps).toEqual([{ row: 2, column: 3 }])
  })

  it('recorta las bolitas que quedan fuera al reducir', () => {
    const resized = resizePattern(base, 3, 3)
    expect(Object.keys(resized.cells)).toHaveLength(1)
    expect(resized.cells['1:1']).toBe('#00ff00')
  })

  it('valida, persiste y recupera documentos correctos', () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    }
    savePattern(base, storage)
    expect(memory.has(STORAGE_KEY)).toBe(true)
    expect(loadPattern(storage)).toEqual(base)
    expect(isPatternDocument(base)).toBe(true)
  })

  it('rechaza números duplicados o colocados sobre una cuenta', () => {
    expect(isPatternDocument({ ...base, guideSteps: [{ row: 1, column: 2 }] })).toBe(true)
    expect(
      isPatternDocument({
        ...base,
        guideSteps: [{ row: 1, column: 2 }, { row: 1, column: 2 }],
      }),
    ).toBe(false)
    expect(isPatternDocument({ ...base, guideSteps: [{ row: 0, column: 0 }] })).toBe(false)
  })

  it('restaura el estado inicial si el guardado está corrupto', () => {
    const storage = { getItem: () => '{invalid' }
    expect(loadPattern(storage)).toEqual(DEFAULT_PATTERN)
  })
})
