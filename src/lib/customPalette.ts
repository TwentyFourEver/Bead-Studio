const PALETTE_STORAGE_KEY = 'bead-studio-custom-colors-v1'
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function mergeCustomColors(current: string[], additions: Iterable<string>) {
  const colors = new Set(current)
  for (const color of additions) {
    if (COLOR_PATTERN.test(color)) colors.add(color.toLowerCase())
  }
  return colors.size === current.length ? current : [...colors]
}

export function loadCustomColors(storage: Pick<Storage, 'getItem'> = localStorage) {
  try {
    const saved: unknown = JSON.parse(storage.getItem(PALETTE_STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? mergeCustomColors([], saved.filter((item) => typeof item === 'string')) : []
  } catch { return [] }
}

export function saveCustomColors(colors: string[], storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(colors))
}
