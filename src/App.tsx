import { useCallback, useEffect, useRef, useState } from 'react'
import { PatternCanvas, type PatternCanvasHandle } from './components/PatternCanvas'
import { HeaderControls } from './components/HeaderControls'
import { FloatingReference } from './components/FloatingReference'
import { Toolbar } from './components/Toolbar'
import {
  beadCountToGridDimension,
  clampBeadCount,
  getPatternSize,
  gridDimensionToBeadCount,
} from './lib/geometry'
import { exportPatternPng } from './lib/exportPattern'
import {
  createCellHistory,
  recordCellChange,
  redoCellChange,
  undoCellChange,
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

function App() {
  const [document, setDocument] = useState<PatternDocument>(() => loadPattern())
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
  const hasTraceImage = traceImage !== null
  const guideStepCount = document.guideSteps?.length ?? 0
  const paintedBeadCount = Object.keys(document.cells).length
  const canvasRef = useRef<PatternCanvasHandle>(null)
  const documentRef = useRef(document)
  const strokeSnapshotRef = useRef<Record<string, string> | null>(null)
  const cellHistoryRef = useRef(createCellHistory())

  const syncHistoryAvailability = useCallback(() => {
    const next = {
      canUndo: cellHistoryRef.current.past.length > 0,
      canRedo: cellHistoryRef.current.future.length > 0,
    }
    setHistoryAvailability((current) =>
      current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next,
    )
  }, [])

  const resetCellHistory = useCallback(() => {
    cellHistoryRef.current = createCellHistory()
    strokeSnapshotRef.current = null
    syncHistoryAvailability()
  }, [syncHistoryAvailability])

  const rememberCellChange = useCallback(
    (previousCells: Record<string, string>) => {
      cellHistoryRef.current = recordCellChange(cellHistoryRef.current, previousCells)
      syncHistoryAvailability()
    },
    [syncHistoryAvailability],
  )

  useEffect(() => {
    documentRef.current = document
  }, [document])

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
      documentRef.current = project.document
      strokeSnapshotRef.current = null
      setDocument(project.document)
      setProjectName(project.name)
      setDraftRows(gridDimensionToBeadCount(project.document.rows))
      setDraftColumns(gridDimensionToBeadCount(project.document.columns))
      setColor(project.editor.color)
      setMirrorMode(project.editor.mirrorMode)
      setReferenceMode(project.editor.traceImage ? project.editor.referenceMode : 'floating')
      setTraceImage(project.editor.traceImage)
      setShowGuideSteps(project.editor.showGuideSteps ?? true)
      setTool('paint')
      resetCellHistory()
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
    strokeSnapshotRef.current = documentRef.current.cells
  }, [])

  const handleStrokeEnd = useCallback(() => {
    const snapshot = strokeSnapshotRef.current
    strokeSnapshotRef.current = null
    if (!snapshot || snapshot === documentRef.current.cells) return
    rememberCellChange(snapshot)
  }, [rememberCellChange])

  const handleMoveSelection = useCallback(
    (selectedKeys: string[], rowDelta: number, columnDelta: number) => {
      const next = moveCells(documentRef.current, selectedKeys, rowDelta, columnDelta)
      documentRef.current = next
      setDocument(next)
    },
    [],
  )

  const handleUndo = useCallback(() => {
    const transition = undoCellChange(cellHistoryRef.current, documentRef.current.cells)
    if (!transition) return
    cellHistoryRef.current = transition.history
    strokeSnapshotRef.current = null
    const next = { ...documentRef.current, cells: transition.cells }
    documentRef.current = next
    setDocument(next)
    syncHistoryAvailability()
  }, [syncHistoryAvailability])

  const handleRedo = useCallback(() => {
    const transition = redoCellChange(cellHistoryRef.current, documentRef.current.cells)
    if (!transition) return
    cellHistoryRef.current = transition.history
    strokeSnapshotRef.current = null
    const next = { ...documentRef.current, cells: transition.cells }
    documentRef.current = next
    setDocument(next)
    syncHistoryAvailability()
  }, [syncHistoryAvailability])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
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
  }, [handleRedo, handleUndo, hasTraceImage, referenceMode])

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
      resetCellHistory()
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
      resetCellHistory()
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
    rememberCellChange(document.cells)
    setDocument((current) => {
      const next = { ...current, cells: {}, guideSteps: [] }
      documentRef.current = next
      return next
    })
    setNotice('El patrón quedó limpio.')
  }

  const handleGuideStepToggle = useCallback((row: number, column: number) => {
    setShowGuideSteps(true)
    setDocument((current) => {
      const steps = current.guideSteps ?? []
      const existingIndex = steps.findIndex(
        (step) => step.row === row && step.column === column,
      )
      const guideSteps = existingIndex >= 0
        ? steps.filter((_, index) => index !== existingIndex)
        : [...steps, { row, column }]
      const next = { ...current, guideSteps }
      documentRef.current = next
      return next
    })
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

    const result = generateAutomaticGuide(current)
    if (!result.steps.length) {
      setNotice('Pinta las cuatro cuentas de al menos una cruz para generar el recorrido.')
      return
    }

    const next = { ...current, guideSteps: result.steps }
    documentRef.current = next
    setDocument(next)
    setShowGuideSteps(true)

    if (result.componentCount > 1) {
      setNotice(
        `Se numeraron ${result.steps.length} pasos en ${result.componentCount} secciones. Revisa los saltos en modo manual.`,
      )
    } else {
      setNotice(`Numeración horizontal generada con ${result.steps.length} pasos.`)
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
        setTraceImage({
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
        })
        setReferenceMode('floating')
        setTool('paint')
        setNotice('Referencia agregada en una ventana flotante.')
      }
      image.src = source
    }
    reader.readAsDataURL(file)
  }

  const updateTraceImage = (patch: Partial<TraceImage>) => {
    setTraceImage((current) => (current ? { ...current, ...patch } : current))
  }

  const removeTraceImage = () => {
    setTraceImage(null)
    if (tool === 'trace') setTool('paint')
  }

  const changeReferenceMode = (mode: ReferenceMode) => {
    setReferenceMode(mode)
    setTraceImage((current) => (current ? { ...current, visible: true } : current))
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
        />
      </header>

      <div className="workspace">
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={(nextColor) => {
            setColor(nextColor)
            setTool('paint')
          }}
          onSaveProject={handleSaveProject}
          onOpenProject={handleOpenProject}
          onExport={() => exportPatternPng(document, showGuideSteps)}
          onClear={clearPattern}
          guideStepCount={guideStepCount}
          numberingMode={numberingMode}
          onNumberingModeChange={setNumberingMode}
          onGenerateGuide={generateGuideSteps}
          showGuideSteps={showGuideSteps}
          onGuideVisibilityChange={setShowGuideSteps}
          onClearGuide={clearGuideSteps}
        />

        <section className="canvas-area" aria-label="Área de trabajo">
          <div className="canvas-topbar">
            <div className="canvas-command-group" aria-label="Edición del documento">
              <span className="document-meta">
                {gridDimensionToBeadCount(document.columns)} ×{' '}
                {gridDimensionToBeadCount(document.rows)}
              </span>
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
