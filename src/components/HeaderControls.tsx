import { useState } from 'react'
import type {
  BackgroundMode,
  MirrorMode,
  ReferenceMode,
  ToolMode,
  TraceImage,
} from '../types'

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
}: HeaderControlsProps) {
  const [traceOpen, setTraceOpen] = useState(false)

  return (
    <div className="header-controls">
      <section className="header-control-group">
        <span className="header-control-label">Simetría</span>
        <div className="header-select-wrap">
          <span aria-hidden="true">
            {mirrorMode === 'vertical'
              ? '↔'
              : mirrorMode === 'horizontal'
                ? '↕'
                : mirrorMode === 'both'
                  ? '✣'
                  : '○'}
          </span>
          <select
            value={mirrorMode}
            onChange={(event) => onMirrorModeChange(event.target.value as MirrorMode)}
            aria-label="Modo de simetría"
          >
            <option value="none">Ninguna</option>
            <option value="vertical">Lados</option>
            <option value="horizontal">Arriba y abajo</option>
            <option value="both">Ambos ejes</option>
          </select>
          <span className="select-chevron" aria-hidden="true">⌄</span>
        </div>
      </section>

      <section className="header-control-group header-trace-group">
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
              className={`header-trace-trigger ${traceOpen ? 'is-open' : ''} ${referenceMode === 'trace' && tool === 'trace' ? 'is-moving' : ''}`}
              onClick={() => setTraceOpen((current) => !current)}
              aria-expanded={traceOpen}
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
              <span aria-hidden="true">⌄</span>
            </button>

            {traceOpen && (
              <div className="header-trace-popover">
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
        <span className="header-control-label">Fondo de exportación</span>
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
    </div>
  )
}
