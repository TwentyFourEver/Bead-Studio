import type { PatternDocument } from '../types'
import { beadKey, isBeadCell, parseBeadKey } from './geometry'

// Direct neighbors in the alternating bead lattice: diagonal and same-axis pairs.
const NEIGHBORS = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]

export function findAdjacentEmptyBeads(document: PatternDocument) {
  const empty = new Set<string>()
  for (const key of Object.keys(document.cells)) {
    const position = parseBeadKey(key)
    if (!position) continue
    for (const [dr, dc] of NEIGHBORS) {
      const row = position[0] + dr
      const column = position[1] + dc
      const neighbor = beadKey(row, column)
      if (row < document.rows && column < document.columns &&
        isBeadCell(row, column) && !document.cells[neighbor]) empty.add(neighbor)
    }
  }
  return empty
}

// Quantize into small RGB buckets, then keep frequent, visually distinct colors.
export function extractReferenceColors(pixels: ArrayLike<number>, limit = 12) {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]]
    const key = `${r >> 4}:${g >> 4}:${b >> 4}`
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }
  const chosen: number[][] = []
  for (const bucket of [...buckets.values()].sort((a, b) => b.count - a.count)) {
    const rgb = [bucket.r, bucket.g, bucket.b].map((channel) => Math.round(channel / bucket.count))
    if (chosen.some((other) => Math.hypot(...rgb.map((channel, i) => channel - other[i])) < 38)) continue
    chosen.push(rgb)
    if (chosen.length >= limit) break
  }
  return chosen.map((rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`)
}
