import { useEffect, useRef, useState } from 'react'
import type { DragEvent, SyntheticEvent } from 'react'

interface ImageImportSourceDialogProps {
  open: boolean
  onCancel: () => void
  onChooseFile: () => void
  onFileSelected: (file: File) => void
}

function findImageFile(files: FileList | null) {
  return Array.from(files ?? []).find((file) => file.type.startsWith('image/')) ?? null
}

export function ImageImportSourceDialog({
  open,
  onCancel,
  onChooseFile,
  onFileSelected,
}: ImageImportSourceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleDialogCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    setIsDragging(false)
    onCancel()
  }

  const handleClose = () => {
    setIsDragging(false)
    onCancel()
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = findImageFile(event.dataTransfer.files)
    if (file) onFileSelected(file)
  }

  return (
    <dialog
      ref={dialogRef}
      className="image-source-dialog"
      aria-labelledby="image-source-title"
      aria-describedby="image-source-description"
      onCancel={handleDialogCancel}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose()
      }}
    >
      <section className="image-source-shell">
        <header className="image-import-header image-source-header">
          <div className="image-import-header-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 5.5h16v13H4zM7.5 15l3-3 2.2 2.2 1.8-1.8 2.5 2.6" />
              <circle cx="15.8" cy="9" r="1.4" />
            </svg>
          </div>
          <div className="image-import-header-copy">
            <span>Convertir imagen</span>
            <h2 id="image-source-title">Seleccionar imagen</h2>
            <p id="image-source-description">Añade un diseño para convertirlo en un patrón de cuentas.</p>
          </div>
          <button
            type="button"
            className="image-import-close-button"
            onClick={handleClose}
            aria-label="Cerrar selector de imagen"
          >
            ×
          </button>
        </header>

        <div className="image-source-content">
          <button
            type="button"
            className={`image-source-dropzone${isDragging ? ' image-source-is-dragging' : ''}`}
            onClick={onChooseFile}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setIsDragging(false)
            }}
            onDrop={handleDrop}
          >
            <span className="image-source-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 5.5h16v13H4zM7.5 15l3-3 2.2 2.2 1.8-1.8 2.5 2.6" />
                <circle cx="15.8" cy="9" r="1.4" />
              </svg>
            </span>
            <strong>Arrastra una imagen aquí</strong>
            <span>o selecciónala desde tus archivos</span>
            <em>Seleccionar archivo</em>
          </button>

          <p className="image-source-paste-hint">
            También puedes pegar una imagen copiada con <kbd>Ctrl</kbd> + <kbd>V</kbd>.
          </p>
        </div>

        <footer className="image-import-footer image-source-footer">
          <p>Formatos compatibles: PNG, JPEG y WebP · máximo 20 MB</p>
          <div className="image-import-footer-actions">
            <button type="button" className="image-import-secondary-button" onClick={handleClose}>
              Cancelar
            </button>
          </div>
        </footer>
      </section>
    </dialog>
  )
}
