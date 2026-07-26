import { useEffect, useRef, useState } from 'react'
import { InterfaceIcon } from './Toolbar'
import type {
  BackgroundMode,
  MirrorMode,
  ReferenceMode,
  ToolMode,
  TraceImage,
} from '../types'

export type ExportFormat = 'png' | 'gif'

const MIRROR_OPTIONS: Array<{
  value: MirrorMode
  label: string
  icon: string
}> = [
  { value: 'none', label: 'Ninguna', icon: '○' },
  { value: 'vertical', label: 'Lados', icon: '↔' },
  { value: 'horizontal', label: 'Arriba y abajo', icon: '↕' },
  { value: 'both', label: 'Ambos ejes', icon: '✣' },
]

interface HeaderControlsProps {
  mirrorMode: MirrorMode
  onMirrorModeChange: (mode: MirrorMode) => void
  rows: number
  columns: number
  onRowsChange: (value: number) => void
  onColumnsChange: (value: number) => void
  onApplyDimensions: () => void
  backgroundMode: BackgroundMode
  backgroundColor: string
  onBackgroundModeChange: (mode: BackgroundMode) => void
  onBackgroundColorChange: (color: string) => void
  tool: ToolMode
  onToolChange: (tool: ToolMode) => void
  traceImage: TraceImage | null
  referenceMode: ReferenceMode
  onReferenceModeChange: (mode: ReferenceMode) => void
  onTraceUpload: (file: File) => void
  onTraceChange: (patch: Partial<TraceImage>) => void
  onTraceRemove: () => void
  onExport: (format: ExportFormat) => void
  isExporting: boolean
  onClearDesign: () => void
}

interface EditableNumberInputProps {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  title?: string
}

