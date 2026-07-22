import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import {
  BEAD_MINOR_RADIUS,
  GRID_STEP,
  beadKey,
  clampScale,
  fitPatternInViewport,
  getBeadGeometry,
  getMirroredCells,
  getPatternSize,
  hitTestBead,
  hitTestGuidePoint,
  parseBeadKey,
  screenToWorld,
} from '../lib/geometry'
import { drawGuideSteps, drawPatternContent } from '../lib/exportPattern'
import { collectGuidePointsAlongSegment } from '../lib/guideDrag'
import {
  getTraceImageSize,
  type MirrorMode,
  type NumberingMode,
  type PatternDocument,
  type ToolMode,
  type TraceImage,
  type ViewTransform,
} from '../types'

export interface PatternCanvasHandle {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  preserveViewForGrid: (rows: number, columns: number) => void
}

interface PatternCanvasProps {
  document: PatternDocument
  tool: ToolMode
  color: string
  mirrorMode: MirrorMode
  traceImage: TraceImage | null
  onTraceMove: (deltaX: number, deltaY: number) => void
  onPaint: (positions: Array<[number, number]>, color: string | null) => void
  onMoveSelection: (selectedKeys: string[], rowDelta: number, columnDelta: number) => void
  onGuideStepToggle: (row: number, column: number) => void
  onGuideStepsAdd: (positions: Array<[number, number]>) => void
  numberingMode: NumberingMode
  showGuideSteps: boolean
  onStrokeStart: () => void
  onStrokeEnd: () => void
  onZoomChange: (percent: number) => void
}

interface PointerInteraction {
  kind: 'paint' | 'pan' | 'trace' | 'select-box' | 'move-selection' | 'guide'
  pointerId: number
  lastScreenX: number
  lastScreenY: number
  lastWorldX: number
  lastWorldY: number
  eraseOverride: boolean
  visited: Set<string>
  startWorldX: number
  startWorldY: number
  selectionAtStart: Set<string>
  moveRowDelta: number
  moveColumnDelta: number
  guideStartPoint?: [number, number] | null
  hasDragged?: boolean
}

const INITIAL_VIEW: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 }

function getSnappedSelectionDelta(
  deltaX: number,
  deltaY: number,
  selectedKeys: Set<string>,
  rows: number,
  columns: number,
) {
  const positions = [...selectedKeys].flatMap((key) => {
    const position = parseBeadKey(key)
    return position ? [position] : []
  })
  if (!positions.length) return { row: 0, column: 0 }

  const minRow = Math.min(...positions.map(([row]) => row))
  const maxRow = Math.max(...positions.map(([row]) => row))
  const minColumn = Math.min(...positions.map(([, column]) => column))
  const maxColumn = Math.max(...positions.map(([, column]) => column))
  const rawRow = deltaY / GRID_STEP
  const rawColumn = deltaX / GRID_STEP
  const targetRow = Math.min(rows - 1 - maxRow, Math.max(-minRow, Math.round(rawRow)))
  const targetColumn = Math.min(
    columns - 1 - maxColumn,
    Math.max(-minColumn, Math.round(rawColumn)),
  )
  let best = { row: 0, column: 0, score: Number.POSITIVE_INFINITY }

  for (let row = targetRow - 2; row <= targetRow + 2; row += 1) {
    for (let column = targetColumn - 2; column <= targetColumn + 2; column += 1) {
      if (
        row < -minRow ||
        row > rows - 1 - maxRow ||
        column < -minColumn ||
        column > columns - 1 - maxColumn ||
        (row + column) % 2 !== 0
      ) {
        continue
      }
      const score = (row - rawRow) ** 2 + (column - rawColumn) ** 2
      if (score < best.score) best = { row, column, score }
    }
  }
  return { row: best.row, column: best.column }
}

