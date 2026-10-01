import { getTraceImageSize, type ReferenceMode, type ToolMode, type TraceImage } from '../types'

export interface ReferenceControlsProps {
  traceImage: TraceImage | null
  referenceMode: ReferenceMode
  tool: ToolMode
  onToolChange: (tool: ToolMode) => void
  onReferenceModeChange: (mode: ReferenceMode) => void
  onTraceUpload: (file: File) => void
  onTraceChange: (patch: Partial<TraceImage>) => void
  onTraceRemove: () => void
}

export function ReferenceControls({ traceImage: image, referenceMode, tool, onToolChange,
  onReferenceModeChange, onTraceUpload, onTraceChange, onTraceRemove }: ReferenceControlsProps) {
  return (
    <div className="reference-controls">
      {image && <>
        <div className="reference-file-row">
          <span title={image.name}>{image.name}</span>
          <button type="button" className="secondary-button" onClick={() => onTraceChange({ visible: !image.visible })}>
            {image.visible ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        <div className="reference-mode-grid" role="group" aria-label="Modo de referencia">
          <button type="button" className={referenceMode === 'floating' ? 'is-active' : ''}
            aria-pressed={referenceMode === 'floating'} onClick={() => onReferenceModeChange('floating')}>
            <strong>Flotante</strong><small>A un lado del lienzo</small>
          </button>
          <button type="button" className={referenceMode === 'trace' ? 'is-active' : ''}
            aria-pressed={referenceMode === 'trace'} onClick={() => onReferenceModeChange('trace')}>
            <strong>Calcado</strong><small>Sobre las cuentas</small>
          </button>
        </div>
        {referenceMode === 'trace' ? <>
          <button type="button" className={`trace-move-button ${tool === 'trace' ? 'is-active' : ''}`}
            aria-pressed={tool === 'trace'} onClick={() => {
              onTraceChange({ visible: true })
              onToolChange(tool === 'trace' ? 'paint' : 'trace')
            }}>
            {tool === 'trace' ? 'Terminar de mover' : 'Mover sobre el lienzo'} <kbd>T</kbd>
          </button>
          <label className="trace-slider"><span>Opacidad</span>
            <input type="range" min="10" max="100" value={Math.round(image.opacity * 100)}
              onChange={(event) => onTraceChange({ opacity: Number(event.target.value) / 100 })} />
            <output>{Math.round(image.opacity * 100)}%</output>
          </label>
          <label className="trace-slider"><span>Tamaño</span>
            <input type="range" min="10" max="300" value={image.scalePercent}
              onChange={(event) => onTraceChange({ scalePercent: Number(event.target.value) })} />
            <output>{Math.round(image.scalePercent)}%</output>
          </label>
          <label className="suggestion-toggle">
            <input type="checkbox" checked={image.keepProportions ?? true}
              onChange={(event) => onTraceChange({ keepProportions: event.target.checked })} />
            Mantener proporciones
          </label>
          <p className="helper-text">Arrastra una esquina de la imagen en el lienzo para cambiar su tamaño.
            Desactiva Mantener proporciones para ajustar ancho y alto por separado.</p>
          <output className="trace-size-output" aria-label="Dimensiones del calcado">
            {Math.round(getTraceImageSize(image).width)} × {Math.round(getTraceImageSize(image).height)}
          </output>
          <div className="trace-position-grid">
            {(['x', 'y'] as const).map((axis) => <label key={axis}>
              <span>Posición {axis.toUpperCase()}</span>
              <input type="number" value={Math.round(image[axis])} onChange={(event) => {
                if (Number.isFinite(event.target.valueAsNumber)) onTraceChange({ [axis]: event.target.valueAsNumber })
              }} />
            </label>)}
          </div>
        </> : <p className="helper-text">Arrastra el encabezado de la imagen para moverla. Cambia su tamaño desde la esquina inferior derecha.</p>}
      </>}
      <div className="trace-actions">
        <label className="secondary-button trace-replace-button">
          {image ? 'Cambiar imagen' : 'Agregar referencia'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onTraceUpload(file)
            event.currentTarget.value = ''
          }} />
        </label>
        {image && <button type="button" className="trace-remove-button" onClick={onTraceRemove}>Quitar</button>}
      </div>
      <p className="helper-text">La referencia no aparece en la exportación.</p>
    </div>
  )
}
