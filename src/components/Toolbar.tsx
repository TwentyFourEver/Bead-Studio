import type { ToolMode } from '../types'
import type { ReactNode } from 'react'

const PALETTE = [
  '#111827',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f8fafc',
]

interface ToolbarProps {
  tool: ToolMode
  onToolChange: (tool: ToolMode) => void
  color: string
  onColorChange: (color: string) => void
  onExport: () => void
  onClear: () => void
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="panel-title">{children}</h2>
}

export function Toolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  onExport,
  onClear,
}: ToolbarProps) {
  return (
    <aside className="tool-panel">
      <div className="tool-panel-scroll">
        <section className="panel-section first-section">
          <SectionTitle>Herramienta</SectionTitle>
          <div className="segmented-grid">
            <button
              type="button"
              className={`tool-button ${tool === 'paint' ? 'is-active' : ''}`}
              onClick={() => onToolChange('paint')}
              aria-pressed={tool === 'paint'}
            >
              <span className="tool-icon" aria-hidden="true">✦</span>
              <span>Pincel</span>
              <kbd>B</kbd>
            </button>
            <button
              type="button"
              className={`tool-button ${tool === 'erase' ? 'is-active' : ''}`}
              onClick={() => onToolChange('erase')}
              aria-pressed={tool === 'erase'}
            >
              <span className="tool-icon eraser-icon" aria-hidden="true">◇</span>
              <span>Borrar</span>
              <kbd>E</kbd>
            </button>
            <button
              type="button"
              className={`tool-button select-tool-button ${tool === 'select' ? 'is-active' : ''}`}
              onClick={() => onToolChange('select')}
              aria-pressed={tool === 'select'}
            >
              <span className="tool-icon select-icon" aria-hidden="true">↖</span>
              <span>Seleccionar</span>
              <kbd>V</kbd>
            </button>
          </div>
        </section>

        <section className="panel-section">
          <SectionTitle>Color activo</SectionTitle>
          <label className="color-input-row">
            <span className="active-color" style={{ backgroundColor: color }} />
            <span className="color-value">{color.toUpperCase()}</span>
            <input
              type="color"
              value={color}
              onChange={(event) => onColorChange(event.target.value)}
              aria-label="Elegir color"
            />
          </label>
          <div className="palette" aria-label="Paleta de colores">
            {PALETTE.map((paletteColor) => (
              <button
                type="button"
                key={paletteColor}
                className={`swatch ${color === paletteColor ? 'is-selected' : ''}`}
                style={{ backgroundColor: paletteColor }}
                onClick={() => onColorChange(paletteColor)}
                aria-label={`Usar color ${paletteColor}`}
                aria-pressed={color === paletteColor}
              />
            ))}
          </div>
        </section>

      </div>

      <div className="panel-actions">
        <button type="button" className="primary-button" onClick={onExport}>
          <span aria-hidden="true">⇩</span>
          Exportar PNG
        </button>
        <button type="button" className="clear-button" onClick={onClear}>
          Limpiar diseño
        </button>
      </div>
    </aside>
  )
}
