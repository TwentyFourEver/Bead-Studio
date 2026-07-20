import { useRef, type ReactNode } from 'react'
import type { NumberingMode, ToolMode } from '../types'

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

type InterfaceIconName =
  | 'brush'
  | 'eraser'
  | 'select'
  | 'hand'
  | 'number'
  | 'save'
  | 'open'
  | 'export'
  | 'trash'

const TOOLS: Array<{
  id: Exclude<ToolMode, 'trace'>
  label: string
  shortcut: string
  icon: InterfaceIconName
}> = [
  { id: 'paint', label: 'Pincel', shortcut: 'B', icon: 'brush' },
  { id: 'erase', label: 'Borrador', shortcut: 'E', icon: 'eraser' },
  { id: 'select', label: 'Selección', shortcut: 'V', icon: 'select' },
  { id: 'pan', label: 'Mover lienzo', shortcut: 'H', icon: 'hand' },
  { id: 'number', label: 'Numerar pasos', shortcut: 'N', icon: 'number' },
]

const RAIL_TOOLS = TOOLS.filter((item) => item.id !== 'number')

interface ToolbarProps {
  tool: ToolMode
  onToolChange: (tool: ToolMode) => void
  color: string
  onColorChange: (color: string) => void
  onSaveProject: () => void
  onOpenProject: (file: File) => void
  onExport: () => void
  onClear: () => void
  guideStepCount: number
  numberingMode: NumberingMode
  onNumberingModeChange: (mode: NumberingMode) => void
  onGenerateGuide: () => void
  showGuideSteps: boolean
  onGuideVisibilityChange: (visible: boolean) => void
  onClearGuide: () => void
}

function InterfaceIcon({ name }: { name: InterfaceIconName }) {
  return (
    <svg className="interface-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'brush' && (
        <>
          <path d="m14.5 4.5 5 5-8.2 8.2" />
          <path d="M11.6 14.1c-1.4-1.4-3.8-1.2-4.8.6-.6 1.1-.8 2.3-2.8 3.3 2.8 1.5 5.7 1.6 7.5-.2 1-1 1.1-2.6.1-3.7Z" />
        </>
      )}
      {name === 'eraser' && (
        <>
          <path d="m13.5 4 6.5 6.5-8.7 8.7H7L3.5 15.7 13.5 4Z" />
          <path d="m9.2 9 6.5 6.5" />
          <path d="M11.3 19.2H21" />
        </>
      )}
      {name === 'select' && (
        <>
          <path d="M5 3.5 16.4 14l-5.1.5 2.7 5-2.3 1.2-2.6-5-3.6 3.7L5 3.5Z" />
        </>
      )}
      {name === 'hand' && (
        <>
          <path d="M8.4 11V6.5a1.4 1.4 0 0 1 2.8 0V10" />
          <path d="M11.2 10V5a1.4 1.4 0 0 1 2.8 0v5" />
          <path d="M14 10V6.2a1.4 1.4 0 0 1 2.8 0V11" />
          <path d="M16.8 10a1.4 1.4 0 0 1 2.8.2v3.5c0 4.3-2.7 7-6.8 7-2.1 0-3.6-.8-4.9-2.3l-3.2-3.8a1.5 1.5 0 0 1 2.2-2l1.5 1.3V11" />
        </>
      )}
      {name === 'number' && (
        <>
          <path d="M9 4 7 20M17 4l-2 16M4.5 9h15M3.5 15h15" />
        </>
      )}
      {name === 'save' && (
        <>
          <path d="M5 3.5h12l2 2v15H5v-17Z" />
          <path d="M8 3.5v6h8v-6M8 20.5v-7h8v7" />
        </>
      )}
      {name === 'open' && (
        <>
          <path d="M3.5 18.5V6.8h6l2-2h8v13.7h-16Z" />
          <path d="m8 13 4-4 4 4M12 9v8" />
        </>
      )}
      {name === 'export' && (
        <>
          <path d="M5 14v6h14v-6M12 3v12M7.5 10.5 12 15l4.5-4.5" />
        </>
      )}
      {name === 'trash' && (
        <>
          <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7" />
        </>
      )}
    </svg>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="panel-title">{children}</h2>
}

