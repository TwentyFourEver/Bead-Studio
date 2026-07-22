import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import {
  type DetectedBead,
  type GridTransform,
  type PatternAnalysisResult,
} from '../lib/imageAnalysis'

type RGB = { r: number; g: number; b: number }

interface ImageImportDialogProps {
  open: boolean
  source: string
  fileName: string
  result: PatternAnalysisResult | null
  analyzing: boolean
  error: string | null
  backgroundMode: 'auto' | 'manual'
  backgroundTolerance: number
  colorMergeDelta: number
  onBackgroundModeChange: (mode: 'auto' | 'manual') => void
  onBackgroundToleranceChange: (value: number) => void
  onColorMergeDeltaChange: (value: number) => void
  onPickBackground: (rgb: RGB) => void
  onToggleCell: (row: number, column: number) => void
  onCancel: () => void
  onConfirm: () => void
}

interface CompatibleResult {
  imageWidth?: number
  imageHeight?: number
  rows: number
  columns: number
  cells: Record<string, string>
  palette: unknown
  beads: DetectedBead[]
  backgroundColor?: string | RGB | null
  background?: string | RGB | null
  backgroundTolerance?: number
  rotationDegrees?: number
  grid?: { rotationDegrees?: number; sourceWidth?: number; sourceHeight?: number } | null
  transform?: GridTransform | null
  confidence: number
  warnings: string[]
  canApply: boolean
}

type CompatibleBead = DetectedBead & {
  sourceX?: number
  sourceY?: number
  centerX?: number
  centerY?: number
  x?: number
  y?: number
  row?: number
  column?: number
  color?: string
  radiusX?: number
  radiusY?: number
  score?: number
}

interface PaletteEntry {
  color: string
  count: number
}

interface CanvasSize {
  width: number
  height: number
}

interface SourceDrawRect {
  x: number
  y: number
  width: number
  height: number
}

interface PatternDrawTransform {
  offsetX: number
  offsetY: number
  scale: number
  padding: number
  step: number
}

interface ViewState {
  source: string
  zoom: number
  pan: { x: number; y: number }
}

interface PatternCell {
  row: number
  column: number
}

interface PatternDragState {
  pointerId: number
  paint: boolean
  visited: Set<string>
  lastX: number
  lastY: number
}

interface PatternPanDragState {
  pointerId: number
  lastX: number
  lastY: number
}

const EMPTY_SIZE: CanvasSize = { width: 0, height: 0 }
const EMPTY_CELLS: Record<string, string> = {}
const SOURCE_CANVAS_HEIGHT = 360
const PATTERN_CANVAS_HEIGHT = 360
const PATTERN_STEP = 20
const PATTERN_PADDING = 22
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25
const ZERO_PAN = { x: 0, y: 0 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function cellKey(row: number, column: number) {
  return `${row}:${column}`
}

function describeCell(row: number, column: number, rows: number, columns: number) {
  if (row < 0 || row >= rows || column < 0 || column >= columns) {
    return `posición exterior ${row}, ${column}`
  }
  return `fila ${row + 1}, columna ${column + 1}`
}

function isBeadCell(row: number, column: number) {
  return (row + column) % 2 === 0
}

function isEditableCell(
  row: number,
  column: number,
  rows: number,
  columns: number,
) {
  return (
    row >= -1 &&
    row <= rows &&
    column >= -1 &&
    column <= columns &&
    isBeadCell(row, column)
  )
}

function parseHex(color: string): RGB | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color)
  if (!match) return null
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  }
}

function rgbToHex(rgb: RGB) {
  const channel = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

function colorFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    if (/^#[\da-f]{6}$/i.test(value)) return value.toUpperCase()
    return null
  }
  if (value && typeof value === 'object') {
    const candidate = value as Partial<RGB> & { color?: unknown; rgb?: unknown }
    if (typeof candidate.color === 'string') return colorFromUnknown(candidate.color)
    if (candidate.rgb) return colorFromUnknown(candidate.rgb)
    if (
      typeof candidate.r === 'number' &&
      typeof candidate.g === 'number' &&
      typeof candidate.b === 'number'
    ) {
      return rgbToHex(candidate as RGB).toUpperCase()
    }
  }
  return null
}

function normalizePalette(value: unknown, cells: Record<string, string>): PaletteEntry[] {
  const cellCounts = new Map<string, number>()
  for (const color of Object.values(cells)) {
    const normalized = colorFromUnknown(color)
    if (normalized) cellCounts.set(normalized, (cellCounts.get(normalized) ?? 0) + 1)
  }

  if (!Array.isArray(value)) {
    return [...cellCounts].map(([color, count]) => ({ color, count }))
  }

  const entries = value.flatMap((entry) => {
    const color = colorFromUnknown(entry)
    if (!color) return []
    const rawCount =
      entry && typeof entry === 'object' ? (entry as { count?: unknown }).count : undefined
    const count =
      typeof rawCount === 'number' && Number.isFinite(rawCount)
        ? rawCount
        : (cellCounts.get(color) ?? 0)
    return [{ color, count }]
  })

  return entries.length ? entries : [...cellCounts].map(([color, count]) => ({ color, count }))
}

function normalizeBackground(result: CompatibleResult | null) {
  if (!result) return '#FFFFFF'
  return colorFromUnknown(result.background ?? result.backgroundColor) ?? '#FFFFFF'
}

function getRotation(result: CompatibleResult | null) {
  if (!result) return 0
  return (
    result.transform?.rotationDegrees ??
    result.grid?.rotationDegrees ??
    result.rotationDegrees ??
    0
  )
}