function EditableNumberInput({
  value,
  onValueChange,
  min,
  max,
  title,
}: EditableNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft ?? value}
      title={title}
      onFocus={() => setDraft(String(value))}
      onChange={(event) => {
        setDraft(event.target.value)
        if (Number.isFinite(event.target.valueAsNumber)) {
          onValueChange(event.target.valueAsNumber)
        }
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

export function HeaderControls({
  mirrorMode,
  onMirrorModeChange,
  rows,
  columns,
  onRowsChange,
  onColumnsChange,
  onApplyDimensions,
  backgroundMode,
  backgroundColor,
  onBackgroundModeChange,
  onBackgroundColorChange,
  tool,
  onToolChange,
  traceImage,
  referenceMode,
  onReferenceModeChange,
  onTraceUpload,
  onTraceChange,
  onTraceRemove,
  onExport,
  isExporting,
  onClearDesign,
}: HeaderControlsProps) {
  const [mirrorOpen, setMirrorOpen] = useState(false)
  const [traceOpen, setTraceOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const mirrorMenuRef = useRef<HTMLDivElement>(null)
  const traceMenuRef = useRef<HTMLDivElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const selectedMirrorOption =
    MIRROR_OPTIONS.find((option) => option.value === mirrorMode) ?? MIRROR_OPTIONS[0]

  useEffect(() => {
    if (!mirrorOpen && !traceOpen && !exportOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (mirrorOpen && !mirrorMenuRef.current?.contains(target)) setMirrorOpen(false)
      if (traceOpen && !traceMenuRef.current?.contains(target)) setTraceOpen(false)
      if (exportOpen && !exportMenuRef.current?.contains(target)) setExportOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMirrorOpen(false)
      setTraceOpen(false)
      setExportOpen(false)
    }

    window.document.addEventListener('pointerdown', closeOnOutsideClick)
    window.document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.document.removeEventListener('keydown', closeOnEscape)
    }
  }, [exportOpen, mirrorOpen, traceOpen])

  return (
    <div className="header-controls">
      <section className="header-control-group">
        <span className="header-control-label">Simetría</span>
        <div className="header-symmetry-wrap" ref={mirrorMenuRef}>
          <button
            type="button"
            className={`header-dropdown-trigger header-symmetry-trigger ${mirrorOpen ? 'is-open' : ''}`}
            onClick={() => {
              setMirrorOpen((current) => !current)
              setTraceOpen(false)
              setExportOpen(false)
            }}
            aria-expanded={mirrorOpen}
            aria-haspopup="menu"
            aria-controls="header-symmetry-menu"
          >
            <span className="header-dropdown-leading" aria-hidden="true">
              {selectedMirrorOption.icon}
            </span>
            <span>{selectedMirrorOption.label}</span>
            <InterfaceIcon
              name="chevron-down"
              className={`menu-chevron ${mirrorOpen ? 'is-open' : ''}`}
            />
          </button>
          {mirrorOpen && (
            <div
              id="header-symmetry-menu"
              className="header-dropdown-panel header-compact-menu header-symmetry-menu"
              role="menu"
            >
              {MIRROR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mirrorMode === option.value}
                  className={mirrorMode === option.value ? 'is-selected' : ''}
                  onClick={() => {
                    onMirrorModeChange(option.value)
                    setMirrorOpen(false)
                  }}
                >
                  <span className="header-dropdown-option-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="header-control-group header-trace-group" ref={traceMenuRef}>
        <span className="header-control-label">Referencia</span>
        {!traceImage ? (
          <label className="header-trace-upload">
            <span aria-hidden="true">＋</span>
            Agregar imagen
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onTraceUpload(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
        ) : (
          <div className="header-trace-wrap">
            <button
              type="button"
              className={`header-dropdown-trigger header-trace-trigger ${traceOpen ? 'is-open' : ''} ${referenceMode === 'trace' && tool === 'trace' ? 'is-moving' : ''}`}
              onClick={() => {
                setTraceOpen((current) => !current)
                setMirrorOpen(false)
                setExportOpen(false)
              }}
              aria-expanded={traceOpen}
              aria-haspopup="dialog"
              aria-controls="header-reference-menu"
            >
              <span aria-hidden="true">▧</span>
              <span>
                {referenceMode === 'trace' && tool === 'trace' ? 'Moviendo calcado' : 'Referencia'}
              </span>
              <small>
                {!traceImage.visible
                  ? 'Oculta'
                  : referenceMode === 'floating'
                    ? 'Flotante'
                    : 'Calcado'}
              </small>
              <InterfaceIcon
                name="chevron-down"
                className={`menu-chevron header-trigger-chevron ${traceOpen ? 'is-open' : ''}`}
              />
            </button>

            {traceOpen && (
              <div
                id="header-reference-menu"
                className="header-dropdown-panel header-trace-popover"
              >
                <div className="trace-popover-heading">
                  <div className="trace-file-name" title={traceImage.name}>
                    <span aria-hidden="true">▧</span>
                    <span>{traceImage.name}</span>
                  </div>
                  <button
                    type="button"
                    className="trace-visibility"
                    onClick={() => onTraceChange({ visible: !traceImage.visible })}
                    aria-label={traceImage.visible ? 'Ocultar referencia' : 'Mostrar referencia'}
                    title={traceImage.visible ? 'Ocultar' : 'Mostrar'}
                  >
                    {traceImage.visible ? '◉' : '○'}
                  </button>
                </div>

                <div className="reference-mode-grid" role="group" aria-label="Modo de referencia">
                  <button
                    type="button"
                    className={referenceMode === 'floating' ? 'is-active' : ''}
                    onClick={() => {
                      onReferenceModeChange('floating')
                      if (tool === 'trace') onToolChange('paint')
                    }}
                  >
                    <span aria-hidden="true">▣</span>
                    <strong>Flotante</strong>
                    <small>A un lado del lienzo</small>
                  </button>
                  <button
                    type="button"
                    className={referenceMode === 'trace' ? 'is-active' : ''}
                    onClick={() => onReferenceModeChange('trace')}
                  >
                    <span aria-hidden="true">▧</span>
                    <strong>Calcado</strong>
                    <small>Sobre las cuentas</small>
                  </button>
                </div>

                {referenceMode === 'trace' ? (
                  <>
                    <button
                      type="button"
                      className={`trace-move-button ${tool === 'trace' ? 'is-active' : ''}`}
                      onClick={() => {
                        const nextTool = tool === 'trace' ? 'paint' : 'trace'
                        onToolChange(nextTool)
                        if (nextTool === 'trace') setTraceOpen(false)
                      }}
                    >
                      <span aria-hidden="true">✥</span>
                      {tool === 'trace' ? 'Terminar de mover' : 'Mover sobre el lienzo'}
                      <kbd>V</kbd>
                    </button>

                    <label className="trace-slider">
                      <span>Opacidad</span>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={Math.round(traceImage.opacity * 100)}
                        onChange={(event) =>
                          onTraceChange({ opacity: Number(event.target.value) / 100 })
                        }
                      />
                      <output>{Math.round(traceImage.opacity * 100)}%</output>
                    </label>

                    <label className="trace-slider">
                      <span>Tamaño</span>
                      <input
                        type="range"
                        min="10"
                        max="300"
                        value={traceImage.scalePercent}
                        onChange={(event) =>
                          onTraceChange({ scalePercent: Number(event.target.value) })
                        }
                      />
                      <output>{Math.round(traceImage.scalePercent)}%</output>
                    </label>

                    <div className="trace-position-grid">
                      <label>
                        <span>Posición X</span>
                        <EditableNumberInput
                          value={Math.round(traceImage.x)}
                          onValueChange={(x) => onTraceChange({ x })}
                        />
                      </label>
                      <label>
                        <span>Posición Y</span>
                        <EditableNumberInput
                          value={Math.round(traceImage.y)}
                          onValueChange={(y) => onTraceChange({ y })}
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <p className="reference-floating-note">
                    La imagen aparece en una ventana movible. Arrastra su encabezado y cambia el tamaño
                    desde la esquina inferior derecha.
                  </p>
                )}

                <div className="trace-actions">
                  <label className="secondary-button trace-replace-button">
                    Cambiar imagen
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) onTraceUpload(file)
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="trace-remove-button"
                    onClick={() => {
                      onTraceRemove()
                      setTraceOpen(false)
                    }}
                  >
                    Quitar
                  </button>
                </div>
                <p className="helper-text trace-help">La referencia no aparecerá en el PNG exportado.</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="header-control-group">
        <span className="header-control-label">Dimensiones</span>
        <div className="header-dimensions">
          <label>
            <span className="sr-only">Columnas</span>
            <EditableNumberInput
              min={2}
              max={199}
              value={columns}
              title="Columnas"
              onValueChange={onColumnsChange}
            />
          </label>
          <span aria-hidden="true">×</span>
          <label>
            <span className="sr-only">Filas</span>
            <EditableNumberInput
              min={2}
              max={199}
              value={rows}
              title="Filas"
              onValueChange={onRowsChange}
            />
          </label>
          <button type="button" onClick={onApplyDimensions}>Aplicar</button>
        </div>
      </section>

      <section className="header-control-group">
        <span className="header-control-label">Fondo</span>
        <div className="header-background">
          <button
            type="button"
            className={backgroundMode === 'transparent' ? 'is-active' : ''}
            onClick={() => onBackgroundModeChange('transparent')}
          >
            <span className="transparency-chip" />
            Transparente
          </button>
          <button
            type="button"
            className={backgroundMode === 'solid' ? 'is-active' : ''}
            onClick={() => onBackgroundModeChange('solid')}
          >
            <span className="solid-chip" style={{ backgroundColor }} />
            Color
          </button>
          <input
            type="color"
            value={backgroundColor}
            disabled={backgroundMode === 'transparent'}
            onChange={(event) => onBackgroundColorChange(event.target.value)}
            aria-label="Color de fondo"
          />
        </div>
      </section>

      <section
        className="header-control-group header-document-actions"
        aria-label="Exportación y limpieza del diseño"
      >
        <span className="header-control-label">Acciones</span>
        <div className="header-document-action-row">
          <div className="header-export-wrap" ref={exportMenuRef}>
            <button
              type="button"
              className={`header-dropdown-trigger header-export-trigger ${exportOpen ? 'is-open' : ''}`}
              disabled={isExporting}
              aria-busy={isExporting}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              aria-controls="header-export-menu"
              onClick={() => {
                setExportOpen((current) => !current)
                setMirrorOpen(false)
                setTraceOpen(false)
              }}
              title="Exportar patrón"
            >
              <InterfaceIcon name="export" />
              <span className="header-export-label">
                {isExporting ? 'Creando GIF…' : 'Exportar'}
              </span>
              <InterfaceIcon
                name="chevron-down"
                className={`menu-chevron ${exportOpen ? 'is-open' : ''}`}
              />
            </button>
            {exportOpen && !isExporting && (
              <div
                id="header-export-menu"
                className="header-dropdown-panel header-compact-menu header-export-menu"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false)
                    onExport('png')
                  }}
                >
                  <strong>Imagen PNG</strong>
                  <small>Imagen estática</small>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false)
                    onExport('gif')
                  }}
                >
                  <strong>GIF animado</strong>
                  <small>Muestra el recorrido</small>
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="topbar-action is-danger"
            onClick={onClearDesign}
            title="Limpiar diseño"
          >
            <InterfaceIcon name="trash" />
            <span>Limpiar diseño</span>
          </button>
        </div>
      </section>
    </div>
  )
}
