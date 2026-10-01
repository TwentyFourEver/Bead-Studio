import { describe, expect, it } from 'vitest'
import { extractReferenceColors, findAdjacentEmptyBeads } from './designSuggestions'
import { DEFAULT_PATTERN } from './patternState'

describe('recomendaciones del diseño', () => {
  it('detecta vecinos vacíos en la retícula alternada sin salir de los bordes', () => {
    const document = { ...DEFAULT_PATTERN, rows: 5, columns: 5, cells: { '0:0': '#ff0000' } }
    expect([...findAdjacentEmptyBeads(document)].sort()).toEqual(['0:2', '1:1', '2:0'])
  })

  it('actualiza las recomendaciones al pintar y no marca cuentas existentes', () => {
    const document = { ...DEFAULT_PATTERN, rows: 5, columns: 5,
      cells: { '0:0': '#ff0000', '1:1': '#00ff00' } }
    const result = findAdjacentEmptyBeads(document)
    expect(result.has('1:1')).toBe(false)
    expect(result.has('2:2')).toBe(true)
    expect(findAdjacentEmptyBeads({ ...document, cells: {} }).size).toBe(0)
  })

  it('ignora transparencia y ordena los colores de la referencia por frecuencia', () => {
    expect(extractReferenceColors([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0,
    ])).toEqual(['#ff0000', '#0000ff'])
    expect(extractReferenceColors([0, 0, 0, 0])).toEqual([])
  })

  it('agrupa tonos cercanos sin llenar la paleta de variantes y limita las sugerencias', () => {
    const pixels = [255, 0, 0, 255, 252, 3, 3, 255, 0, 0, 255, 255]
    expect(extractReferenceColors(pixels)).toEqual(['#fe0202', '#0000ff'])
    expect(extractReferenceColors(pixels, 1)).toEqual(['#fe0202'])
  })
})
