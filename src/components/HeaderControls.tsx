import { useEffect, useRef, useState } from 'react'
import { InterfaceIcon } from './Toolbar'
import type { BackgroundMode } from '../types'

export type ExportFormat = 'png' | 'gif'

interface HeaderControlsProps {
  rows: number
  columns: number
  onRowsChange: (value: number) => void
  onColumnsChange: (value: number) => void
  onApplyDimensions: () => void
  backgroundMode: BackgroundMode
  backgroundColor: string
  onBackgroundModeChange: (mode: BackgroundMode) => void
  onBackgroundColorChange: (color: string) => void
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
  rows,
  columns,
  onRowsChange,
  onColumnsChange,
  onApplyDimensions,
  backgroundMode,
  backgroundColor,
  onBackgroundModeChange,
  onBackgroundColorChange,
  onExport,
  isExporting,
  onClearDesign,
}: HeaderControlsProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (exportOpen && !exportMenuRef.current?.contains(target)) setExportOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setExportOpen(false)
    }

    window.document.addEventListener('pointerdown', closeOnOutsideClick)
    window.document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.document.removeEventListener('keydown', closeOnEscape)
    }
  }, [exportOpen])

  return (
    <div className="header-controls">
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
              onClick={() => setExportOpen((current) => !current)}
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
