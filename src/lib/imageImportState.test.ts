import { describe, expect, it } from 'vitest'
import { DEFAULT_PATTERN } from './patternState'
import {
  createImportedDocument,
  normalizeImportedCells,
  paletteFromCells,
  parseImportKey,
} from './imageImportState'

describe('estado de importación de imagen', () => {
  it('normaliza coordenadas temporales negativas y conserva la paridad', () => {
    const normalized = normalizeImportedCells({
      '-1:1': '#FF0000',
      '0:0': '#00ff00',
      '2:2': '#00ff00',
    })

    expect(normalized).toEqual({
      rows: 25,
      columns: 23,
      cells: {
        '11:11': '#ff0000',
        '12:10': '#00ff00',
        '14:12': '#00ff00',
      },
    })
  })

  it('descarta claves, colores y posiciones inválidas', () => {
    expect(parseImportKey('-2:4')).toEqual([-2, 4])
    expect(parseImportKey('a:b')).toBeNull()
    expect(normalizeImportedCells({ '0:1': '#ffffff', '0:0': 'red' })).toBeNull()
  })

  it('crea un documento transparente, sin guía y conservando el color de fondo', () => {
    const current = {
      ...DEFAULT_PATTERN,
      guideSteps: [{ row: 1, column: 2 }],
      background: { mode: 'solid' as const, color: '#abcdef' },
    }
    const imported = normalizeImportedCells({ '0:0': '#123456' })
    if (!imported) throw new Error('Expected a normalized import')

    expect(createImportedDocument(current, imported)).toMatchObject({
      rows: 21,
      columns: 21,
      cells: { '10:10': '#123456' },
      guideSteps: [],
      background: { mode: 'transparent', color: '#abcdef' },
    })
  })

  it('reserva cinco posiciones visibles vacías por cada lado y respeta el límite', () => {
    const normalized = normalizeImportedCells({ '0:0': '#123456', '4:4': '#654321' })
    expect(normalized).not.toBeNull()
    expect(normalized?.rows).toBe(25)
    expect(normalized?.columns).toBe(25)

    expect(normalizeImportedCells({ '0:0': '#123456', '378:378': '#654321' })).toBeNull()
  })

  it('mantiene el mismo margen al confirmar un resultado ya normalizado', () => {
    expect(normalizeImportedCells({ '10:10': '#123456', '14:14': '#654321' })).toEqual({
      rows: 25,
      columns: 25,
      cells: { '10:10': '#123456', '14:14': '#654321' },
    })
  })

  it('conserva dimensiones y orientación al corregir dentro de la previsualización', () => {
    expect(
      normalizeImportedCells(
        { '10:10': '#123456', '1:1': '#654321' },
        { rows: 25, columns: 25 },
      ),
    ).toEqual({
      rows: 25,
      columns: 25,
      cells: { '10:10': '#123456', '1:1': '#654321' },
    })

    const expanded = normalizeImportedCells({ '10:10': '#123456', '-1:-1': '#654321' })
    expect(expanded?.cells['22:22']).toBe('#123456')
    expect(expanded?.cells['11:11']).toBe('#654321')
  })

  it('ordena la paleta por frecuencia', () => {
    expect(paletteFromCells({ a: '#00ff00', b: '#ff0000', c: '#00FF00' })).toEqual([
      { color: '#00ff00', count: 2 },
      { color: '#ff0000', count: 1 },
    ])
  })
})
