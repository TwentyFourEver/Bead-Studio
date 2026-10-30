import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { TraceImage } from '../types'

interface FloatingReferenceProps {
  image: TraceImage
  onHide: () => void
  onUseAsTrace: () => void
  onToggleStretch: () => void
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  startLeft: number
  startTop: number
}

export function FloatingReference({ image, onHide, onUseAsTrace, onToggleStretch }: FloatingReferenceProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<{
    pointerId: number; startX: number; startY: number; width: number; height: number
  } | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const panel = panelRef.current
    const parent = panel?.offsetParent as HTMLElement | null
    if (!panel || !parent) return
    const panelRect = panel.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()
    const left = panelRect.left - parentRect.left
    const top = panelRect.top - parentRect.top
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: left,
      startTop: top,
    }
    setPosition({ left, top })
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const panel = panelRef.current
    const parent = panel?.offsetParent as HTMLElement | null
    if (!drag || !panel || !parent || drag.pointerId !== event.pointerId) return
    const nextLeft = drag.startLeft + event.clientX - drag.startX
    const nextTop = drag.startTop + event.clientY - drag.startY
    setPosition({
      left: Math.max(0, Math.min(nextLeft, parent.clientWidth - 80)),
      top: Math.max(0, Math.min(nextTop, parent.clientHeight - 46)),
    })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const resizePanel = (width: number, height: number) => {
    const panel = panelRef.current
    const parent = panel?.offsetParent as HTMLElement | null
    if (!panel || !parent) return
    const rect = panel.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()
    const styles = getComputedStyle(panel)
    const minWidth = Number.parseFloat(styles.minWidth)
    const minHeight = Number.parseFloat(styles.minHeight)
    if (!position) setPosition({ left: rect.left - parentRect.left, top: rect.top - parentRect.top })
    setSize({
      width: Math.max(minWidth, Math.min(width, parent.clientWidth - (rect.left - parentRect.left) - 8)),
      height: Math.max(minHeight, Math.min(height, parent.clientHeight - (rect.top - parentRect.top) - 8)),
    })
  }

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current
    if (!panel || event.button !== 0) return
    event.preventDefault()
    const rect = panel.getBoundingClientRect()
    resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      width: rect.width, height: rect.height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = resizeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    resizePanel(drag.width + event.clientX - drag.startX, drag.height + event.clientY - drag.startY)
  }

  const endResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      ref={panelRef}
      className={`floating-reference ${dragging ? 'is-dragging' : ''}`}
      style={{ ...(position ? { left: position.left, top: position.top, right: 'auto' } : {}), ...size }}
    >
      <div
        className="floating-reference-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="floating-drag-handle" aria-hidden="true">⠿</span>
        <span className="floating-reference-name" title={image.name}>{image.name}</span>
        <button type="button" onClick={onToggleStretch} aria-pressed={!(image.keepProportions ?? true)}
          className={image.keepProportions === false ? 'is-active' : ''}
          title="Estirar la imagen al cambiar el ancho o alto de esta ventana">
          Estirar
        </button>
        <button type="button" onClick={onUseAsTrace} title="Usar como calcado">
          Calcado
        </button>
        <button type="button" onClick={onHide} aria-label="Ocultar referencia" title="Ocultar">
          ×
        </button>
      </div>
      <div className="floating-reference-body">
        <img src={image.src} alt={`Referencia: ${image.name}`} draggable="false"
          style={{ objectFit: image.keepProportions === false ? 'fill' : 'contain' }} />
      </div>
      <button type="button" className="floating-reference-resize-hint"
        aria-label="Cambiar tamaño de la referencia flotante"
        title="Arrastra para ajustar ancho y alto"
        onPointerDown={startResize} onPointerMove={moveResize}
        onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={endResize}
        onKeyDown={(event) => {
          const panel = panelRef.current
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10],
          }
          const delta = directions[event.key]
          if (!panel || !delta) return
          event.preventDefault()
          const rect = panel.getBoundingClientRect()
          resizePanel(rect.width + delta[0], rect.height + delta[1])
        }} />
    </div>
  )
}
