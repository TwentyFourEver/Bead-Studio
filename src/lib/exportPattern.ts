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
  if (options.showGuideSteps !== false) drawGuideSteps(context, document)
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
) {
  const steps = (document.guideSteps ?? []).filter((step) =>
    isNumberableGuidePoint(step.row, step.column, document.rows, document.columns),
  )
  if (!steps.length) return

  const routePoints = getGuideRoutePoints(document)

  context.save()
  if (routePoints.length > 1) {
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
    const width = Math.max(13, context.measureText(label).width + 5)

    context.beginPath()
    context.roundRect(centerX - width / 2, centerY - 6.5, width, 13, 4)
    context.fillStyle = index === 0 ? '#9a472f' : 'rgba(255, 255, 255, 0.94)'
    context.fill()
    context.strokeStyle = index === 0 ? '#743321' : 'rgba(94, 85, 77, 0.55)'
    context.stroke()
    context.fillStyle = index === 0 ? '#ffffff' : '#282421'
    context.fillText(label, centerX, centerY + 0.25)
  })
  context.restore()
}

export function drawGuideFlow(
  context: CanvasRenderingContext2D,
  route: GuideRouteAnimation,
  elapsedMilliseconds: number,
) {
  if (route.length === 0) return

  context.save()
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

  context.font = '700 9px Inter, system-ui, sans-serif'
  for (let index = 0; index < route.points.length; index += 1) {
    const labelWidth = Math.max(13, context.measureText(String(index + 1)).width + 5)
    const point = route.points[index]
    context.clearRect(point.x - labelWidth / 2 - 1, point.y - 7.5, labelWidth + 2, 15)
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
    viewport: paintedBounds,
  })

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    const columns = gridDimensionToBeadCount(document.columns)
    const rows = gridDimensionToBeadCount(document.rows)
    link.download = `patron-bisuteria-${columns}x${rows}.png`
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')

  return true
}

function darkenHex(hex: string, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16)
  const factor = 1 - amount
  const red = Math.round(((value >> 16) & 255) * factor)
  const green = Math.round(((value >> 8) & 255) * factor)
  const blue = Math.round((value & 255) * factor)
  return `rgb(${red}, ${green}, ${blue})`
}
