import {
  beadKey,
  generateBeads,
  getPatternSize,
  GRID_STEP,
  gridDimensionToBeadCount,
  isNumberableGuidePoint,
  PATTERN_PADDING,
} from './geometry'
import type { PatternDocument } from '../types'

interface RenderOptions {
  scale?: number
  includeShadow?: boolean
  showGuideSteps?: boolean
  showGuideRoute?: boolean
  viewport?: PatternBounds
}

export interface PatternBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface GuideRoutePoint {
  x: number
  y: number
}

export interface GuideRouteAnimation {
  points: GuideRoutePoint[]
  length: number
}

const EXPORT_CONTENT_MARGIN = 2
const GUIDE_FLOW_DASH_LENGTH = 14
const GUIDE_FLOW_SPEED = 30
const GUIDE_START_FILL = '#2f8f5b'
const GUIDE_START_STROKE = '#226b43'
const GUIDE_END_FILL = '#9a472f'
const GUIDE_END_STROKE = '#743321'
const GIF_FRAME_COUNT = 16
const GIF_FRAME_DELAY_MS = 60
const GIF_MAX_SIDE = 1600
const GIF_GUIDE_MARGIN = 22

export type GifExportResult = 'exported' | 'empty-pattern' | 'missing-route'

export function getGuideRoutePoints(document: PatternDocument): GuideRoutePoint[] {
  return (document.guideSteps ?? [])
    .filter((step) =>
      isNumberableGuidePoint(step.row, step.column, document.rows, document.columns),
    )
    .map((step) => ({
      x: PATTERN_PADDING + step.column * GRID_STEP,
      y: PATTERN_PADDING + step.row * GRID_STEP,
    }))
}

function traceGuideRoute(
  context: CanvasRenderingContext2D,
  points: GuideRoutePoint[],
) {
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) context.lineTo(point.x, point.y)
}

export function getGuideRouteAnimation(document: PatternDocument): GuideRouteAnimation {
  const points = getGuideRoutePoints(document)
  let routeLength = 0

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y)
    if (segmentLength === 0) continue
    routeLength += segmentLength
  }

  return { points, length: routeLength }
}

export function getPaintedPatternBounds(document: PatternDocument): PatternBounds | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const bead of generateBeads(document.rows, document.columns)) {
    if (!document.cells[beadKey(bead.row, bead.column)]) continue
    minX = Math.min(minX, bead.centerX - bead.radiusX)
    minY = Math.min(minY, bead.centerY - bead.radiusY)
    maxX = Math.max(maxX, bead.centerX + bead.radiusX)
    maxY = Math.max(maxY, bead.centerY + bead.radiusY)
  }

  if (!Number.isFinite(minX)) return null

  return {
    x: minX - EXPORT_CONTENT_MARGIN,
    y: minY - EXPORT_CONTENT_MARGIN,
    width: maxX - minX + EXPORT_CONTENT_MARGIN * 2,
    height: maxY - minY + EXPORT_CONTENT_MARGIN * 2,
  }
}

export function renderPattern(
  context: CanvasRenderingContext2D,
  document: PatternDocument,
  options: RenderOptions = {},
) {
  const renderScale = options.scale ?? 1
  const { width, height } = getPatternSize(document.rows, document.columns)
  const viewport = options.viewport ?? { x: 0, y: 0, width, height }
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, context.canvas.width, context.canvas.height)
  context.setTransform(
    renderScale,
    0,
    0,
    renderScale,
    -viewport.x * renderScale,
    -viewport.y * renderScale,
  )

  if (document.background.mode === 'solid') {
    context.fillStyle = document.background.color
    context.fillRect(0, 0, width, height)
  }

  drawPatternContent(context, document, { showEmptyBeads: false })
  if (options.showGuideSteps !== false) {
    drawGuideSteps(context, document, { showRoute: options.showGuideRoute })
  }
  context.restore()
}

