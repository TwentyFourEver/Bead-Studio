import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PatternCanvas, type PatternCanvasHandle } from './components/PatternCanvas'
import { HeaderControls } from './components/HeaderControls'
import { FloatingReference } from './components/FloatingReference'
import { ImageImportDialog } from './components/ImageImportDialog'
import { DesignToolButtons, InterfaceIcon, Toolbar } from './components/Toolbar'
import {
  beadCountToGridDimension,
  clampBeadCount,
  getPatternSize,
  gridDimensionToBeadCount,
  isNumberableGuidePoint,
} from './lib/geometry'
import { exportPatternPng } from './lib/exportPattern'
import {
  DEFAULT_IMAGE_ANALYSIS_OPTIONS,
  gridToSourcePoint,
  type ImageAnalysisOptions,
  type PatternAnalysisResult,
  type RGB,
} from './lib/imageAnalysis'
import { prepareImageFile, type PreparedImageFile } from './lib/imageFile'
import {
  createImportedDocument,
  normalizeImportedCells,
  paletteFromCells,
} from './lib/imageImportState'
import {
  createEditorHistory,
  recordEditorChange,
  redoEditorChange,
  undoEditorChange,
  type EditorSnapshot,
} from './lib/cellHistory'
import { generateAutomaticGuide } from './lib/guideNumbering'
import { downloadProjectFile, parseProjectFile } from './lib/projectFile'
import {
  loadPattern,
  moveCells,
  paintCells,
  resizePattern,
  savePattern,
} from './lib/patternState'
import type {
  BeadStudioProject,
  GuideStartDirection,
  MirrorMode,
  NumberingMode,
  PatternDocument,
  ReferenceMode,
  ToolMode,
  TraceImage,
} from './types'

const TOOL_LABELS: Record<ToolMode, string> = {
  paint: 'Pincel',
  erase: 'Borrador',
  select: 'Selección',
  pan: 'Mover lienzo',
  trace: 'Mover referencia',
  number: 'Numerar pasos',
}

function removeInvalidGuideSteps(document: PatternDocument): PatternDocument {
  const guideSteps = (document.guideSteps ?? []).filter((step) =>
    isNumberableGuidePoint(step.row, step.column, document.rows, document.columns),
  )
  return guideSteps.length === (document.guideSteps?.length ?? 0)
    ? document
    : { ...document, guideSteps }
}

const GUIDE_START_LABELS: Record<GuideStartDirection, string> = {
  right: 'la derecha',
  left: 'la izquierda',
  top: 'arriba',
  bottom: 'abajo',
}

interface ImageImportSession {
  fileName: string
  prepared: PreparedImageFile | null
  options: ImageAnalysisOptions
  result: PatternAnalysisResult | null
  overrides: Record<string, string | null>
  gridSignature: string | null
  analyzing: boolean
  error: string | null
}

interface AnalysisWorkerResultMessage {
  type: 'result'
  requestId: number
  result: PatternAnalysisResult
}

interface AnalysisWorkerErrorMessage {
  type: 'error'
  requestId: number
  message: string
}

type AnalysisWorkerMessage = AnalysisWorkerResultMessage | AnalysisWorkerErrorMessage | {
  type: 'cancelled'
  requestId: number
}

function analysisGridSignature(result: PatternAnalysisResult) {
  const transform = result.transform
  if (!transform) return null
  const originBucketX = Math.max(1, transform.stepX / 4)
  const originBucketY = Math.max(1, transform.stepY / 4)
  return [
    result.rows,
    result.columns,
    transform.rowOffset,
    transform.columnOffset,
    Math.round(transform.originX / originBucketX),
    Math.round(transform.originY / originBucketY),
    Math.round(transform.stepX),
    Math.round(transform.stepY),
    Math.round(transform.rotationDegrees),
  ].join('|')
}

function rgbToHex({ r, g, b }: RGB) {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function hexToRgb(color: string): RGB {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  }
}

function createImportedTraceImage(
  prepared: PreparedImageFile,
  importedDocument: PatternDocument,
): TraceImage {
  const pattern = getPatternSize(importedDocument.rows, importedDocument.columns)
  const availableWidth = Math.max(1, pattern.width - 56)
  const availableHeight = Math.max(1, pattern.height - 56)
  const baseScale = Math.min(
    availableWidth / prepared.naturalWidth,
    availableHeight / prepared.naturalHeight,
    1,
  )
  const width = prepared.naturalWidth * baseScale
  const height = prepared.naturalHeight * baseScale
  return {
    src: prepared.source,
    name: prepared.name,
    naturalWidth: prepared.naturalWidth,
    naturalHeight: prepared.naturalHeight,
    baseScale,
    scalePercent: 100,
    x: (pattern.width - width) / 2,
    y: (pattern.height - height) / 2,
    opacity: 0.45,
    visible: true,
  }
}