function getBeadPosition(bead: CompatibleBead) {
  return {
    x: bead.sourceX ?? bead.centerX ?? bead.x ?? 0,
    y: bead.sourceY ?? bead.centerY ?? bead.y ?? 0,
  }
}

function getBeadRadii(bead: CompatibleBead) {
  return {
    radiusX: Math.max(2, bead.radiusX ?? 8),
    radiusY: Math.max(2, bead.radiusY ?? 8),
  }
}

function getContainedRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): SourceDrawRect {
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}

function useCanvasSize(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
) {
  const [size, setSize] = useState<CanvasSize>(EMPTY_SIZE)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return
    const update = () => {
      const rect = canvas.getBoundingClientRect()
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasRef, enabled])

  return size
}

function prepareCanvas(canvas: HTMLCanvasElement, size: CanvasSize) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(size.width * dpr))
  const height = Math.max(1, Math.round(size.height * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d')
  if (!context) return null
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, size.width, size.height)
  return context
}

function drawCheckerboard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  square = 12,
) {
  context.fillStyle = '#252930'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#2d323a'
  for (let row = 0; row * square < height; row += 1) {
    for (let column = row % 2; column * square < width; column += 2) {
      context.fillRect(column * square, row * square, square, square)
    }
  }
}

function drawBead(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  color: string | null,
  external: boolean,
  focused: boolean,
  hovered: boolean,
  displayScale: number,
) {
  const pixel = 1 / Math.max(displayScale, 0.01)
  context.save()
  context.beginPath()
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2)
  if (color) {
    context.fillStyle = color
    context.fill()
    context.strokeStyle = 'rgba(8, 10, 13, .62)'
    context.lineWidth = 1.4 * pixel
    context.stroke()

    context.beginPath()
    context.ellipse(
      centerX - radiusX * 0.25,
      centerY - radiusY * 0.24,
      radiusX * 0.2,
      radiusY * 0.17,
      0,
      0,
      Math.PI * 2,
    )
    context.fillStyle = 'rgba(255, 255, 255, .3)'
    context.fill()
  } else {
    context.fillStyle = external ? 'rgba(255, 255, 255, .045)' : 'rgba(20, 22, 25, .22)'
    context.fill()
  }

  if (hovered) {
    context.beginPath()
    context.ellipse(
      centerX,
      centerY,
      radiusX + 2.5 * pixel,
      radiusY + 2.5 * pixel,
      0,
      0,
      Math.PI * 2,
    )
    context.setLineDash([])
    context.fillStyle = 'rgba(255, 255, 255, .2)'
    context.fill()
    context.strokeStyle = '#FFFFFF'
    context.lineWidth = 2.2 * pixel
    context.stroke()
  }

  if (focused) {
    context.beginPath()
    context.ellipse(
      centerX,
      centerY,
      radiusX + 4 * pixel,
      radiusY + 4 * pixel,
      0,
      0,
      Math.PI * 2,
    )
    context.setLineDash([])
    context.strokeStyle = '#F0C66E'
    context.lineWidth = 2 * pixel
    context.stroke()
  }
  context.restore()
}