export function drawPatternContent(
  context: CanvasRenderingContext2D,
  document: PatternDocument,
  options: {
    fillEmptyBeads?: boolean
    showEmptyBeads?: boolean
    showPaintedBeads?: boolean
  } = {},
) {
  context.lineWidth = 1.6
  context.lineJoin = 'round'
  for (const bead of generateBeads(document.rows, document.columns)) {
    const color = document.cells[beadKey(bead.row, bead.column)]
    if (color && options.showPaintedBeads === false) continue
    if (!color && options.showEmptyBeads === false) continue
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

export function drawGuideSteps(
  context: CanvasRenderingContext2D,
  document: PatternDocument,
  options: {
    showRoute?: boolean
    completedStepKeys?: ReadonlySet<string>
  } = {},
) {
  const steps = (document.guideSteps ?? []).filter((step) =>
    isNumberableGuidePoint(step.row, step.column, document.rows, document.columns),
  )
  if (!steps.length) return

  const routePoints = getGuideRoutePoints(document)

  context.save()
  if (options.showRoute !== false && routePoints.length > 1) {
    context.lineCap = 'round'
    context.lineJoin = 'round'

    traceGuideRoute(context, routePoints)
    context.strokeStyle = 'rgba(255, 255, 255, 0.88)'
    context.lineWidth = 5
    context.stroke()

    traceGuideRoute(context, routePoints)
    context.strokeStyle = '#9a472f'
    context.lineWidth = 2.25
    context.stroke()
  }

  context.font = '700 9px Inter, system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 0.9

  steps.forEach((step, index) => {
    const label = String(index + 1)
    const centerX = PATTERN_PADDING + step.column * GRID_STEP
    const centerY = PATTERN_PADDING + step.row * GRID_STEP
    const isCompleted = options.completedStepKeys?.has(beadKey(step.row, step.column)) ?? false
    const width = Math.max(13, context.measureText(label).width + 5)
    const isStart = index === 0
    const isEnd = steps.length > 1 && index === steps.length - 1

    context.beginPath()
    context.roundRect(centerX - width / 2, centerY - 6.5, width, 13, 4)
    context.fillStyle = isCompleted
      ? '#16734b'
      : isStart
        ? GUIDE_START_FILL
        : isEnd
          ? GUIDE_END_FILL
          : 'rgba(255, 255, 255, 0.94)'
    context.fill()
    context.strokeStyle = isCompleted
      ? '#73d7a5'
      : isStart
        ? GUIDE_START_STROKE
        : isEnd
          ? GUIDE_END_STROKE
          : 'rgba(94, 85, 77, 0.55)'
    context.stroke()
    context.fillStyle = isCompleted || isStart || isEnd ? '#ffffff' : '#282421'
    context.fillText(label, centerX, centerY + 0.25)
  })
  context.restore()
}

export function drawGuideFlow(
  context: CanvasRenderingContext2D,
  route: GuideRouteAnimation,
  elapsedMilliseconds: number,
  options: { pulseEndpoints?: boolean } = {},
) {
  if (!route.points.length) return

  context.save()
  if (route.length > 0) {
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.setLineDash([5, 9])
    context.lineDashOffset = -(
      (elapsedMilliseconds / 1000) * GUIDE_FLOW_SPEED % GUIDE_FLOW_DASH_LENGTH
    )
    traceGuideRoute(context, route.points)
    context.strokeStyle = 'rgba(255, 255, 255, 0.98)'
    context.lineWidth = 2.4
    context.shadowColor = 'rgba(255, 255, 255, 0.9)'
    context.shadowBlur = 3.5
    context.stroke()
  }

  context.font = '700 9px Inter, system-ui, sans-serif'
  for (let index = 0; index < route.points.length; index += 1) {
    const labelWidth = Math.max(13, context.measureText(String(index + 1)).width + 5)
    const point = route.points[index]
    context.clearRect(point.x - labelWidth / 2 - 1, point.y - 7.5, labelWidth + 2, 15)
  }

  if (options.pulseEndpoints !== false) {
    const pulse = 0.25 + ((Math.sin(elapsedMilliseconds / 180) + 1) / 2) * 0.75
    const drawEndpointPulse = (index: number, color: string) => {
      const point = route.points[index]
      const labelWidth = Math.max(13, context.measureText(String(index + 1)).width + 5)
      context.beginPath()
      context.roundRect(point.x - labelWidth / 2 - 2, point.y - 8.5, labelWidth + 4, 17, 6)
      context.globalAlpha = pulse
      context.strokeStyle = color
      context.lineWidth = 2.5
      context.shadowColor = color
      context.shadowBlur = 5 + pulse * 4
      context.stroke()
    }

    drawEndpointPulse(0, GUIDE_START_FILL)
    if (route.points.length > 1) {
      drawEndpointPulse(route.points.length - 1, GUIDE_END_FILL)
    }
  }
  context.restore()
}

export function exportPatternPng(document: PatternDocument, showGuideSteps = true) {
  const paintedBounds = getPaintedPatternBounds(document)
  if (!paintedBounds) return false

  const exportScale = 2
  const canvas = window.document.createElement('canvas')
  canvas.width = Math.ceil(paintedBounds.width * exportScale)
  canvas.height = Math.ceil(paintedBounds.height * exportScale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No fue posible preparar la imagen.')
  renderPattern(context, document, {
    scale: exportScale,
    showGuideSteps,
    showGuideRoute: false,
    viewport: paintedBounds,
  })

  canvas.toBlob((blob) => {
    if (!blob) return
    const columns = gridDimensionToBeadCount(document.columns)
    const rows = gridDimensionToBeadCount(document.rows)
    downloadBlob(blob, `patron-bisuteria-${columns}x${rows}.png`)
  }, 'image/png')

  return true
}

export async function exportPatternGif(
  document: PatternDocument,
): Promise<GifExportResult> {
  const paintedBounds = getPaintedPatternBounds(document)
  if (!paintedBounds) return 'empty-pattern'

  const route = getGuideRouteAnimation(document)
  if (route.points.length < 2 || route.length <= 0) return 'missing-route'

  const exportBounds = getGifExportBounds(paintedBounds, route)
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
  const exportScale = Math.min(
    2,
    GIF_MAX_SIDE / Math.max(exportBounds.width, exportBounds.height),
  )
  const width = Math.max(1, Math.ceil(exportBounds.width * exportScale))
  const height = Math.max(1, Math.ceil(exportBounds.height * exportScale))
  const baseCanvas = window.document.createElement('canvas')
  const overlayCanvas = window.document.createElement('canvas')
  const frameCanvas = window.document.createElement('canvas')

  for (const canvas of [baseCanvas, overlayCanvas, frameCanvas]) {
    canvas.width = width
    canvas.height = height
  }

  const baseContext = baseCanvas.getContext('2d')
  const overlayContext = overlayCanvas.getContext('2d')
  const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true })
  if (!baseContext || !overlayContext || !frameContext) {
    throw new Error('No fue posible preparar el GIF.')
  }

  renderPattern(baseContext, document, {
    scale: exportScale,
    showGuideSteps: true,
    showGuideRoute: true,
    viewport: exportBounds,
  })

  const gif = GIFEncoder()
  const transparent = document.background.mode === 'transparent'
  const paletteFormat = transparent ? 'rgba4444' : 'rgb565'
  let palette: number[][] | null = null
  let transparentIndex = 0

  for (let frameIndex = 0; frameIndex < GIF_FRAME_COUNT; frameIndex += 1) {
    overlayContext.setTransform(1, 0, 0, 1, 0, 0)
    overlayContext.clearRect(0, 0, width, height)
    overlayContext.setTransform(
      exportScale,
      0,
      0,
      exportScale,
      -exportBounds.x * exportScale,
      -exportBounds.y * exportScale,
    )
    drawGuideFlow(
      overlayContext,
      route,
      frameIndex * GIF_FRAME_DELAY_MS,
      { pulseEndpoints: false },
    )

    frameContext.setTransform(1, 0, 0, 1, 0, 0)
    frameContext.clearRect(0, 0, width, height)
    frameContext.drawImage(baseCanvas, 0, 0)
    frameContext.drawImage(overlayCanvas, 0, 0)
    const rgba = frameContext.getImageData(0, 0, width, height).data

    if (!palette) {
      palette = quantize(rgba, 256, {
        format: paletteFormat,
        oneBitAlpha: transparent,
      })
      if (transparent) {
        transparentIndex = Math.max(
          0,
          palette.findIndex((color) => color[3] === 0),
        )
      }
    }

    const indexedFrame = applyPalette(rgba, palette, paletteFormat)
    gif.writeFrame(indexedFrame, width, height, {
      palette: frameIndex === 0 ? palette : undefined,
      delay: GIF_FRAME_DELAY_MS,
      repeat: 0,
      transparent,
      transparentIndex,
      dispose: transparent ? 2 : 0,
    })

    if ((frameIndex + 1) % 4 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
  }

  gif.finish()
  const bytes = gif.bytes()
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const columns = gridDimensionToBeadCount(document.columns)
  const rows = gridDimensionToBeadCount(document.rows)
  downloadBlob(
    new Blob([buffer], { type: 'image/gif' }),
    `patron-bisuteria-${columns}x${rows}.gif`,
  )
  return 'exported'
}

function getGifExportBounds(
  paintedBounds: PatternBounds,
  route: GuideRouteAnimation,
): PatternBounds {
  const routeMinX = Math.min(...route.points.map((point) => point.x)) - GIF_GUIDE_MARGIN
  const routeMinY = Math.min(...route.points.map((point) => point.y)) - GIF_GUIDE_MARGIN
  const routeMaxX = Math.max(...route.points.map((point) => point.x)) + GIF_GUIDE_MARGIN
  const routeMaxY = Math.max(...route.points.map((point) => point.y)) + GIF_GUIDE_MARGIN
  const x = Math.min(paintedBounds.x, routeMinX)
  const y = Math.min(paintedBounds.y, routeMinY)
  const right = Math.max(paintedBounds.x + paintedBounds.width, routeMaxX)
  const bottom = Math.max(paintedBounds.y + paintedBounds.height, routeMaxY)
  return { x, y, width: right - x, height: bottom - y }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function darkenHex(hex: string, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16)
  const factor = 1 - amount
  const red = Math.round(((value >> 16) & 255) * factor)
  const green = Math.round(((value >> 8) & 255) * factor)
  const blue = Math.round((value & 255) * factor)
  return `rgb(${red}, ${green}, ${blue})`
}