function samplePreparedColor(
  prepared: PreparedImageFile,
  center: { x: number; y: number },
  radiusX: number,
  radiusY: number,
): RGB | null {
  const { width, height, data } = prepared.image
  const red: number[] = []
  const green: number[] = []
  const blue: number[] = []
  const left = Math.max(0, Math.floor(center.x - radiusX))
  const right = Math.min(width - 1, Math.ceil(center.x + radiusX))
  const top = Math.max(0, Math.floor(center.y - radiusY))
  const bottom = Math.min(height - 1, Math.ceil(center.y + radiusY))
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = (x - center.x) / Math.max(1, radiusX)
      const dy = (y - center.y) / Math.max(1, radiusY)
      if (dx * dx + dy * dy > 1) continue
      const offset = (y * width + x) * 4
      if (data[offset + 3] < 32) continue
      red.push(data[offset])
      green.push(data[offset + 1])
      blue.push(data[offset + 2])
    }
  }
  if (!red.length) return null
  red.sort((a, b) => a - b)
  green.sort((a, b) => a - b)
  blue.sort((a, b) => a - b)
  const middle = Math.floor(red.length / 2)
  return { r: red[middle], g: green[middle], b: blue[middle] }
}

function App() {
  const [document, setDocument] = useState<PatternDocument>(() =>
    removeInvalidGuideSteps(loadPattern()),
  )
  const [projectName, setProjectName] = useState('Patrón sin título')
  const [tool, setTool] = useState<ToolMode>('paint')
  const [color, setColor] = useState('#14b8a6')
  const [mirrorMode, setMirrorMode] = useState<MirrorMode>('none')
  const [draftRows, setDraftRows] = useState(() => gridDimensionToBeadCount(document.rows))
  const [draftColumns, setDraftColumns] = useState(() =>
    gridDimensionToBeadCount(document.columns),
  )
  const [zoomPercent, setZoomPercent] = useState(100)
  const [notice, setNotice] = useState<string | null>(null)
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  })
  const [traceImage, setTraceImage] = useState<TraceImage | null>(null)
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('floating')
  const [showGuideSteps, setShowGuideSteps] = useState(true)
  const [numberingMode, setNumberingMode] = useState<NumberingMode>('manual')
  const [guideStartDirection, setGuideStartDirection] =
    useState<GuideStartDirection>('top')
  const [imageImport, setImageImport] = useState<ImageImportSession | null>(null)
  const hasTraceImage = traceImage !== null
  const guideStepCount = document.guideSteps?.length ?? 0
  const paintedBeadCount = Object.keys(document.cells).length
  const documentPaletteColors = useMemo(
    () => paletteFromCells(document.cells).map(({ color: paletteColor }) => paletteColor),
    [document.cells],
  )
  const canvasRef = useRef<PatternCanvasHandle>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentRef = useRef(document)
  const strokeSnapshotRef = useRef<EditorSnapshot | null>(null)
  const editorHistoryRef = useRef(createEditorHistory())
  const traceImageRef = useRef(traceImage)
  const referenceModeRef = useRef(referenceMode)
  const analysisWorkerRef = useRef<Worker | null>(null)
  const analysisRequestRef = useRef(0)
  const imagePreparationRef = useRef(0)
  const preparedImport = imageImport?.prepared ?? null
  const importOptions = imageImport?.options ?? null

  const syncHistoryAvailability = useCallback(() => {
    const next = {
      canUndo: editorHistoryRef.current.past.length > 0,
      canRedo: editorHistoryRef.current.future.length > 0,
    }
    setHistoryAvailability((current) =>
      current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next,
    )
  }, [])

  const resetEditorHistory = useCallback(() => {
    editorHistoryRef.current = createEditorHistory()
    strokeSnapshotRef.current = null
    syncHistoryAvailability()
  }, [syncHistoryAvailability])

  const rememberEditorChange = useCallback(
    (previousSnapshot: EditorSnapshot) => {
      editorHistoryRef.current = recordEditorChange(editorHistoryRef.current, previousSnapshot)
      syncHistoryAvailability()
    },
    [syncHistoryAvailability],
  )

  const getEditorSnapshot = useCallback(
    (): EditorSnapshot => ({
      document: documentRef.current,
      traceImage: traceImageRef.current,
      referenceMode: referenceModeRef.current,
    }),
    [],
  )

  const applyEditorSnapshot = useCallback((snapshot: EditorSnapshot) => {
    const nextReferenceMode = snapshot.traceImage ? snapshot.referenceMode : 'floating'
    canvasRef.current?.preserveViewForGrid(snapshot.document.rows, snapshot.document.columns)
    documentRef.current = snapshot.document
    traceImageRef.current = snapshot.traceImage
    referenceModeRef.current = nextReferenceMode
    setDocument(snapshot.document)
    setTraceImage(snapshot.traceImage)
    setReferenceMode(nextReferenceMode)
    setDraftRows(gridDimensionToBeadCount(snapshot.document.rows))
    setDraftColumns(gridDimensionToBeadCount(snapshot.document.columns))
    setTool('paint')
  }, [])

  useEffect(() => {
    documentRef.current = document
  }, [document])

  useEffect(() => {
    traceImageRef.current = traceImage
  }, [traceImage])

  useEffect(() => {
    referenceModeRef.current = referenceMode
  }, [referenceMode])

  useEffect(() => {
    if (!preparedImport || !importOptions) return
    const timer = window.setTimeout(() => {
      analysisWorkerRef.current?.terminate()
      const requestId = ++analysisRequestRef.current
      try {
        const worker = new Worker(
          new URL('./workers/imageAnalysis.worker.ts', import.meta.url),
          { type: 'module' },
        )
        analysisWorkerRef.current = worker
        setImageImport((current) => current && current.prepared === preparedImport
          ? { ...current, analyzing: true, error: null }
          : current)

        worker.onmessage = (event: MessageEvent<AnalysisWorkerMessage>) => {
          const message = event.data
          if (message.requestId !== requestId || requestId !== analysisRequestRef.current) {
            worker.terminate()
            return
          }
          if (message.type === 'result') {
            const signature = analysisGridSignature(message.result)
            setImageImport((current) => {
              if (!current || current.prepared !== preparedImport) return current
              const gridChanged = signature !== null &&
                current.gridSignature !== null &&
                current.gridSignature !== signature
              return {
                ...current,
                result: gridChanged
                  ? {
                      ...message.result,
                      warnings: [
                        ...message.result.warnings,
                        'La retícula cambió y se reiniciaron las correcciones manuales.',
                      ],
                    }
                  : message.result,
                overrides: gridChanged ? {} : current.overrides,
                gridSignature: signature ?? current.gridSignature,
                analyzing: false,
                error: null,
              }
            })
          } else if (message.type === 'error') {
            setImageImport((current) => current && current.prepared === preparedImport
              ? { ...current, analyzing: false, error: message.message }
              : current)
          }
          worker.terminate()
          if (analysisWorkerRef.current === worker) analysisWorkerRef.current = null
        }
        worker.onerror = (event) => {
          if (requestId !== analysisRequestRef.current) return
          setImageImport((current) => current && current.prepared === preparedImport
            ? {
                ...current,
                analyzing: false,
                error: event.message || 'No fue posible analizar la imagen.',
              }
            : current)
          worker.terminate()
          if (analysisWorkerRef.current === worker) analysisWorkerRef.current = null
        }

        const transferredData = preparedImport.image.data.slice().buffer
        worker.postMessage(
          {
            type: 'analyze',
            requestId,
            image: {
              width: preparedImport.image.width,
              height: preparedImport.image.height,
              data: transferredData,
            },
            options: importOptions,
          },
          [transferredData],
        )
      } catch (error) {
        analysisWorkerRef.current?.terminate()
        analysisWorkerRef.current = null
        setImageImport((current) => current && current.prepared === preparedImport
          ? {
              ...current,
              analyzing: false,
              error: error instanceof Error
                ? error.message
                : 'El navegador no pudo iniciar el análisis local.',
            }
          : current)
      }
    }, 160)

    return () => {
      window.clearTimeout(timer)
      const worker = analysisWorkerRef.current
      if (worker) {
        worker.postMessage({ type: 'cancel', requestId: analysisRequestRef.current })
        worker.terminate()
        analysisWorkerRef.current = null
      }
    }
  }, [importOptions, preparedImport])

  const effectiveImportResult = useMemo(() => {
    const result = imageImport?.result
    if (!result) return null
    const cells = { ...result.cells }
    for (const [key, override] of Object.entries(imageImport.overrides)) {
      if (override === null) delete cells[key]
      else cells[key] = override
    }
    const palette = paletteFromCells(cells).map(({ color: paletteColor, count }) => ({
      color: paletteColor,
      rgb: hexToRgb(paletteColor),
      count,
    }))
    const normalized = normalizeImportedCells(cells, {
      rows: result.rows,
      columns: result.columns,
    })
    return {
      ...result,
      cells,
      palette,
      beads: result.beads.filter((bead) => cells[`${bead.row}:${bead.column}`]),
      canApply: result.canApply && normalized !== null,
    }
  }, [imageImport])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        savePattern(document)
      } catch {
        setNotice('El navegador no pudo guardar el patrón localmente.')
      }
    }, 200)
    return () => window.clearTimeout(timer)
  }, [document])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3400)
    return () => window.clearTimeout(timer)
  }, [notice])

  const cancelImageImport = useCallback(() => {
    imagePreparationRef.current += 1
    analysisRequestRef.current += 1
    analysisWorkerRef.current?.terminate()
    analysisWorkerRef.current = null
    setImageImport(null)
  }, [])

  const handleAnalyzeImage = useCallback(async (file: File) => {
    const preparationId = ++imagePreparationRef.current
    analysisRequestRef.current += 1
    analysisWorkerRef.current?.terminate()
    analysisWorkerRef.current = null
    setImageImport({
      fileName: file.name,
      prepared: null,
      options: { ...DEFAULT_IMAGE_ANALYSIS_OPTIONS },
      result: null,
      overrides: {},
      gridSignature: null,
      analyzing: true,
      error: null,
    })
    try {
      const prepared = await prepareImageFile(file)
      if (preparationId !== imagePreparationRef.current) return
      setImageImport((current) => current
        ? { ...current, fileName: prepared.name, prepared, analyzing: true, error: null }
        : current)
    } catch (error) {
      if (preparationId !== imagePreparationRef.current) return
      setImageImport((current) => current
        ? {
            ...current,
            analyzing: false,
            error: error instanceof Error ? error.message : 'No fue posible preparar la imagen.',
          }
        : current)
    }
  }, [])

  const updateImageAnalysisOptions = useCallback((patch: Partial<ImageAnalysisOptions>) => {
    setImageImport((current) => current
      ? {
          ...current,
          options: { ...current.options, ...patch },
          analyzing: Boolean(current.prepared),
          error: null,
        }
      : current)
  }, [])

  const handleImportBackgroundMode = useCallback((mode: 'auto' | 'manual') => {
    setImageImport((current) => {
      if (!current) return current
      const fallback = current.result?.background ?? { r: 255, g: 255, b: 255 }
      return {
        ...current,
        options: {
          ...current.options,
          backgroundMode: mode,
          backgroundColor: mode === 'manual' ? current.options.backgroundColor ?? fallback : null,
        },
        analyzing: Boolean(current.prepared),
        error: null,
      }
    })
  }, [])

  const handlePickImportBackground = useCallback((backgroundColor: RGB) => {
    updateImageAnalysisOptions({ backgroundMode: 'manual', backgroundColor })
  }, [updateImageAnalysisOptions])

  const handleToggleImportedCell = useCallback((row: number, column: number) => {
    if ((row + column) % 2 !== 0) return
    setImageImport((current) => {
      const result = current?.result
      const prepared = current?.prepared
      const transform = result?.transform
      if (!current || !result || !prepared || !transform) return current
      const key = `${row}:${column}`
      const existingOverride = current.overrides[key]
      const currentlyPainted = existingOverride === null
        ? false
        : typeof existingOverride === 'string' || Boolean(result.cells[key])
      if (currentlyPainted) {
        return { ...current, overrides: { ...current.overrides, [key]: null } }
      }

      const sourcePoint = gridToSourcePoint(transform, row, column)
      const sampled = samplePreparedColor(
        prepared,
        sourcePoint,
        Math.max(2, transform.stepX * 0.24),
        Math.max(2, transform.stepY * 0.24),
      )
      const sampledColor = result.cells[key]
        ?? (sampled ? rgbToHex(sampled) : result.palette[0]?.color ?? color)
      return {
        ...current,
        overrides: { ...current.overrides, [key]: sampledColor.toLowerCase() },
      }
    })
  }, [color])

  const confirmImageImport = useCallback(() => {
    const prepared = imageImport?.prepared
    if (!prepared || !effectiveImportResult?.canApply) return
    const normalized = normalizeImportedCells(effectiveImportResult.cells, {
      rows: effectiveImportResult.rows,
      columns: effectiveImportResult.columns,
    })
    if (!normalized) {
      setImageImport((current) => current
        ? { ...current, error: 'El resultado no cabe en el límite de 199 cuentas por eje.' }
        : current)
      return
    }

    const previousSnapshot = getEditorSnapshot()
    const importedDocument = createImportedDocument(previousSnapshot.document, normalized)
    const importedTrace = createImportedTraceImage(prepared, importedDocument)
    rememberEditorChange(previousSnapshot)
    documentRef.current = importedDocument
    traceImageRef.current = importedTrace
    referenceModeRef.current = 'floating'
    setDocument(importedDocument)
    setTraceImage(importedTrace)
    setReferenceMode('floating')
    setDraftRows(gridDimensionToBeadCount(importedDocument.rows))
    setDraftColumns(gridDimensionToBeadCount(importedDocument.columns))
    setTool('paint')
    analysisWorkerRef.current?.terminate()
    analysisWorkerRef.current = null
    imagePreparationRef.current += 1
    setImageImport(null)
    window.requestAnimationFrame(() => canvasRef.current?.fit())
    setNotice(
      `${Object.keys(importedDocument.cells).length} cuentas convertidas. La imagen quedó como referencia flotante.`,
    )
  }, [effectiveImportResult, getEditorSnapshot, imageImport, rememberEditorChange])

  const handleSaveProject = () => {
    const name = projectName.trim() || 'Patrón sin título'
    const project: BeadStudioProject = {
      format: 'bead-studio-project',
      version: 1,
      name,
      document,
      editor: {
        color,
        mirrorMode,
        referenceMode,
        traceImage,
        showGuideSteps,
      },
    }

    try {
      downloadProjectFile(project)
      if (name !== projectName) setProjectName(name)
      setNotice('Proyecto guardado. Podrás abrirlo y seguir pintando.')
    } catch {
      setNotice('No fue posible guardar el proyecto.')
    }
  }

  const handleOpenProject = async (file: File) => {
    if (file.size > 35 * 1024 * 1024) {
      setNotice('El proyecto es demasiado grande para abrirlo.')
      return
    }

    try {
      const project = parseProjectFile(await file.text())
      const openedDocument = removeInvalidGuideSteps(project.document)
      documentRef.current = openedDocument
      strokeSnapshotRef.current = null
      setDocument(openedDocument)
      setProjectName(project.name)
      setDraftRows(gridDimensionToBeadCount(openedDocument.rows))
      setDraftColumns(gridDimensionToBeadCount(openedDocument.columns))
      setColor(project.editor.color)
      setMirrorMode(project.editor.mirrorMode)
      setReferenceMode(project.editor.traceImage ? project.editor.referenceMode : 'floating')
      setTraceImage(project.editor.traceImage)
      setShowGuideSteps(project.editor.showGuideSteps ?? true)
      setTool('paint')
      traceImageRef.current = project.editor.traceImage
      referenceModeRef.current = project.editor.traceImage ? project.editor.referenceMode : 'floating'
      resetEditorHistory()
      window.requestAnimationFrame(() => canvasRef.current?.fit())
      setNotice(`Proyecto “${project.name}” abierto. Ya puedes seguir pintando.`)
    } catch {
      setNotice('No se pudo abrir: el archivo no es un proyecto válido de Bead Studio.')
    }
  }

  const handlePaint = useCallback(
    (positions: Array<[number, number]>, paintColor: string | null) => {
      const next = paintCells(documentRef.current, positions, paintColor)
      documentRef.current = next
      setDocument(next)
    },
    [],
  )

  const handleStrokeStart = useCallback(() => {
    strokeSnapshotRef.current = getEditorSnapshot()
  }, [getEditorSnapshot])

  const handleStrokeEnd = useCallback(() => {
    const snapshot = strokeSnapshotRef.current
    strokeSnapshotRef.current = null
    if (!snapshot || snapshot.document === documentRef.current) return
    rememberEditorChange(snapshot)
  }, [rememberEditorChange])

  const handleMoveSelection = useCallback(
    (selectedKeys: string[], rowDelta: number, columnDelta: number) => {
      const next = moveCells(documentRef.current, selectedKeys, rowDelta, columnDelta)
      documentRef.current = next
      setDocument(next)
    },
    [],
  )

  const handleUndo = useCallback(() => {
    const transition = undoEditorChange(editorHistoryRef.current, getEditorSnapshot())
    if (!transition) return
    editorHistoryRef.current = transition.history
    strokeSnapshotRef.current = null
    applyEditorSnapshot(transition.snapshot)
    syncHistoryAvailability()
  }, [applyEditorSnapshot, getEditorSnapshot, syncHistoryAvailability])

  const handleRedo = useCallback(() => {
    const transition = redoEditorChange(editorHistoryRef.current, getEditorSnapshot())
    if (!transition) return
    editorHistoryRef.current = transition.history
    strokeSnapshotRef.current = null
    applyEditorSnapshot(transition.snapshot)
    syncHistoryAvailability()
  }, [applyEditorSnapshot, getEditorSnapshot, syncHistoryAvailability])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (imageImport !== null || window.document.querySelector('dialog[open]')) return
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()
        if ((key === 'z' && event.shiftKey) || key === 'y') {
          event.preventDefault()
          handleRedo()
          return
        }
        if (key === 'z') {
          event.preventDefault()
          handleUndo()
          return
        }
      }
      if (event.key.toLowerCase() === 'b') setTool('paint')
      if (event.key.toLowerCase() === 'e') setTool('erase')
      if (event.key.toLowerCase() === 'v') setTool('select')
      if (event.key.toLowerCase() === 'h') setTool('pan')
      if (event.key.toLowerCase() === 'n') setTool('number')
      if (event.key.toLowerCase() === 't' && hasTraceImage && referenceMode === 'trace') {
        setTool('trace')
      }
      if (event.key === '+' || event.key === '=') canvasRef.current?.zoomIn()
      if (event.key === '-') canvasRef.current?.zoomOut()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [handleRedo, handleUndo, hasTraceImage, imageImport, referenceMode])

  const enforceMirrorDimensions = useCallback(
    (base: PatternDocument, mode: MirrorMode) => {
      let rows = base.rows
      let columns = base.columns
      if ((mode === 'horizontal' || mode === 'both') && rows % 2 === 0) rows += 1
      if ((mode === 'vertical' || mode === 'both') && columns % 2 === 0) columns += 1
      return rows === base.rows && columns === base.columns
        ? base
        : resizePattern(base, rows, columns)
    },
    [],
  )

  const handleMirrorModeChange = (mode: MirrorMode) => {
    setMirrorMode(mode)
    const adjusted = enforceMirrorDimensions(document, mode)
    if (adjusted.rows !== document.rows || adjusted.columns !== document.columns) {
      setNotice(
        `Tamaño ajustado a ${gridDimensionToBeadCount(adjusted.columns)} × ${gridDimensionToBeadCount(adjusted.rows)} para una simetría exacta.`,
      )
      resetEditorHistory()
    }
    setDocument(adjusted)
    setDraftRows(gridDimensionToBeadCount(adjusted.rows))
    setDraftColumns(gridDimensionToBeadCount(adjusted.columns))
  }

  const handleApplyDimensions = () => {
    const requestedRows = clampBeadCount(
      Number.isFinite(draftRows) ? draftRows : gridDimensionToBeadCount(document.rows),
    )
    const requestedColumns = clampBeadCount(
      Number.isFinite(draftColumns) ? draftColumns : gridDimensionToBeadCount(document.columns),
    )
    let rows = beadCountToGridDimension(requestedRows)
    let columns = beadCountToGridDimension(requestedColumns)
    if ((mirrorMode === 'horizontal' || mirrorMode === 'both') && rows % 2 === 0) rows += 1
    if ((mirrorMode === 'vertical' || mirrorMode === 'both') && columns % 2 === 0) columns += 1
    setDocument((current) => resizePattern(current, rows, columns))
    if (rows !== document.rows || columns !== document.columns) {
      resetEditorHistory()
    }
    const appliedRows = gridDimensionToBeadCount(rows)
    const appliedColumns = gridDimensionToBeadCount(columns)
    setDraftRows(appliedRows)
    setDraftColumns(appliedColumns)
    if (appliedRows !== requestedRows || appliedColumns !== requestedColumns) {
      setNotice(`Se usó ${appliedColumns} × ${appliedRows} para mantener las parejas del espejo.`)
    } else {
      setNotice(`Lienzo actualizado a ${requestedColumns} × ${requestedRows}.`)
    }
  }

  const updateBackground = (patch: Partial<PatternDocument['background']>) => {
    setDocument((current) => ({
      ...current,
      background: { ...current.background, ...patch },
    }))
  }

  const clearPattern = () => {
    if (!Object.keys(document.cells).length && !guideStepCount) return
    if (!window.confirm('¿Quieres borrar todos los colores y números del patrón?')) return
    rememberEditorChange(getEditorSnapshot())
    setDocument((current) => {
      const next = { ...current, cells: {}, guideSteps: [] }
      documentRef.current = next
      return next
    })
    setNotice('El patrón quedó limpio.')
  }

  const handleGuideStepToggle = useCallback((row: number, column: number) => {
    setShowGuideSteps(true)
    const current = documentRef.current
    if (!isNumberableGuidePoint(row, column, current.rows, current.columns)) return
    const steps = current.guideSteps ?? []
    const existingIndex = steps.findIndex(
      (step) => step.row === row && step.column === column,
    )
    const guideSteps = existingIndex >= 0
      ? steps.filter((_, index) => index !== existingIndex)
      : [...steps, { row, column }]
    const next = { ...current, guideSteps }
    documentRef.current = next
    setDocument(next)
  }, [])

  const handleGuideStepsAdd = useCallback((positions: Array<[number, number]>) => {
    if (!positions.length) return
    setShowGuideSteps(true)
    const current = documentRef.current
    const steps = current.guideSteps ?? []
    const existing = new Set(steps.map((step) => `${step.row}:${step.column}`))
    const additions = positions.flatMap(([row, column]) => {
      if (!isNumberableGuidePoint(row, column, current.rows, current.columns)) return []
      const key = `${row}:${column}`
      if (existing.has(key)) return []
      existing.add(key)
      return [{ row, column }]
    })
    if (!additions.length) return
    const next = { ...current, guideSteps: [...steps, ...additions] }
    documentRef.current = next
    setDocument(next)
  }, [])

  const clearGuideSteps = () => {
    if (!guideStepCount) return
    if (!window.confirm('¿Quieres borrar toda la numeración del recorrido?')) return
    setDocument((current) => {
      const next = { ...current, guideSteps: [] }
      documentRef.current = next
      return next
    })
    setNotice('Guía de tejido eliminada.')
  }

  const generateGuideSteps = () => {
    const current = documentRef.current
    if (
      (current.guideSteps?.length ?? 0) > 0 &&
      !window.confirm('¿Quieres reemplazar la numeración actual por un recorrido automático?')
    ) {
      return
    }

    const result = generateAutomaticGuide(current, guideStartDirection)
    if (!result.steps.length) {
      setNotice('Pinta las cuatro cuentas de al menos una cruz para generar el recorrido.')
      return
    }

    const next = { ...current, guideSteps: result.steps }
    documentRef.current = next
    setDocument(next)
    setShowGuideSteps(true)

    if (!result.continuous) {
      const sectionDetail = result.componentCount > 1
        ? ` en ${result.componentCount} secciones`
        : ''
      setNotice(
        `Se numeraron ${result.steps.length} pasos desde ${GUIDE_START_LABELS[guideStartDirection]}${sectionDetail}. El recorrido contiene al menos un salto entre ramas; puedes ajustarlo en modo manual.`,
      )
    } else {
      setNotice(
        `Recorrido desde ${GUIDE_START_LABELS[guideStartDirection]} generado con ${result.steps.length} pasos.`,
      )
    }
  }

  const handleTraceUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setNotice('Selecciona un archivo de imagen válido.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setNotice('La imagen debe pesar menos de 20 MB.')
      return
    }

    const reader = new FileReader()
    reader.onerror = () => setNotice('No fue posible leer la imagen seleccionada.')
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      const source = reader.result
      const image = new Image()
      image.onerror = () => setNotice('El formato de la imagen no es compatible.')
      image.onload = () => {
        const pattern = getPatternSize(document.rows, document.columns)
        const availableWidth = Math.max(1, pattern.width - 56)
        const availableHeight = Math.max(1, pattern.height - 56)
        const baseScale = Math.min(
          availableWidth / image.naturalWidth,
          availableHeight / image.naturalHeight,
          1,
        )
        const width = image.naturalWidth * baseScale
        const height = image.naturalHeight * baseScale
        const nextTraceImage: TraceImage = {
          src: source,
          name: file.name,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          baseScale,
          scalePercent: 100,
          x: (pattern.width - width) / 2,
          y: (pattern.height - height) / 2,
          opacity: 0.45,
          visible: true,
        }
        traceImageRef.current = nextTraceImage
        referenceModeRef.current = 'floating'
        setTraceImage(nextTraceImage)
        setReferenceMode('floating')
        setTool('paint')
        setNotice('Referencia agregada en una ventana flotante.')
      }
      image.src = source
    }
    reader.readAsDataURL(file)
  }

  const updateTraceImage = (patch: Partial<TraceImage>) => {
    setTraceImage((current) => {
      const next = current ? { ...current, ...patch } : current
      traceImageRef.current = next
      return next
    })
  }

  const removeTraceImage = () => {
    traceImageRef.current = null
    referenceModeRef.current = 'floating'
    setTraceImage(null)
    setReferenceMode('floating')
    if (tool === 'trace') setTool('paint')
  }

  const changeReferenceMode = (mode: ReferenceMode) => {
    referenceModeRef.current = mode
    setReferenceMode(mode)
    setTraceImage((current) => {
      const next = current ? { ...current, visible: true } : current
      traceImageRef.current = next
      return next
    })
    if (mode === 'floating' && tool === 'trace') setTool('paint')
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-titlebar">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="brand-copy">
              <h1>Bead Studio</h1>
              <p>Editor de patrones</p>
            </div>
          </div>
          <div className="titlebar-context" aria-label="Proyecto actual">
            <span className="workspace-indicator" aria-hidden="true" />
            <input
              className="titlebar-project-name"
              value={projectName}
              maxLength={120}
              onChange={(event) => setProjectName(event.target.value)}
              aria-label="Nombre del proyecto"
              title="Nombre del proyecto"
            />
          </div>
          <div className="titlebar-version">Patrón de cuentas</div>
        </div>
        <HeaderControls
          mirrorMode={mirrorMode}
          onMirrorModeChange={handleMirrorModeChange}
          rows={draftRows}
          columns={draftColumns}
          onRowsChange={setDraftRows}
          onColumnsChange={setDraftColumns}
          onApplyDimensions={handleApplyDimensions}
          backgroundMode={document.background.mode}
          backgroundColor={document.background.color}
          onBackgroundModeChange={(mode) => updateBackground({ mode })}
          onBackgroundColorChange={(backgroundColor) => updateBackground({ color: backgroundColor })}
          tool={tool}
          onToolChange={setTool}
          traceImage={traceImage}
          referenceMode={referenceMode}
          onReferenceModeChange={changeReferenceMode}
          onTraceUpload={handleTraceUpload}
          onTraceChange={updateTraceImage}
          onTraceRemove={removeTraceImage}
          onExport={() => {
            const exported = exportPatternPng(document, showGuideSteps)
            if (!exported) setNotice('Pinta al menos una cuenta antes de exportar.')
          }}
          onClearDesign={clearPattern}
        />
      </header>

      <div className="workspace">
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          color={color}
          presetColors={documentPaletteColors}
          onColorChange={(nextColor) => {
            setColor(nextColor)
            setTool('paint')
          }}
          guideStepCount={guideStepCount}
          numberingMode={numberingMode}
          onNumberingModeChange={setNumberingMode}
          guideStartDirection={guideStartDirection}
          onGuideStartDirectionChange={setGuideStartDirection}
          onGenerateGuide={generateGuideSteps}
          showGuideSteps={showGuideSteps}
          onGuideVisibilityChange={setShowGuideSteps}
          onClearGuide={clearGuideSteps}
        />

        <section className="canvas-area" aria-label="Área de trabajo">
          <div className="canvas-topbar">
            <div className="canvas-topbar-scroll">
              <div className="canvas-command-group" aria-label="Archivo y documento">
                <span className="document-meta">
                  {gridDimensionToBeadCount(document.columns)} ×{' '}
                  {gridDimensionToBeadCount(document.rows)}
                </span>
                <button type="button" className="topbar-action" onClick={handleSaveProject} title="Guardar proyecto">
                  <InterfaceIcon name="save" />
                  <span>Guardar</span>
                </button>
                <button
                  type="button"
                  className="topbar-action"
                  onClick={() => projectInputRef.current?.click()}
                  title="Abrir proyecto"
                >
                  <InterfaceIcon name="open" />
                  <span>Abrir</span>
                </button>
                <input
                  ref={projectInputRef}
                  className="project-file-input"
                  type="file"
                  accept=".beadstudio,application/json"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void handleOpenProject(file)
                    event.currentTarget.value = ''
                  }}
                />
                <button
                  type="button"
                  className="topbar-action"
                  onClick={() => imageInputRef.current?.click()}
                  title="Convertir imagen"
                >
                  <InterfaceIcon name="scan" />
                  <span>Convertir imagen</span>
                </button>
                <input
                  ref={imageInputRef}
                  className="project-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void handleAnalyzeImage(file)
                    event.currentTarget.value = ''
                  }}
                />
              </div>

              <span className="topbar-divider" aria-hidden="true" />

              <div className="history-controls" role="group" aria-label="Historial de edición">
                <button
                  type="button"
                  className="history-button undo-button"
                  onClick={handleUndo}
                  disabled={!historyAvailability.canUndo}
                  aria-label="Deshacer"
                  title="Deshacer último trazo (Ctrl+Z)"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M8 5 4 9l4 4" />
                    <path d="M5 9h6a5 5 0 0 1 5 5" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="history-button redo-button"
                  onClick={handleRedo}
                  disabled={!historyAvailability.canRedo}
                  aria-label="Rehacer"
                  title="Rehacer último trazo (Ctrl+Y o Ctrl+Mayús+Z)"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m12 5 4 4-4 4" />
                    <path d="M15 9H9a5 5 0 0 0-5 5" />
                  </svg>
                </button>
              </div>

              <span className="topbar-divider" aria-hidden="true" />

              <div className="topbar-tools" role="toolbar" aria-label="Herramientas de diseño">
                <DesignToolButtons tool={tool} onToolChange={setTool} />
              </div>
            </div>
            <div className="zoom-controls" aria-label="Controles de zoom">
              <button type="button" onClick={() => canvasRef.current?.zoomOut()} aria-label="Alejar">−</button>
              <span>{zoomPercent}%</span>
              <button type="button" onClick={() => canvasRef.current?.zoomIn()} aria-label="Acercar">+</button>
              <button type="button" className="fit-button" onClick={() => canvasRef.current?.fit()}>
                Ajustar
              </button>
            </div>
          </div>

          <div className="canvas-stage">
            <PatternCanvas
              ref={canvasRef}
              document={document}
              tool={tool}
              color={color}
              mirrorMode={mirrorMode}
              traceImage={referenceMode === 'trace' ? traceImage : null}
              onTraceMove={(deltaX, deltaY) => {
                setTraceImage((current) =>
                  current ? { ...current, x: current.x + deltaX, y: current.y + deltaY } : current,
                )
              }}
              onPaint={handlePaint}
              onMoveSelection={handleMoveSelection}
              onGuideStepToggle={handleGuideStepToggle}
              onGuideStepsAdd={handleGuideStepsAdd}
              numberingMode={numberingMode}
              showGuideSteps={showGuideSteps}
              onStrokeStart={handleStrokeStart}
              onStrokeEnd={handleStrokeEnd}
              onZoomChange={setZoomPercent}
            />
            {traceImage && referenceMode === 'floating' && traceImage.visible && (
              <FloatingReference
                image={traceImage}
                onHide={() => updateTraceImage({ visible: false })}
                onUseAsTrace={() => changeReferenceMode('trace')}
              />
            )}
            <div className="canvas-hint">
              <span><kbd>H</kbd> para mover</span>
              <span className="hint-divider" />
              <span>Rueda para zoom</span>
            </div>
          </div>
          <footer className="canvas-statusbar" aria-label="Estado del documento">
            <span className="status-tool">
              <span className="status-tool-dot" aria-hidden="true" />
              {TOOL_LABELS[tool]}
            </span>
            <span>{paintedBeadCount} {paintedBeadCount === 1 ? 'cuenta pintada' : 'cuentas pintadas'}</span>
            {guideStepCount > 0 && <span>{guideStepCount} pasos</span>}
            <span className="statusbar-spacer" />
            <span>{zoomPercent}%</span>
            <span>
              {gridDimensionToBeadCount(document.columns)} × {gridDimensionToBeadCount(document.rows)}
            </span>
          </footer>
        </section>
      </div>

      <ImageImportDialog
        open={imageImport !== null}
        source={imageImport?.prepared?.source ?? ''}
        fileName={imageImport?.fileName ?? ''}
        result={effectiveImportResult}
        analyzing={imageImport?.analyzing ?? false}
        error={imageImport?.error ?? null}
        backgroundMode={imageImport?.options.backgroundMode ?? 'auto'}
        backgroundTolerance={imageImport?.options.backgroundTolerance ?? 14}
        colorMergeDelta={imageImport?.options.colorMergeDeltaE ?? 8}
        onBackgroundModeChange={handleImportBackgroundMode}
        onBackgroundToleranceChange={(backgroundTolerance) =>
          updateImageAnalysisOptions({ backgroundTolerance })
        }
        onColorMergeDeltaChange={(colorMergeDeltaE) =>
          updateImageAnalysisOptions({ colorMergeDeltaE })
        }
        onPickBackground={handlePickImportBackground}
        onToggleCell={handleToggleImportedCell}
        onCancel={cancelImageImport}
        onConfirm={confirmImageImport}
      />

      {notice && (
        <div className="toast" role="status">
          <span aria-hidden="true">✓</span>
          {notice}
        </div>
      )}
    </main>
  )
}

export default App
