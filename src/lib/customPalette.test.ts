import { describe, expect, it } from 'vitest'
import { loadCustomColors, mergeCustomColors, saveCustomColors } from './customPalette'

describe('paleta personal', () => {
  it('conserva colores cuando se vacían las cuentas y evita duplicados', () => {
    const colors = mergeCustomColors([], ['#ABCDEF', '#123456', '#abcdef'])
    expect(colors).toEqual(['#abcdef', '#123456'])
    expect(mergeCustomColors(colors, [])).toBe(colors)
    expect(mergeCustomColors(colors, ['#abcdef'])).toBe(colors)
  })

  it('guarda y recupera la paleta independientemente del documento', () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) } }
    saveCustomColors(['#abcdef', '#123456'], storage)
    storage.setItem('bead-studio-pattern-v1', JSON.stringify({ cells: {} }))
    expect(loadCustomColors(storage)).toEqual(['#abcdef', '#123456'])
  })

  it('descarta datos corruptos, colores inválidos y tolera errores del almacenamiento', () => {
    expect(loadCustomColors({ getItem: () => '["#ABCDEF",null,3,"bad"]' })).toEqual(['#abcdef'])
    expect(loadCustomColors({ getItem: () => '{bad' })).toEqual([])
    expect(loadCustomColors({ getItem: () => { throw new Error('storage') } })).toEqual([])
  })
})