export function Toolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  onSaveProject,
  onOpenProject,
  onExport,
  onClear,
  guideStepCount,
  numberingMode,
  onNumberingModeChange,
  onGenerateGuide,
  showGuideSteps,
  onGuideVisibilityChange,
  onClearGuide,
}: ToolbarProps) {
  const projectInputRef = useRef<HTMLInputElement>(null)
  const activeTool = TOOLS.find((item) => item.id === tool)

  return (
    <>
      <aside className="tool-rail" aria-label="Barra de herramientas">
        <div className="tool-rail-buttons" role="toolbar" aria-orientation="vertical">
          {RAIL_TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-tool-button ${tool === item.id ? 'is-active' : ''}`}
              onClick={() => onToolChange(item.id)}
              aria-label={`${item.label} (${item.shortcut})`}
              aria-keyshortcuts={item.shortcut}
              aria-pressed={tool === item.id}
              title={`${item.label} (${item.shortcut})`}
            >
              <InterfaceIcon name={item.icon} />
              <span className="rail-tool-tooltip" aria-hidden="true">
                {item.label}
                <kbd>{item.shortcut}</kbd>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="rail-color-button"
          onClick={() => onToolChange('paint')}
          aria-label={`Color activo ${color}`}
          title={`Color activo: ${color.toUpperCase()}`}
        >
          <span className="rail-color-back" />
          <span className="rail-color-front" style={{ backgroundColor: color }} />
        </button>
      </aside>

      <aside className="tool-panel inspector-panel" aria-label="Propiedades de la herramienta">
        <div className="inspector-heading">
          <div>
            <span>Propiedades</span>
            <strong>{activeTool?.label ?? 'Referencia'}</strong>
          </div>
          {activeTool && <InterfaceIcon name={activeTool.icon} />}
        </div>

        <div className="tool-panel-scroll">
          <section className="panel-section first-section">
            <SectionTitle>Color activo</SectionTitle>
            <label className="color-input-row">
              <span className="active-color" style={{ backgroundColor: color }} />
              <span className="color-value">{color.toUpperCase()}</span>
              <span className="color-picker-label">Editar</span>
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
                >
                  {color === paletteColor && <span className="swatch-check" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </section>

          <section className={`panel-section guide-panel ${tool === 'number' ? 'is-expanded' : ''}`}>
            <div className="title-with-count">
              <SectionTitle>Recorrido numerado</SectionTitle>
              <span>{guideStepCount}</span>
            </div>
            {tool !== 'number' ? (
              <button type="button" className="secondary-button full-width" onClick={() => onToolChange('number')}>
                Configurar numeración
              </button>
            ) : (
              <div className="number-guide-help">
                <div className="numbering-mode-switch" role="group" aria-label="Modo de numeración">
                  <button
                    type="button"
                    className={numberingMode === 'manual' ? 'is-active' : ''}
                    onClick={() => onNumberingModeChange('manual')}
                    aria-pressed={numberingMode === 'manual'}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    className={numberingMode === 'automatic' ? 'is-active' : ''}
                    onClick={() => onNumberingModeChange('automatic')}
                    aria-pressed={numberingMode === 'automatic'}
                  >
                    Automática
                  </button>
                </div>
                {numberingMode === 'manual' ? (
                  <p>Haz clic entre las cuentas siguiendo el recorrido del hilo.</p>
                ) : (
                  <>
                    <p>Genera el recorrido por filas horizontales alternadas.</p>
                    <button type="button" className="generate-guide-button" onClick={onGenerateGuide}>
                      {guideStepCount ? 'Volver a generar' : 'Generar recorrido'}
                    </button>
                  </>
                )}
                {guideStepCount > 0 && (
                  <div className="number-guide-actions">
                    <button
                      type="button"
                      onClick={() => onGuideVisibilityChange(!showGuideSteps)}
                      aria-pressed={!showGuideSteps}
                    >
                      {showGuideSteps ? 'Ocultar números' : 'Mostrar números'}
                    </button>
                    <button type="button" onClick={onClearGuide}>
                      Borrar recorrido
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="panel-actions">
          <span className="panel-actions-label">Documento</span>
          <div className="project-action-grid">
            <button type="button" className="secondary-button project-button" onClick={onSaveProject}>
              <InterfaceIcon name="save" />
              Guardar
            </button>
            <button
              type="button"
              className="secondary-button project-button project-open-button"
              onClick={() => projectInputRef.current?.click()}
            >
              <InterfaceIcon name="open" />
              Abrir
            </button>
            <input
              ref={projectInputRef}
              className="project-file-input"
              type="file"
              accept=".beadstudio,application/json"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onOpenProject(file)
                event.currentTarget.value = ''
              }}
            />
          </div>
          <button type="button" className="primary-button" onClick={onExport}>
            <InterfaceIcon name="export" />
            Exportar PNG
          </button>
          <button type="button" className="clear-button" onClick={onClear}>
            <InterfaceIcon name="trash" />
            Limpiar diseño
          </button>
        </div>
      </aside>
    </>
  )
}