export const PatternCanvas = forwardRef<PatternCanvasHandle, PatternCanvasProps>(
  function PatternCanvas(
    {
      document,
      tool,
      color,
      mirrorMode,
      traceImage,
      onTraceMove,
      onPaint,
      onMoveSelection,
      onGuideStepToggle,
      onGuideStepsAdd,
      numberingMode,
      showGuideSteps,
      onStrokeStart,
      onStrokeEnd,
      onZoomChange,
    },
    forwardedRef,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const interactionRef = useRef<PointerInteraction | null>(null)
    const viewRef = useRef<ViewTransform>(INITIAL_VIEW)
    const [view, setView] = useState<ViewTransform>(INITIAL_VIEW)
    const [viewport, setViewport] = useState({ width: 0, height: 0 })
    const [spaceHeld, setSpaceHeld] = useState(false)
    const [isPanning, setIsPanning] = useState(false)
    const [isMovingSelection, setIsMovingSelection] = useState(false)
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
    const [selectionBox, setSelectionBox] = useState<{
      startX: number
      startY: number
      endX: number
      endY: number
    } | null>(null)
    const [selectionDelta, setSelectionDelta] = useState({ row: 0, column: 0 })
    const [traceAsset, setTraceAsset] = useState<{ src: string; image: HTMLImageElement } | null>(
      null,
    )
    const traceSource = traceImage?.src
    const previousGridRef = useRef({ rows: 0, columns: 0 })

    const updateView = useCallback(
      (next: ViewTransform) => {
        viewRef.current = next
        setView(next)
        onZoomChange(Math.round(next.scale * 100))
      },
      [onZoomChange],
    )

    const fit = useCallback(() => {
      if (!viewport.width || !viewport.height) return
      updateView(
        fitPatternInViewport(
          viewport.width,
          viewport.height,
          document.rows,
          document.columns,
        ),
      )
    }, [document.columns, document.rows, updateView, viewport.height, viewport.width])

    const zoomAtCenter = useCallback(
      (factor: number) => {
        if (!viewport.width || !viewport.height) return
        const current = viewRef.current
        const nextScale = clampScale(current.scale * factor)
        const centerX = viewport.width / 2
        const centerY = viewport.height / 2
        const worldX = (centerX - current.offsetX) / current.scale
        const worldY = (centerY - current.offsetY) / current.scale
        updateView({
          scale: nextScale,
          offsetX: centerX - worldX * nextScale,
          offsetY: centerY - worldY * nextScale,
        })
      },
      [updateView, viewport.height, viewport.width],
    )

    useImperativeHandle(
      forwardedRef,
      () => ({
        zoomIn: () => zoomAtCenter(1.2),
        zoomOut: () => zoomAtCenter(1 / 1.2),
        fit,
        preserveViewForGrid: (rows, columns) => {
          previousGridRef.current = { rows, columns }
        },
      }),
      [fit, zoomAtCenter],
    )

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const observer = new ResizeObserver(([entry]) => {
        setViewport({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      })
      observer.observe(container)
      return () => observer.disconnect()
    }, [])

    useEffect(() => {
      if (!viewport.width || !viewport.height) return
      const previous = previousGridRef.current
      if (previous.rows !== document.rows || previous.columns !== document.columns) {
        previousGridRef.current = { rows: document.rows, columns: document.columns }
        setSelectedKeys(new Set())
        fit()
      }
    }, [document.columns, document.rows, fit, viewport.height, viewport.width])

    useEffect(() => {
      if (!traceSource) return
      const image = new Image()
      let cancelled = false
      image.onload = () => {
        if (!cancelled) setTraceAsset({ src: traceSource, image })
      }
      image.src = traceSource
      return () => {
        cancelled = true
      }
    }, [traceSource])

    useEffect(() => {
      setSelectedKeys((current) => {
        const next = new Set([...current].filter((key) => document.cells[key]))
        return next.size === current.size ? current : next
      })
    }, [document.cells])

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas || !viewport.width || !viewport.height) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(viewport.width * dpr)
      canvas.height = Math.round(viewport.height * dpr)
      const context = canvas.getContext('2d')
      if (!context) return

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, viewport.width, viewport.height)
      context.save()
      context.translate(view.offsetX, view.offsetY)
      context.scale(view.scale, view.scale)

      const patternSize = getPatternSize(document.rows, document.columns)
      if (document.background.mode === 'solid') {
        context.fillStyle = document.background.color
        context.fillRect(0, 0, patternSize.width, patternSize.height)
      } else {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, patternSize.width, patternSize.height)
      }

      if (
        traceImage?.visible &&
        traceAsset &&
        traceAsset.src === traceImage.src
      ) {
        const traceSize = getTraceImageSize(traceImage)
        context.save()
        context.beginPath()
        context.rect(0, 0, patternSize.width, patternSize.height)
        context.clip()
        context.globalAlpha = traceImage.opacity
        context.drawImage(
          traceAsset.image,
          traceImage.x,
          traceImage.y,
          traceSize.width,
          traceSize.height,
        )
        context.restore()
      }
      context.strokeStyle = 'rgba(79, 74, 68, 0.13)'
      context.lineWidth = 1 / view.scale
      context.strokeRect(0, 0, patternSize.width, patternSize.height)
      drawPatternContent(context, document, {
        fillEmptyBeads: !traceImage?.visible,
        showPaintedBeads: false,
      })

      if (mirrorMode !== 'none') {
        context.save()
        context.lineCap = 'round'
        context.setLineDash([9 / view.scale, 6 / view.scale])

        const drawSymmetryAxes = () => {
          if (mirrorMode === 'vertical' || mirrorMode === 'both') {
            const centerX = patternSize.width / 2
            context.beginPath()
            context.moveTo(centerX, -100000)
            context.lineTo(centerX, 100000)
            context.stroke()
          }

          if (mirrorMode === 'horizontal' || mirrorMode === 'both') {
            const centerY = patternSize.height / 2
            context.beginPath()
            context.moveTo(-100000, centerY)
            context.lineTo(100000, centerY)
            context.stroke()
          }
        }

        context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        context.lineWidth = 5 / view.scale
        drawSymmetryAxes()

        context.strokeStyle = '#c65334'
        context.lineWidth = 2.5 / view.scale
        drawSymmetryAxes()

        if (mirrorMode === 'both') {
          const centerX = patternSize.width / 2
          const centerY = patternSize.height / 2
          context.setLineDash([])
          context.beginPath()
          context.arc(centerX, centerY, 5 / view.scale, 0, Math.PI * 2)
          context.fillStyle = '#c65334'
          context.fill()
          context.lineWidth = 2 / view.scale
          context.strokeStyle = '#ffffff'
          context.stroke()
        }
        context.restore()
      }

      drawPatternContent(context, document, { showEmptyBeads: false })
      if (showGuideSteps) drawGuideSteps(context, document)

      if (tool === 'trace' && traceImage?.visible) {
        const traceSize = getTraceImageSize(traceImage)
        context.save()
        context.strokeStyle = '#bd6042'
        context.lineWidth = 1.5 / view.scale
        context.setLineDash([7 / view.scale, 5 / view.scale])
        context.strokeRect(traceImage.x, traceImage.y, traceSize.width, traceSize.height)
        context.restore()
      }

      if (tool === 'select') {
        context.save()
        const hasMovePreview = selectionDelta.row !== 0 || selectionDelta.column !== 0
        for (const key of selectedKeys) {
          const position = parseBeadKey(key)
          if (!position || !document.cells[key]) continue
          const row = position[0] + selectionDelta.row
          const column = position[1] + selectionDelta.column
          const bead = getBeadGeometry(row, column, document.rows)

          context.beginPath()
          context.ellipse(
            bead.centerX,
            bead.centerY,
            bead.radiusX + 2 / view.scale,
            bead.radiusY + 2 / view.scale,
            0,
            0,
            Math.PI * 2,
          )
          if (hasMovePreview) {
            context.globalAlpha = 0.88
            context.fillStyle = document.cells[key]
            context.fill()
            context.globalAlpha = 1
          } else {
            context.fillStyle = 'rgba(20, 125, 146, 0.16)'
            context.fill()
          }
          context.strokeStyle = '#147d92'
          context.lineWidth = 2 / view.scale
          context.setLineDash([4 / view.scale, 3 / view.scale])
          context.stroke()
        }

        if (selectionBox) {
          const left = Math.min(selectionBox.startX, selectionBox.endX)
          const top = Math.min(selectionBox.startY, selectionBox.endY)
          const width = Math.abs(selectionBox.endX - selectionBox.startX)
          const height = Math.abs(selectionBox.endY - selectionBox.startY)
          context.fillStyle = 'rgba(20, 125, 146, 0.10)'
          context.fillRect(left, top, width, height)
          context.strokeStyle = '#147d92'
          context.lineWidth = 1.5 / view.scale
          context.setLineDash([6 / view.scale, 4 / view.scale])
          context.strokeRect(left, top, width, height)
        }
        context.restore()
      }
      context.restore()
    }, [
      document,
      mirrorMode,
      selectedKeys,
      selectionBox,
      selectionDelta,
      showGuideSteps,
      tool,
      traceAsset,
      traceImage,
      view,
      viewport.height,
      viewport.width,
    ])

    useEffect(() => {
      const isEditableTarget = (target: EventTarget | null) =>
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement

      const handleKeyDown = (event: KeyboardEvent) => {
        if (window.document.querySelector('dialog[open]')) return
        if (isEditableTarget(event.target)) return
        if (tool === 'select' && event.key === 'Escape') {
          setSelectedKeys(new Set())
          setSelectionBox(null)
          return
        }
        if (tool === 'select' && (event.ctrlKey || event.metaKey) && event.key === 'a') {
          event.preventDefault()
          setSelectedKeys(new Set(Object.keys(document.cells)))
          return
        }
        if (
          tool === 'select' &&
          (event.key === 'Delete' || event.key === 'Backspace') &&
          selectedKeys.size
        ) {
          event.preventDefault()
          const positions = [...selectedKeys].flatMap((key) => {
            const position = parseBeadKey(key)
            return position ? [position] : []
          })
          onStrokeStart()
          onPaint(positions, null)
          onStrokeEnd()
          setSelectedKeys(new Set())
          return
        }
        if (event.code === 'Space') {
          event.preventDefault()
          setSpaceHeld(true)
        }
      }
      const handleKeyUp = (event: KeyboardEvent) => {
        if (event.code === 'Space') setSpaceHeld(false)
      }
      const handleBlur = () => setSpaceHeld(false)
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      window.addEventListener('blur', handleBlur)
      return () => {
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('keyup', handleKeyUp)
        window.removeEventListener('blur', handleBlur)
      }
    }, [document.cells, onPaint, onStrokeEnd, onStrokeStart, selectedKeys, tool])

    const paintAtWorldPoint = useCallback(
      (worldX: number, worldY: number, visited: Set<string>, eraseOverride: boolean) => {
        const bead = hitTestBead(worldX, worldY, document.rows, document.columns)
        if (!bead) return
        const visitKey = `${bead.row}:${bead.column}`
        if (visited.has(visitKey)) return
        visited.add(visitKey)
        const positions = getMirroredCells(
          bead.row,
          bead.column,
          document.rows,
          document.columns,
          mirrorMode,
        )
        onPaint(positions, eraseOverride || tool === 'erase' ? null : color)
      },
      [color, document.columns, document.rows, mirrorMode, onPaint, tool],
    )

    const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
      const canvas = canvasRef.current
      if (!canvas) return
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
      const rect = canvas.getBoundingClientRect()
      const world = screenToWorld(event.clientX, event.clientY, rect, viewRef.current)
      const shouldPan =
        event.button === 1 || (event.button === 0 && (spaceHeld || tool === 'pan'))
      const eraseOverride = event.button === 2
      const traceSize = traceImage ? getTraceImageSize(traceImage) : null
      const shouldMoveTrace =
        !shouldPan &&
        event.button === 0 &&
        tool === 'trace' &&
        traceImage?.visible &&
        traceSize &&
        world.x >= traceImage.x &&
        world.x <= traceImage.x + traceSize.width &&
        world.y >= traceImage.y &&
        world.y <= traceImage.y + traceSize.height

      if (!shouldPan && tool === 'number') {
        if (numberingMode === 'manual' && event.button === 0) {
          const guidePoint = hitTestGuidePoint(
            world.x,
            world.y,
            document.rows,
            document.columns,
          )
          onStrokeStart()
          interactionRef.current = {
            kind: 'guide',
            pointerId: event.pointerId,
            lastScreenX: event.clientX,
            lastScreenY: event.clientY,
            lastWorldX: world.x,
            lastWorldY: world.y,
            eraseOverride: false,
            visited: new Set(),
            startWorldX: world.x,
            startWorldY: world.y,
            selectionAtStart: new Set(),
            moveRowDelta: 0,
            moveColumnDelta: 0,
            guideStartPoint: guidePoint,
            hasDragged: false,
          }
          return
        }
        canvas.releasePointerCapture(event.pointerId)
        return
      }

      if (!shouldPan && tool === 'select') {
        if (event.button !== 0) {
          canvas.releasePointerCapture(event.pointerId)
          return
        }

        const bead = hitTestBead(world.x, world.y, document.rows, document.columns)
        const hitKey = bead ? beadKey(bead.row, bead.column) : null
        if (hitKey && document.cells[hitKey]) {
          const nextSelection = selectedKeys.has(hitKey)
            ? new Set(selectedKeys)
            : event.shiftKey
              ? new Set([...selectedKeys, hitKey])
              : new Set([hitKey])
          setSelectedKeys(nextSelection)
          setSelectionDelta({ row: 0, column: 0 })
          setIsMovingSelection(true)
          onStrokeStart()
          interactionRef.current = {
            kind: 'move-selection',
            pointerId: event.pointerId,
            lastScreenX: event.clientX,
            lastScreenY: event.clientY,
            lastWorldX: world.x,
            lastWorldY: world.y,
            eraseOverride: false,
            visited: new Set(),
            startWorldX: world.x,
            startWorldY: world.y,
            selectionAtStart: nextSelection,
            moveRowDelta: 0,
            moveColumnDelta: 0,
          }
        } else {
          const selectionAtStart = event.shiftKey ? new Set(selectedKeys) : new Set<string>()
          if (!event.shiftKey) setSelectedKeys(new Set())
          setSelectionBox({
            startX: world.x,
            startY: world.y,
            endX: world.x,
            endY: world.y,
          })
          interactionRef.current = {
            kind: 'select-box',
            pointerId: event.pointerId,
            lastScreenX: event.clientX,
            lastScreenY: event.clientY,
            lastWorldX: world.x,
            lastWorldY: world.y,
            eraseOverride: false,
            visited: new Set(),
            startWorldX: world.x,
            startWorldY: world.y,
            selectionAtStart,
            moveRowDelta: 0,
            moveColumnDelta: 0,
          }
        }
        return
      }

      if (!shouldPan && tool === 'trace' && event.button === 0 && !shouldMoveTrace) {
        canvas.releasePointerCapture(event.pointerId)
        return
      }

      interactionRef.current = {
        kind: shouldPan ? 'pan' : shouldMoveTrace ? 'trace' : 'paint',
        pointerId: event.pointerId,
        lastScreenX: event.clientX,
        lastScreenY: event.clientY,
        lastWorldX: world.x,
        lastWorldY: world.y,
        eraseOverride,
        visited: new Set(),
        startWorldX: world.x,
        startWorldY: world.y,
        selectionAtStart: new Set(),
        moveRowDelta: 0,
        moveColumnDelta: 0,
      }
      if (shouldPan) {
        setIsPanning(true)
      } else if (shouldMoveTrace) {
        setIsPanning(true)
      } else {
        onStrokeStart()
        paintAtWorldPoint(world.x, world.y, interactionRef.current.visited, eraseOverride)
      }
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const interaction = interactionRef.current
      const canvas = canvasRef.current
      if (!interaction || !canvas || interaction.pointerId !== event.pointerId) return
      event.preventDefault()

      if (interaction.kind === 'pan') {
        const current = viewRef.current
        updateView({
          ...current,
          offsetX: current.offsetX + event.clientX - interaction.lastScreenX,
          offsetY: current.offsetY + event.clientY - interaction.lastScreenY,
        })
        interaction.lastScreenX = event.clientX
        interaction.lastScreenY = event.clientY
        return
      }

      const rect = canvas.getBoundingClientRect()
      const world = screenToWorld(event.clientX, event.clientY, rect, viewRef.current)

      if (interaction.kind === 'guide') {
        if (
          !interaction.hasDragged &&
          Math.hypot(
            event.clientX - interaction.lastScreenX,
            event.clientY - interaction.lastScreenY,
          ) < 3
        ) {
          return
        }
        interaction.hasDragged = true
        const positions = collectGuidePointsAlongSegment(
          { x: interaction.lastWorldX, y: interaction.lastWorldY },
          world,
          document.rows,
          document.columns,
          interaction.visited,
        )
        if (positions.length) onGuideStepsAdd(positions)
        interaction.lastScreenX = event.clientX
        interaction.lastScreenY = event.clientY
        interaction.lastWorldX = world.x
        interaction.lastWorldY = world.y
        return
      }

      if (interaction.kind === 'select-box') {
        const left = Math.min(interaction.startWorldX, world.x)
        const right = Math.max(interaction.startWorldX, world.x)
        const top = Math.min(interaction.startWorldY, world.y)
        const bottom = Math.max(interaction.startWorldY, world.y)
        const nextSelection = new Set(interaction.selectionAtStart)
        for (const key of Object.keys(document.cells)) {
          const position = parseBeadKey(key)
          if (!position) continue
          const bead = getBeadGeometry(position[0], position[1], document.rows)
          if (
            bead.centerX >= left &&
            bead.centerX <= right &&
            bead.centerY >= top &&
            bead.centerY <= bottom
          ) {
            nextSelection.add(key)
          }
        }
        setSelectionBox({
          startX: interaction.startWorldX,
          startY: interaction.startWorldY,
          endX: world.x,
          endY: world.y,
        })
        setSelectedKeys(nextSelection)
        return
      }

      if (interaction.kind === 'move-selection') {
        const nextDelta = getSnappedSelectionDelta(
          world.x - interaction.startWorldX,
          world.y - interaction.startWorldY,
          interaction.selectionAtStart,
          document.rows,
          document.columns,
        )
        interaction.moveRowDelta = nextDelta.row
        interaction.moveColumnDelta = nextDelta.column
        setSelectionDelta(nextDelta)
        return
      }

      const dx = world.x - interaction.lastWorldX
      const dy = world.y - interaction.lastWorldY

      if (interaction.kind === 'trace') {
        onTraceMove(dx, dy)
        interaction.lastWorldX = world.x
        interaction.lastWorldY = world.y
        return
      }

      const distance = Math.hypot(dx, dy)
      const samples = Math.max(1, Math.ceil(distance / (BEAD_MINOR_RADIUS * 0.65)))
      for (let index = 1; index <= samples; index += 1) {
        const progress = index / samples
        paintAtWorldPoint(
          interaction.lastWorldX + dx * progress,
          interaction.lastWorldY + dy * progress,
          interaction.visited,
          interaction.eraseOverride,
        )
      }
      interaction.lastWorldX = world.x
      interaction.lastWorldY = world.y
    }

    const endInteraction = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const interaction = interactionRef.current
      if (!interaction || interaction.pointerId !== event.pointerId) return
      if (interaction.kind === 'paint') onStrokeEnd()
      if (interaction.kind === 'guide') {
        if (
          event.type === 'pointerup' &&
          !interaction.hasDragged &&
          interaction.guideStartPoint
        ) {
          onGuideStepToggle(
            interaction.guideStartPoint[0],
            interaction.guideStartPoint[1],
          )
        }
        onStrokeEnd()
      }
      if (interaction.kind === 'move-selection') {
        if (interaction.moveRowDelta !== 0 || interaction.moveColumnDelta !== 0) {
          onMoveSelection(
            [...interaction.selectionAtStart],
            interaction.moveRowDelta,
            interaction.moveColumnDelta,
          )
          const movedSelection = new Set<string>()
          for (const key of interaction.selectionAtStart) {
            const position = parseBeadKey(key)
            if (!position) continue
            movedSelection.add(
              beadKey(
                position[0] + interaction.moveRowDelta,
                position[1] + interaction.moveColumnDelta,
              ),
            )
          }
          setSelectedKeys(movedSelection)
        }
        onStrokeEnd()
      }
      interactionRef.current = null
      setIsPanning(false)
      setIsMovingSelection(false)
      setSelectionBox(null)
      setSelectionDelta({ row: 0, column: 0 })
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }

    const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
      event.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const localX = event.clientX - rect.left
      const localY = event.clientY - rect.top
      const current = viewRef.current
      const worldX = (localX - current.offsetX) / current.scale
      const worldY = (localY - current.offsetY) / current.scale
      const nextScale = clampScale(current.scale * Math.exp(-event.deltaY * 0.0015))
      updateView({
        scale: nextScale,
        offsetX: localX - worldX * nextScale,
        offsetY: localY - worldY * nextScale,
      })
    }

    const cursor = isPanning || isMovingSelection
      ? 'grabbing'
      : spaceHeld || tool === 'pan'
        ? 'grab'
        : tool === 'erase'
          ? 'cell'
          : tool === 'trace'
            ? 'move'
            : tool === 'number'
              ? numberingMode === 'manual' ? 'pointer' : 'default'
            : tool === 'select'
              ? 'default'
              : 'crosshair'

    return (
      <div ref={containerRef} className="canvas-shell">
        <canvas
          ref={canvasRef}
          aria-label="Lienzo del patrón de mostacillas"
          className="block h-full w-full touch-none"
          style={{ cursor }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
          onWheel={handleWheel}
        />
      </div>
    )
  },
)
