import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { TraceImage } from '../types'

interface FloatingReferenceProps {
  image: TraceImage
  onHide: () => void
  onUseAsTrace: () => void
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  startLeft: number
  startTop: number
}

export function FloatingReference({ image, onHide, onUseAsTrace }: FloatingReferenceProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
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

  return (
    <div
      ref={panelRef}
      className={`floating-reference ${dragging ? 'is-dragging' : ''}`}
      style={position ? { left: position.left, top: position.top, right: 'auto' } : undefined}
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
        <button type="button" onClick={onUseAsTrace} title="Usar como calcado">
          Calcado
        </button>
        <button type="button" onClick={onHide} aria-label="Ocultar referencia" title="Ocultar">
          ×
        </button>
      </div>
      <div className="floating-reference-body">
        <img src={image.src} alt={`Referencia: ${image.name}`} draggable="false" />
      </div>
      <div className="floating-reference-resize-hint" aria-hidden="true" />
    </div>
  )
}
