import { useCallback, useEffect, useRef, useState } from 'react'
import { PatternCanvas, type PatternCanvasHandle } from './components/PatternCanvas'
import { HeaderControls } from './components/HeaderControls'
import { FloatingReference } from './components/FloatingReference'
import { Toolbar } from './components/Toolbar'
import { clampDimension, getPatternSize } from './lib/geometry'
import { exportPatternPng } from './lib/exportPattern'
import {
  loadPattern,
  moveCells,
  paintCells,
  resizePattern,
  savePattern,
} from './lib/patternState'
import type {
  MirrorMode,
  PatternDocument,
  ReferenceMode,
  ToolMode,
  TraceImage,
} from './types'

function App() {
  const [document, setDocument] = useState<PatternDocument>(() => loadPattern())
  const [tool, setTool] = useState<ToolMode>('paint')
  const [color, setColor] = useState('#14b8a6')
  const [mirrorMode, setMirrorMode] = useState<MirrorMode>('none')
  const [draftRows, setDraftRows] = useState(document.rows)
  const [draftColumns, setDraftColumns] = useState(document.columns)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [notice, setNotice] = useState<string | null>(null)
  const [cellHistory, setCellHistory] = useState<Array<Record<string, string>>>([])
  const [traceImage, setTraceImage] = useState<TraceImage | null>(null)
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('floating')
  const hasTraceImage = traceImage !== null
  const canvasRef = useRef<PatternCanvasHandle>(null)
  const documentRef = useRef(document)
  const strokeSnapshotRef = useRef<Record<string, string> | null>(null)

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
    setCellHistory((current) => [...current.slice(-49), snapshot])
  }, [])

  const handleMoveSelection = useCallback(
    (selectedKeys: string[], rowDelta: number, columnDelta: number) => {
      const next = moveCells(documentRef.current, selectedKeys, rowDelta, columnDelta)
      documentRef.current = next
      setDocument(next)
    },
    [],
  )

  const handleUndo = useCallback(() => {
    const previousCells = cellHistory.at(-1)
    if (!previousCells) return
    const next = { ...documentRef.current, cells: previousCells }
    documentRef.current = next
    setDocument(next)
    setCellHistory(cellHistory.slice(0, -1))
  }, [cellHistory])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        handleUndo()
        return
      }
      if (event.key.toLowerCase() === 'b') setTool('paint')
      if (event.key.toLowerCase() === 'e') setTool('erase')
      if (event.key.toLowerCase() === 'v') setTool('select')
      if (event.key.toLowerCase() === 't' && hasTraceImage && referenceMode === 'trace') {
        setTool('trace')
      }
      if (event.key === '+' || event.key === '=') canvasRef.current?.zoomIn()
      if (event.key === '-') canvasRef.current?.zoomOut()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [handleUndo, hasTraceImage, referenceMode])

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
      setNotice(`Tamaño ajustado a ${adjusted.columns} × ${adjusted.rows} para una simetría exacta.`)
      setCellHistory([])
    }
    setDocument(adjusted)
    setDraftRows(adjusted.rows)
    setDraftColumns(adjusted.columns)
  }

  const handleApplyDimensions = () => {
    let rows = clampDimension(Number.isFinite(draftRows) ? draftRows : document.rows)
    let columns = clampDimension(Number.isFinite(draftColumns) ? draftColumns : document.columns)
    const requestedRows = rows
    const requestedColumns = columns
    if ((mirrorMode === 'horizontal' || mirrorMode === 'both') && rows % 2 === 0) rows += 1
    if ((mirrorMode === 'vertical' || mirrorMode === 'both') && columns % 2 === 0) columns += 1
    setDocument((current) => resizePattern(current, rows, columns))
    if (rows !== document.rows || columns !== document.columns) setCellHistory([])
    setDraftRows(rows)
    setDraftColumns(columns)
    if (rows !== requestedRows || columns !== requestedColumns) {
      setNotice(`Se usó ${columns} × ${rows} para mantener las parejas del espejo.`)
    } else {
      setNotice(`Lienzo actualizado a ${columns} × ${rows}.`)
    }
  }

  const updateBackground = (patch: Partial<PatternDocument['background']>) => {
    setDocument((current) => ({
      ...current,
      background: { ...current.background, ...patch },
    }))
  }

  const clearPattern = () => {
    if (!Object.keys(document.cells).length) return
    if (!window.confirm('¿Quieres borrar todos los colores del patrón?')) return
    setCellHistory((current) => [...current.slice(-49), document.cells])
    setDocument((current) => ({ ...current, cells: {} }))
    setNotice('El patrón quedó limpio.')
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
          onExport={() => exportPatternPng(document)}
          onClear={clearPattern}
        />

        <section className="canvas-area" aria-label="Área de trabajo">
          <div className="canvas-topbar">
            <div className="document-info">
              <span className="document-name">Patrón sin título</span>
              <span className="document-meta">{document.columns} × {document.rows}</span>
            </div>
            <button
              type="button"
              className="undo-button"
              onClick={handleUndo}
              disabled={!cellHistory.length}
              title="Deshacer último trazo (Ctrl+Z)"
            >
              <span aria-hidden="true">↶</span>
              Deshacer
              <kbd>Ctrl Z</kbd>
            </button>
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
              <span><kbd>Espacio</kbd> + arrastrar para mover</span>
              <span className="hint-divider" />
              <span>Rueda para zoom</span>
            </div>
          </div>
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
