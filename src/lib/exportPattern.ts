import { beadKey, generateBeads, getPatternSize } from './geometry'
import type { PatternDocument } from '../types'

interface RenderOptions {
  scale?: number
  includeShadow?: boolean
}

export function renderPattern(
  context: CanvasRenderingContext2D,
  document: PatternDocument,
  options: RenderOptions = {},
) {
  const renderScale = options.scale ?? 1
  const { width, height } = getPatternSize(document.rows, document.columns)
  context.save()
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0)
  context.clearRect(0, 0, width, height)

  if (document.background.mode === 'solid') {
    context.fillStyle = document.background.color
    context.fillRect(0, 0, width, height)
  }

  drawPatternContent(context, document)
  context.restore()
}

export function drawPatternContent(
  context: CanvasRenderingContext2D,
  document: PatternDocument,
  options: { fillEmptyBeads?: boolean } = {},
) {
  context.lineWidth = 1.6
  context.lineJoin = 'round'
  for (const bead of generateBeads(document.rows, document.columns)) {
    const color = document.cells[beadKey(bead.row, bead.column)]
    context.beginPath()
    context.ellipse(
      bead.centerX,
      bead.centerY,
      bead.radiusX,
      bead.radiusY,
      0,
      0,
      Math.PI * 2,
    )
    if (color) {
      context.fillStyle = color
      context.fill()
    } else if (document.background.mode === 'solid' && options.fillEmptyBeads !== false) {
      context.fillStyle = document.background.color
      context.fill()
    }
    context.strokeStyle = color ? darkenHex(color, 0.28) : '#6c6a67'
    context.stroke()

    if (color) {
      context.beginPath()
      context.ellipse(
        bead.centerX - bead.radiusX * 0.24,
        bead.centerY - bead.radiusY * 0.22,
        bead.radiusX * 0.22,
        bead.radiusY * 0.18,
        0,
        0,
        Math.PI * 2,
      )
      context.fillStyle = 'rgba(255, 255, 255, 0.28)'
      context.fill()
    }
  }
}

export function exportPatternPng(document: PatternDocument) {
  const { width, height } = getPatternSize(document.rows, document.columns)
  const exportScale = 2
  const canvas = window.document.createElement('canvas')
  canvas.width = Math.ceil(width * exportScale)
  canvas.height = Math.ceil(height * exportScale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No fue posible preparar la imagen.')
  renderPattern(context, document, { scale: exportScale })

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `patron-bisuteria-${document.columns}x${document.rows}.png`
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

function darkenHex(hex: string, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16)
  const factor = 1 - amount
  const red = Math.round(((value >> 16) & 255) * factor)
  const green = Math.round(((value >> 8) & 255) * factor)
  const blue = Math.round((value & 255) * factor)
  return `rgb(${red}, ${green}, ${blue})`
}
