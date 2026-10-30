const PALETTE_STORAGE_KEY = 'bead-studio-custom-colors-v1'
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export const PALETTE_SLOT_COUNT = 12
export const DEFAULT_PALETTE = [
  '#111827', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6',
  '#ec4899', '#f8fafc', '#78716c', '#92400e',
]

export function normalizeCustomColors(colors: Iterable<unknown>) {
  const slots: string[] = []
  for (const color of colors) {
    if (typeof color === 'string' && COLOR_PATTERN.test(color)) slots.push(color.toLowerCase())
    if (slots.length === PALETTE_SLOT_COUNT) break
  }
  // Fill older, shorter palettes without moving the user's existing slots.
  const unusedDefaults = DEFAULT_PALETTE.filter((color) => !slots.includes(color))
  return [...slots, ...unusedDefaults].slice(0, PALETTE_SLOT_COUNT)
}

export function replacePaletteSlot(colors: string[], index: number, color: string) {
  if (!Number.isInteger(index) || index < 0 || index >= PALETTE_SLOT_COUNT || !COLOR_PATTERN.test(color)) return colors
  if (colors[index] === color.toLowerCase()) return colors
  return colors.map((current, slot) => slot === index ? color.toLowerCase() : current)
}

export function loadCustomColors(storage: Pick<Storage, 'getItem'> = localStorage) {
  try {
    const saved: unknown = JSON.parse(storage.getItem(PALETTE_STORAGE_KEY) ?? '[]')
    return normalizeCustomColors(Array.isArray(saved) ? saved : [])
  } catch { return [...DEFAULT_PALETTE] }
}

export function saveCustomColors(colors: string[], storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(normalizeCustomColors(colors)))
}
