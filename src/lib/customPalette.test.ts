import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, loadCustomColors, normalizeCustomColors, replacePaletteSlot, saveCustomColors } from './customPalette'

describe('paleta personal', () => {
  it('migra una paleta antigua con muchos tonos a doce espacios', () => {
    const oldColors = Array.from({ length: 100 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`)
    const restored = loadCustomColors({ getItem: () => JSON.stringify(oldColors) })
    expect(restored).toEqual(oldColors.slice(0, 12))
    expect(normalizeCustomColors(['#ABCDEF', '#123456'])).toHaveLength(12)
    expect(normalizeCustomColors(['#ABCDEF', '#123456']).slice(0, 2)).toEqual(['#abcdef', '#123456'])
  })

  it('cambia un espacio sin acumular tonos ni mover los demás', () => {
    const colors = replacePaletteSlot(DEFAULT_PALETTE, 5, '#ABCDEF')
    const changed = replacePaletteSlot(colors, 5, '#123456')
    expect(changed).toHaveLength(12)
    expect(changed[5]).toBe('#123456')
    expect(changed).not.toContain('#abcdef')
    expect(changed.filter((_, index) => index !== 5)).toEqual(DEFAULT_PALETTE.filter((_, index) => index !== 5))
    expect(replacePaletteSlot(colors, -1, '#123456')).toBe(colors)
  })

  it('guarda y recupera la paleta independientemente del documento', () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) } }
    const colors = replacePaletteSlot(DEFAULT_PALETTE, 0, '#abcdef')
    saveCustomColors(colors, storage)
    storage.setItem('bead-studio-pattern-v1', JSON.stringify({ cells: {} }))
    expect(loadCustomColors(storage)).toEqual(colors)
  })

  it('descarta datos corruptos, colores inválidos y tolera errores del almacenamiento', () => {
    const recovered = loadCustomColors({ getItem: () => '["#ABCDEF",null,3,"bad"]' })
    expect(recovered).toHaveLength(12)
    expect(recovered[0]).toBe('#abcdef')
    expect(loadCustomColors({ getItem: () => '{bad' })).toEqual(DEFAULT_PALETTE)
    expect(loadCustomColors({ getItem: () => { throw new Error('storage') } })).toEqual(DEFAULT_PALETTE)
  })
})