export function ImageImportDialog({
  open,
  source,
  fileName,
  result,
  analyzing,
  error,
  backgroundMode,
  backgroundTolerance,
  colorMergeDelta,
  onBackgroundModeChange,
  onBackgroundToleranceChange,
  onColorMergeDeltaChange,
  onPickBackground,
  onToggleCell,
  onCancel,
  onConfirm,
}: ImageImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null)
  const patternCanvasRef = useRef<HTMLCanvasElement>(null)
  const sourceDrawRectRef = useRef<SourceDrawRect | null>(null)
  const patternTransformRef = useRef<PatternDrawTransform | null>(null)
  const hasPreviewCanvases = open && !!result && !error
  const sourceSize = useCanvasSize(sourceCanvasRef, hasPreviewCanvases)
  const patternSize = useCanvasSize(patternCanvasRef, hasPreviewCanvases)
  const [imageAsset, setImageAsset] = useState<{
    source: string
    image: HTMLImageElement
  } | null>(null)
  const [pickedPointState, setPickedPoint] = useState<{
    source: string
    u: number
    v: number
  } | null>(null)
  const [keyboardCellState, setKeyboardCell] = useState<{
    rows: number
    columns: number
    row: number
    column: number
  }>({ rows: 0, columns: 0, row: 0, column: 0 })
  const [cellAnnouncement, setCellAnnouncement] = useState('')
  const [hoveredCell, setHoveredCell] = useState<PatternCell | null>(null)
  const patternDragRef = useRef<PatternDragState | null>(null)
  const patternPanDragRef = useRef<PatternPanDragState | null>(null)
  const [patternPanning, setPatternPanning] = useState(false)
  const [sourceViewState, setSourceViewState] = useState<ViewState>({
    source,
    zoom: 1,
    pan: ZERO_PAN,
  })
  const [patternViewState, setPatternViewState] = useState<ViewState>({
    source,
    zoom: 1,
    pan: ZERO_PAN,
  })

  const analysis = result as unknown as CompatibleResult | null
  const sourceZoom = sourceViewState.source === source ? sourceViewState.zoom : 1
  const sourcePan = sourceViewState.source === source ? sourceViewState.pan : ZERO_PAN
  const patternZoom = patternViewState.source === source ? patternViewState.zoom : 1
  const patternPan = patternViewState.source === source ? patternViewState.pan : ZERO_PAN
  const image = imageAsset?.source === source ? imageAsset.image : null
  const pickedPoint = pickedPointState?.source === source ? pickedPointState : null
  const cells = useMemo(() => analysis?.cells ?? EMPTY_CELLS, [analysis])
  const keyboardCell = useMemo<[number, number]>(
    () =>
      analysis &&
      keyboardCellState.rows === analysis.rows &&
      keyboardCellState.columns === analysis.columns
        ? [keyboardCellState.row, keyboardCellState.column]
        : [0, 0],
    [analysis, keyboardCellState],
  )
  const palette = useMemo(() => normalizePalette(analysis?.palette, cells), [analysis?.palette, cells])
  const backgroundColor = normalizeBackground(analysis)
  const beadCount = Object.keys(cells).length || analysis?.beads.length || 0
  const rawConfidence = analysis?.confidence ?? 0
  const confidence = clamp(rawConfidence > 1 ? rawConfidence / 100 : rawConfidence, 0, 1)
  const rotation = getRotation(analysis)
  const sourceZoomPercent = Math.round(sourceZoom * 100)
  const patternZoomPercent = Math.round(patternZoom * 100)

  const updateSourceZoom = useCallback(
    (updater: (current: number) => number) => {
      setSourceViewState((current) => ({
        source,
        zoom: updater(current.source === source ? current.zoom : 1),
        pan: current.source === source ? current.pan : ZERO_PAN,
      }))
    },
    [source],
  )

  const updateSourcePan = useCallback(
    (updater: (current: { x: number; y: number }) => { x: number; y: number }) => {
      setSourceViewState((current) => ({
        source,
        zoom: current.source === source ? current.zoom : 1,
        pan: updater(current.source === source ? current.pan : ZERO_PAN),
      }))
    },
    [source],
  )

  const updatePatternZoom = useCallback(
    (updater: (current: number) => number) => {
      setPatternViewState((current) => ({
        source,
        zoom: updater(current.source === source ? current.zoom : 1),
        pan: current.source === source ? current.pan : ZERO_PAN,
      }))
    },
    [source],
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!source) return
    const nextImage = new Image()
    let cancelled = false
    nextImage.decoding = 'async'
    nextImage.onload = () => {
      if (!cancelled) setImageAsset({ source, image: nextImage })
    }
    nextImage.onerror = () => {
      if (!cancelled) setImageAsset(null)
    }
    nextImage.src = source
    return () => {
      cancelled = true
    }
  }, [source])

  useEffect(() => {
    const canvas = sourceCanvasRef.current
    if (!canvas || !sourceSize.width || !sourceSize.height) return
    const context = prepareCanvas(canvas, sourceSize)
    if (!context) return
    drawCheckerboard(context, sourceSize.width, sourceSize.height)
    sourceDrawRectRef.current = null
    if (!image) return

    const containedRect = getContainedRect(
      sourceSize.width,
      sourceSize.height,
      image.naturalWidth,
      image.naturalHeight,
    )
    const width = containedRect.width * sourceZoom
    const height = containedRect.height * sourceZoom
    const maxPanX = Math.max(0, (width - sourceSize.width) / 2)
    const maxPanY = Math.max(0, (height - sourceSize.height) / 2)
    const drawRect = {
      x: (sourceSize.width - width) / 2 + clamp(sourcePan.x, -maxPanX, maxPanX),
      y: (sourceSize.height - height) / 2 + clamp(sourcePan.y, -maxPanY, maxPanY),
      width,
      height,
    }
    sourceDrawRectRef.current = drawRect
    context.drawImage(image, drawRect.x, drawRect.y, drawRect.width, drawRect.height)

    const analysisWidth =
      analysis?.imageWidth ??
      analysis?.transform?.sourceWidth ??
      analysis?.grid?.sourceWidth ??
      image.naturalWidth
    const analysisHeight =
      analysis?.imageHeight ??
      analysis?.transform?.sourceHeight ??
      analysis?.grid?.sourceHeight ??
      image.naturalHeight
    const scaleX = drawRect.width / Math.max(1, analysisWidth)
    const scaleY = drawRect.height / Math.max(1, analysisHeight)

    for (const rawBead of analysis?.beads ?? []) {
      const bead = rawBead as CompatibleBead
      const position = getBeadPosition(bead)
      const radii = getBeadRadii(bead)
      const centerX = drawRect.x + position.x * scaleX
      const centerY = drawRect.y + position.y * scaleY
      context.save()
      context.beginPath()
      context.ellipse(
        centerX,
        centerY,
        radii.radiusX * scaleX,
        radii.radiusY * scaleY,
        0,
        0,
        Math.PI * 2,
      )
      context.fillStyle = 'rgba(79, 141, 247, .12)'
      context.fill()
      context.strokeStyle = (bead.score ?? bead.confidence) < 0.55 ? '#F4B866' : '#79AAFF'
      context.lineWidth = 1.6
      context.stroke()
      context.restore()
    }

    if (pickedPoint) {
      const x = drawRect.x + pickedPoint.u * drawRect.width
      const y = drawRect.y + pickedPoint.v * drawRect.height
      context.save()
      context.strokeStyle = '#FFFFFF'
      context.lineWidth = 3
      context.beginPath()
      context.arc(x, y, 7, 0, Math.PI * 2)
      context.moveTo(x - 11, y)
      context.lineTo(x + 11, y)
      context.moveTo(x, y - 11)
      context.lineTo(x, y + 11)
      context.stroke()
      context.strokeStyle = '#3977DF'
      context.lineWidth = 1.4
      context.stroke()
      context.restore()
    }
  }, [analysis, image, pickedPoint, sourcePan, sourceSize, sourceZoom])

  useEffect(() => {
    const canvas = patternCanvasRef.current
    if (!canvas || !analysis || !patternSize.width || !patternSize.height) return
    const context = prepareCanvas(canvas, patternSize)
    if (!context) return
    context.fillStyle = '#4A4D52'
    context.fillRect(0, 0, patternSize.width, patternSize.height)

    const worldWidth = (analysis.columns + 1) * PATTERN_STEP + PATTERN_PADDING * 2
    const worldHeight = (analysis.rows + 1) * PATTERN_STEP + PATTERN_PADDING * 2
    const fittedScale = Math.min(
      (patternSize.width - 20) / Math.max(1, worldWidth),
      (patternSize.height - 20) / Math.max(1, worldHeight),
      2.2,
    )
    const scale = fittedScale * patternZoom
    const scaledWorldWidth = worldWidth * scale
    const scaledWorldHeight = worldHeight * scale
    const maxPanX = Math.max(0, (scaledWorldWidth - patternSize.width) / 2)
    const maxPanY = Math.max(0, (scaledWorldHeight - patternSize.height) / 2)
    const offsetX =
      (patternSize.width - scaledWorldWidth) / 2 + clamp(patternPan.x, -maxPanX, maxPanX)
    const offsetY =
      (patternSize.height - scaledWorldHeight) / 2 + clamp(patternPan.y, -maxPanY, maxPanY)
    const transform = {
      offsetX,
      offsetY,
      scale,
      padding: PATTERN_PADDING,
      step: PATTERN_STEP,
    }
    patternTransformRef.current = transform

    context.save()
    context.translate(offsetX, offsetY)
    context.scale(scale, scale)

    for (let row = -1; row <= analysis.rows; row += 1) {
      for (let column = -1; column <= analysis.columns; column += 1) {
        if (!isBeadCell(row, column)) continue
        const external =
          row < 0 || row >= analysis.rows || column < 0 || column >= analysis.columns
        const vertical = row === 0 || row === analysis.rows - 1 || Math.abs(row % 2) === 1
        const centerX = PATTERN_PADDING + (column + 1) * PATTERN_STEP
        const centerY = PATTERN_PADDING + (row + 1) * PATTERN_STEP
        const radiusX = vertical ? 9 : 14
        const radiusY = vertical ? 14 : 9
        const color = cells[cellKey(row, column)] ?? null
        const focused = keyboardCell[0] === row && keyboardCell[1] === column
        const hovered = hoveredCell?.row === row && hoveredCell.column === column
        drawBead(
          context,
          centerX,
          centerY,
          radiusX,
          radiusY,
          color,
          external,
          focused,
          hovered,
          scale,
        )
      }
    }
    context.restore()
  }, [analysis, cells, hoveredCell, keyboardCell, patternPan, patternSize, patternZoom])

  const changeSourceZoom = useCallback((delta: number) => {
    updateSourceZoom((current) => clamp(current + delta, MIN_ZOOM, MAX_ZOOM))
  }, [updateSourceZoom])

  const changePatternZoom = useCallback((delta: number) => {
    updatePatternZoom((current) => clamp(current + delta, MIN_ZOOM, MAX_ZOOM))
  }, [updatePatternZoom])

  const handleSourceWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      const direction = event.deltaY < 0 ? 1 : -1
      updateSourceZoom((current) =>
        clamp(
          Math.round((current + direction * ZOOM_STEP) * 100) / 100,
          MIN_ZOOM,
          MAX_ZOOM,
        ),
      )
      return
    }

    if (sourceZoom <= 1) return
    event.preventDefault()
    const viewportWidth = Math.max(sourceSize.width, 1)
    const viewportHeight = Math.max(sourceSize.height, 1)
    const limitX = viewportWidth * (sourceZoom - 1)
    const limitY = viewportHeight * (sourceZoom - 1)
    const horizontalDelta = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX
    const verticalDelta = event.shiftKey ? 0 : event.deltaY
    updateSourcePan((current) => ({
      x: clamp(current.x - horizontalDelta, -limitX, limitX),
      y: clamp(current.y - verticalDelta, -limitY, limitY),
    }))
  }, [sourceSize.height, sourceSize.width, sourceZoom, updateSourcePan, updateSourceZoom])

  const handlePatternWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!analysis || !patternSize.width || !patternSize.height) return
    event.preventDefault()
    const canvas = patternCanvasRef.current
    const currentTransform = patternTransformRef.current
    if (!canvas || !currentTransform) return
    const rect = canvas.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const worldX = (localX - currentTransform.offsetX) / currentTransform.scale
    const worldY = (localY - currentTransform.offsetY) / currentTransform.scale
    const nextZoom = clamp(
      patternZoom * Math.exp(-event.deltaY * 0.0015),
      MIN_ZOOM,
      MAX_ZOOM,
    )
    const worldWidth = (analysis.columns + 1) * PATTERN_STEP + PATTERN_PADDING * 2
    const worldHeight = (analysis.rows + 1) * PATTERN_STEP + PATTERN_PADDING * 2
    const fittedScale = Math.min(
      (patternSize.width - 20) / Math.max(1, worldWidth),
      (patternSize.height - 20) / Math.max(1, worldHeight),
      2.2,
    )
    const nextScale = fittedScale * nextZoom
    const scaledWorldWidth = worldWidth * nextScale
    const scaledWorldHeight = worldHeight * nextScale
    const baseOffsetX = (patternSize.width - scaledWorldWidth) / 2
    const baseOffsetY = (patternSize.height - scaledWorldHeight) / 2
    const maxPanX = Math.max(0, (scaledWorldWidth - patternSize.width) / 2)
    const maxPanY = Math.max(0, (scaledWorldHeight - patternSize.height) / 2)
    setPatternViewState({
      source,
      zoom: nextZoom,
      pan: {
        x: clamp(localX - worldX * nextScale - baseOffsetX, -maxPanX, maxPanX),
        y: clamp(localY - worldY * nextScale - baseOffsetY, -maxPanY, maxPanY),
      },
    })
  }, [analysis, patternSize.height, patternSize.width, patternZoom, source])

  const pickBackgroundAtCanvasPoint = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      if (backgroundMode !== 'manual' || !image) return
      const canvas = sourceCanvasRef.current
      const drawRect = sourceDrawRectRef.current
      if (!canvas || !drawRect) return
      const canvasRect = canvas.getBoundingClientRect()
      const x = event.clientX - canvasRect.left
      const y = event.clientY - canvasRect.top
      if (
        x < drawRect.x ||
        x > drawRect.x + drawRect.width ||
        y < drawRect.y ||
        y > drawRect.y + drawRect.height
      ) {
        return
      }
      const u = (x - drawRect.x) / drawRect.width
      const v = (y - drawRect.y) / drawRect.height
      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = 1
      sampleCanvas.height = 1
      const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
      if (!sampleContext) return
      try {
        sampleContext.drawImage(
          image,
          clamp(Math.floor(u * image.naturalWidth), 0, image.naturalWidth - 1),
          clamp(Math.floor(v * image.naturalHeight), 0, image.naturalHeight - 1),
          1,
          1,
          0,
          0,
          1,
          1,
        )
        const [r, g, b] = sampleContext.getImageData(0, 0, 1, 1).data
        setPickedPoint({ source, u, v })
        onPickBackground({ r, g, b })
      } catch {
        // A local upload is readable. If a remote source is ever supplied, the
        // native color input remains available when canvas pixel access is denied.
      }
    },
    [backgroundMode, image, onPickBackground, source],
  )

  const getPatternCellAtPoint = useCallback(
    (clientX: number, clientY: number): PatternCell | null => {
      if (!analysis) return null
      const canvas = patternCanvasRef.current
      const transform = patternTransformRef.current
      if (!canvas || !transform) return null
      const rect = canvas.getBoundingClientRect()
      const worldX = (clientX - rect.left - transform.offsetX) / transform.scale
      const worldY = (clientY - rect.top - transform.offsetY) / transform.scale
      const column = Math.round((worldX - transform.padding) / transform.step) - 1
      const row = Math.round((worldY - transform.padding) / transform.step) - 1
      if (
        row < -1 ||
        row > analysis.rows ||
        column < -1 ||
        column > analysis.columns ||
        !isBeadCell(row, column)
      ) {
        return null
      }
      const vertical = row === 0 || row === analysis.rows - 1 || Math.abs(row % 2) === 1
      const centerX = transform.padding + (column + 1) * transform.step
      const centerY = transform.padding + (row + 1) * transform.step
      const radiusX = vertical ? 9 : 14
      const radiusY = vertical ? 14 : 9
      const hitPadding = 5 / Math.max(transform.scale, 0.25)
      const dx = (worldX - centerX) / (radiusX + hitPadding)
      const dy = (worldY - centerY) / (radiusY + hitPadding)
      if (dx * dx + dy * dy > 1) return null
      return { row, column }
    },
    [analysis],
  )

  const applyPatternAtPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      paint: boolean | null,
      visited?: Set<string>,
    ) => {
      if (!analysis || analyzing) return null
      const target = getPatternCellAtPoint(clientX, clientY)
      setHoveredCell((current) =>
        current?.row === target?.row && current?.column === target?.column ? current : target,
      )
      if (!target || paint === null) return target
      const { row, column } = target
      const key = cellKey(row, column)
      if (visited?.has(key)) return target
      visited?.add(key)
      setKeyboardCell({
        rows: analysis.rows,
        columns: analysis.columns,
        row,
        column,
      })
      const currentlyPainted = Boolean(cells[key])
      if (currentlyPainted === paint) return target
      const position = describeCell(row, column, analysis.rows, analysis.columns)
      setCellAnnouncement(
        paint ? `Cuenta añadida en ${position}.` : `Cuenta eliminada en ${position}.`,
      )
      onToggleCell(row, column)
      return target
    },
    [analysis, analyzing, cells, getPatternCellAtPoint, onToggleCell],
  )

  const handlePatternPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!analysis) return
      if (event.button === 1) {
        patternPanDragRef.current = {
          pointerId: event.pointerId,
          lastX: event.clientX,
          lastY: event.clientY,
        }
        setHoveredCell(null)
        setPatternPanning(true)
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
        return
      }
      if (event.button !== 0 || analyzing) return
      const target = getPatternCellAtPoint(event.clientX, event.clientY)
      if (!target) {
        setHoveredCell(null)
        return
      }
      const drag: PatternDragState = {
        pointerId: event.pointerId,
        paint: !cells[cellKey(target.row, target.column)],
        visited: new Set<string>(),
        lastX: event.clientX,
        lastY: event.clientY,
      }
      patternDragRef.current = drag
      event.currentTarget.setPointerCapture(event.pointerId)
      applyPatternAtPoint(event.clientX, event.clientY, drag.paint, drag.visited)
      event.preventDefault()
    },
    [analysis, analyzing, applyPatternAtPoint, cells, getPatternCellAtPoint],
  )

  const handlePatternPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const panDrag = patternPanDragRef.current
      if (panDrag?.pointerId === event.pointerId && analysis) {
        const deltaX = event.clientX - panDrag.lastX
        const deltaY = event.clientY - panDrag.lastY
        setPatternViewState((current) => {
          const zoom = current.source === source ? current.zoom : 1
          const pan = current.source === source ? current.pan : ZERO_PAN
          const worldWidth = (analysis.columns + 1) * PATTERN_STEP + PATTERN_PADDING * 2
          const worldHeight = (analysis.rows + 1) * PATTERN_STEP + PATTERN_PADDING * 2
          const fittedScale = Math.min(
            (patternSize.width - 20) / Math.max(1, worldWidth),
            (patternSize.height - 20) / Math.max(1, worldHeight),
            2.2,
          )
          const scaledWorldWidth = worldWidth * fittedScale * zoom
          const scaledWorldHeight = worldHeight * fittedScale * zoom
          const maxPanX = Math.max(0, (scaledWorldWidth - patternSize.width) / 2)
          const maxPanY = Math.max(0, (scaledWorldHeight - patternSize.height) / 2)
          return {
            source,
            zoom,
            pan: {
              x: clamp(pan.x + deltaX, -maxPanX, maxPanX),
              y: clamp(pan.y + deltaY, -maxPanY, maxPanY),
            },
          }
        })
        panDrag.lastX = event.clientX
        panDrag.lastY = event.clientY
        event.preventDefault()
        return
      }
      const drag = patternDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        applyPatternAtPoint(event.clientX, event.clientY, null)
        return
      }
      const dx = event.clientX - drag.lastX
      const dy = event.clientY - drag.lastY
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6))
      for (let step = 1; step <= steps; step += 1) {
        applyPatternAtPoint(
          drag.lastX + (dx * step) / steps,
          drag.lastY + (dy * step) / steps,
          drag.paint,
          drag.visited,
        )
      }
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      event.preventDefault()
    },
    [analysis, applyPatternAtPoint, patternSize.height, patternSize.width, source],
  )

  const finishPatternDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const panDrag = patternPanDragRef.current
    if (panDrag?.pointerId === event.pointerId) {
      patternPanDragRef.current = null
      setPatternPanning(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }
    const drag = patternDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    patternDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const handlePatternKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
      if (!analysis || analyzing) return
      const [row, column] = keyboardCell
      let next: [number, number] = [row, column]
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const validColumns = Array.from(
          { length: analysis.columns + 2 },
          (_, index) => index - 1,
        ).filter((candidate) => isBeadCell(row, candidate))
        const candidates = validColumns.filter((candidate) =>
          event.key === 'ArrowLeft' ? candidate < column : candidate > column,
        )
        if (candidates.length) {
          next = [
            row,
            event.key === 'ArrowLeft' ? Math.max(...candidates) : Math.min(...candidates),
          ]
        }
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const targetRow = row + (event.key === 'ArrowUp' ? -1 : 1)
        if (targetRow >= -1 && targetRow <= analysis.rows) {
          const preferredColumns =
            event.key === 'ArrowUp' ? [column - 1, column + 1] : [column + 1, column - 1]
          const adjacentColumns = preferredColumns.filter((candidate) =>
            isEditableCell(targetRow, candidate, analysis.rows, analysis.columns),
          )
          if (adjacentColumns.length) next = [targetRow, adjacentColumns[0]]
        }
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (isEditableCell(row, column, analysis.rows, analysis.columns)) {
          const position = describeCell(row, column, analysis.rows, analysis.columns)
          setCellAnnouncement(
            cells[cellKey(row, column)]
              ? `Cuenta eliminada en ${position}.`
              : `Cuenta añadida en ${position}.`,
          )
          onToggleCell(row, column)
        }
        return
      }
      if (next[0] !== row || next[1] !== column) {
        event.preventDefault()
        setKeyboardCell({
          rows: analysis.rows,
          columns: analysis.columns,
          row: next[0],
          column: next[1],
        })
        const color = cells[cellKey(next[0], next[1])]
        setCellAnnouncement(
          `${describeCell(next[0], next[1], analysis.rows, analysis.columns)}: ${color ? `cuenta ${color}` : 'vacía'}.`,
        )
      }
    },
    [analysis, analyzing, cells, keyboardCell, onToggleCell],
  )

  const handleDialogCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    onCancel()
  }

  const renderState = () => {
    if (error) {
      return (
        <div className="image-import-state" role="alert">
          <span className="image-import-state-icon image-import-state-icon-error" aria-hidden="true">!</span>
          <h3>No se pudo analizar la imagen</h3>
          <p>{error}</p>
          <button type="button" className="image-import-secondary-button" onClick={onCancel}>
            Cerrar
          </button>
        </div>
      )
    }

    if (analyzing && !analysis) {
      return (
        <div className="image-import-state" role="status" aria-live="polite">
          <span className="image-import-spinner" aria-hidden="true" />
          <h3>Analizando el diseño</h3>
          <p>Separando el fondo, detectando cuentas y ajustando la retícula…</p>
          <button type="button" className="image-import-secondary-button" onClick={onCancel}>
            Cancelar análisis
          </button>
        </div>
      )
    }

    if (!analysis) return null

    const statusClass = confidence >= 0.78 ? 'good' : confidence >= 0.55 ? 'medium' : 'low'
    return (
      <>
        <div className="image-import-content" aria-busy={analyzing}>
          <div className="image-import-visuals">
            <section className="image-import-card" aria-labelledby="image-import-source-title">
              <div className="image-import-card-header">
                <div>
                  <span className="image-import-kicker">Imagen original</span>
                  <h3 id="image-import-source-title">Detecciones</h3>
                </div>
                <div className="image-import-card-actions">
                  <span className="image-import-card-badge">{analysis.beads.length} encontradas</span>
                  <div className="image-import-zoom-controls" role="group" aria-label="Zoom de la imagen original">
                    <button
                      type="button"
                      className="image-import-zoom-button"
                      onClick={() => changeSourceZoom(-ZOOM_STEP)}
                      disabled={sourceZoom <= MIN_ZOOM}
                      aria-label="Alejar imagen original"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="image-import-zoom-value"
                      onClick={() => setSourceViewState({ source, zoom: 1, pan: ZERO_PAN })}
                      aria-label={`Zoom de imagen original ${sourceZoomPercent}%. Restablecer al 100%`}
                      title="Restablecer zoom al 100%"
                    >
                      {sourceZoomPercent}%
                    </button>
                    <button
                      type="button"
                      className="image-import-zoom-button"
                      onClick={() => changeSourceZoom(ZOOM_STEP)}
                      disabled={sourceZoom >= MAX_ZOOM}
                      aria-label="Acercar imagen original"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div className="image-import-canvas-wrap">
                <canvas
                  ref={sourceCanvasRef}
                  className={`image-import-source-canvas${backgroundMode === 'manual' ? ' image-import-is-picking' : ''}`}
                  style={{ height: SOURCE_CANVAS_HEIGHT }}
                  onClick={pickBackgroundAtCanvasPoint}
                  onWheel={handleSourceWheel}
                  role="img"
                  aria-label={`Imagen ${fileName} con ${analysis.beads.length} detecciones superpuestas`}
                />
                {analyzing && (
                  <span className="image-import-canvas-progress" role="status">
                    <span className="image-import-spinner image-import-spinner-small" aria-hidden="true" />
                    Actualizando
                  </span>
                )}
              </div>
              <p className="image-import-canvas-help">
                {backgroundMode === 'manual'
                  ? 'Haz clic en una zona limpia del fondo para tomar su color.'
                  : 'Los contornos azules son las cuentas aceptadas. Ctrl + rueda ajusta solo este zoom.'}
              </p>
            </section>

            <section className="image-import-card" aria-labelledby="image-import-pattern-title">
              <div className="image-import-card-header">
                <div>
                  <span className="image-import-kicker">Resultado</span>
                  <h3 id="image-import-pattern-title">Patrón editable</h3>
                </div>
                <div className="image-import-card-actions">
                  <span className="image-import-card-badge">{beadCount} cuentas</span>
                  <div className="image-import-zoom-controls" role="group" aria-label="Zoom del resultado">
                    <button
                      type="button"
                      className="image-import-zoom-button"
                      onClick={() => changePatternZoom(-ZOOM_STEP)}
                      disabled={patternZoom <= MIN_ZOOM}
                      aria-label="Alejar resultado"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="image-import-zoom-value"
                      onClick={() => setPatternViewState({ source, zoom: 1, pan: ZERO_PAN })}
                      aria-label={`Zoom del resultado ${patternZoomPercent}%. Restablecer al 100%`}
                      title="Restablecer zoom al 100%"
                    >
                      {patternZoomPercent}%
                    </button>
                    <button
                      type="button"
                      className="image-import-zoom-button"
                      onClick={() => changePatternZoom(ZOOM_STEP)}
                      disabled={patternZoom >= MAX_ZOOM}
                      aria-label="Acercar resultado"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div className="image-import-canvas-wrap">
                <canvas
                  ref={patternCanvasRef}
                  className={`image-import-pattern-canvas${patternPanning ? ' image-import-is-panning' : ''}`}
                  style={{ height: PATTERN_CANVAS_HEIGHT }}
                  onPointerDown={handlePatternPointerDown}
                  onPointerMove={handlePatternPointerMove}
                  onPointerUp={finishPatternDrag}
                  onPointerCancel={finishPatternDrag}
                  onAuxClick={(event) => event.preventDefault()}
                  onPointerLeave={() => {
                    if (!patternDragRef.current) setHoveredCell(null)
                  }}
                  onWheel={handlePatternWheel}
                  onKeyDown={handlePatternKeyDown}
                  tabIndex={0}
                  role="application"
                  aria-label={`Patrón editable de ${analysis.rows} filas por ${analysis.columns} columnas. Usa la rueda para ampliar, el botón central para mover y arrastra con el botón principal para pintar o borrar.`}
                  aria-describedby="image-import-pattern-help"
                />
                <span className="image-import-sr-only" aria-live="polite" aria-atomic="true">
                  {cellAnnouncement}
                </span>
              </div>
              <p id="image-import-pattern-help" className="image-import-canvas-help">
                Rueda: zoom. Botón central: mover. Arrastra con el botón principal para pintar; empieza sobre una cuenta para borrar.
              </p>
            </section>
          </div>

          <aside className="image-import-sidebar" aria-label="Ajustes del análisis">
            <section className="image-import-panel-section">
              <div className="image-import-section-heading">
                <h3>Resumen</h3>
                <span className={`image-import-confidence image-import-confidence-${statusClass}`}>
                  {Math.round(confidence * 100)}% confianza
                </span>
              </div>
              <dl className="image-import-metrics">
                <div><dt>Cuentas</dt><dd>{beadCount}</dd></div>
                <div><dt>Retícula</dt><dd>{analysis.rows} × {analysis.columns}</dd></div>
                <div><dt>Colores</dt><dd>{palette.length}</dd></div>
                <div><dt>Rotación</dt><dd>{rotation.toFixed(1)}°</dd></div>
              </dl>
            </section>

            <section className="image-import-panel-section">
              <div className="image-import-section-heading">
                <h3>Separar fondo</h3>
              </div>
              <div className="image-import-segmented" role="radiogroup" aria-label="Método para elegir el fondo">
                <label className={backgroundMode === 'auto' ? 'image-import-is-active' : undefined}>
                  <input
                    type="radio"
                    name="image-import-background-mode"
                    value="auto"
                    checked={backgroundMode === 'auto'}
                    onChange={() => onBackgroundModeChange('auto')}
                  />
                  Automático
                </label>
                <label className={backgroundMode === 'manual' ? 'image-import-is-active' : undefined}>
                  <input
                    type="radio"
                    name="image-import-background-mode"
                    value="manual"
                    checked={backgroundMode === 'manual'}
                    onChange={() => onBackgroundModeChange('manual')}
                  />
                  Manual
                </label>
              </div>

              {backgroundMode === 'manual' && (
                <label className="image-import-color-control">
                  <span>Color seleccionado</span>
                  <span className="image-import-color-value">
                    <span style={{ backgroundColor }} aria-hidden="true" />
                    {backgroundColor}
                  </span>
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(event) => {
                      const rgb = parseHex(event.target.value)
                      if (rgb) onPickBackground(rgb)
                    }}
                    aria-label="Elegir color del fondo"
                  />
                </label>
              )}

              <label className="image-import-range-control">
                <span><span>Tolerancia</span><output>{backgroundTolerance}</output></span>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={backgroundTolerance}
                  onChange={(event) => onBackgroundToleranceChange(Number(event.target.value))}
                />
                <small>Sube el valor si quedan restos del fondo.</small>
              </label>
            </section>

            <section className="image-import-panel-section">
              <div className="image-import-section-heading">
                <h3>Agrupar colores</h3>
              </div>
              <label className="image-import-range-control">
                <span><span>Diferencia ΔE</span><output>{colorMergeDelta}</output></span>
                <input
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  value={colorMergeDelta}
                  onChange={(event) => onColorMergeDeltaChange(Number(event.target.value))}
                />
                <small>Un valor mayor combina tonos más parecidos.</small>
              </label>
              <ul className="image-import-palette" aria-label={`${palette.length} colores detectados`}>
                {palette.map((entry, index) => (
                  <li key={`${entry.color}-${index}`} title={`${entry.color}: ${entry.count} cuentas`}>
                    <span style={{ backgroundColor: entry.color }} aria-hidden="true" />
                    <span>{entry.color}</span>
                    <small>{entry.count}</small>
                  </li>
                ))}
              </ul>
            </section>

            {!!analysis.warnings.length && (
              <section className="image-import-panel-section image-import-warnings" aria-labelledby="image-import-warnings-title">
                <div className="image-import-section-heading">
                  <h3 id="image-import-warnings-title">Revisión recomendada</h3>
                </div>
                <ul>
                  {analysis.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                </ul>
              </section>
            )}
          </aside>
        </div>

        <footer className="image-import-footer">
          <p>
            {analysis.canApply
              ? 'Al aplicar, este patrón sustituirá el contenido actual en una sola acción.'
              : 'Ajusta el fondo o el diseño hasta obtener una retícula fiable.'}
          </p>
          <div className="image-import-footer-actions">
            <button type="button" className="image-import-secondary-button" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="button"
              className="image-import-primary-button"
              onClick={onConfirm}
              disabled={analyzing || !analysis.canApply}
            >
              Aplicar al lienzo
            </button>
          </div>
        </footer>
      </>
    )
  }

  return (
    <dialog
      ref={dialogRef}
      className="image-import-dialog"
      aria-labelledby="image-import-title"
      aria-describedby="image-import-description"
      onCancel={handleDialogCancel}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="image-import-shell">
        <header className="image-import-header">
          <div className="image-import-header-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 5.5h16v13H4zM7.5 15l3-3 2.2 2.2 1.8-1.8 2.5 2.6" />
              <circle cx="15.8" cy="9" r="1.4" />
            </svg>
          </div>
          <div className="image-import-header-copy">
            <span>Convertir imagen</span>
            <h2 id="image-import-title">Previsualizar patrón de cuentas</h2>
            <p id="image-import-description" title={fileName}>{fileName}</p>
          </div>
          {analysis && (
            <span className={`image-import-header-status${analysis.canApply ? ' image-import-is-ready' : ''}`}>
              <span aria-hidden="true" />
              {analysis.canApply ? 'Listo para aplicar' : 'Necesita ajustes'}
            </span>
          )}
          <button
            type="button"
            className="image-import-close-button"
            onClick={onCancel}
            aria-label="Cerrar conversión de imagen"
          >
            ×
          </button>
        </header>
        {renderState()}
      </div>
    </dialog>
  )
}
