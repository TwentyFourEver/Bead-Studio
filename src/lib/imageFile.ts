export const MAX_ANALYSIS_FILE_BYTES = 20 * 1024 * 1024
export const MAX_ANALYSIS_SIDE = 2048

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const SUPPORTED_IMAGE_EXTENSION = /\.(?:png|jpe?g|webp)$/i
const SUPPORTED_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,/i

export interface PreparedImageFile {
  source: string
  name: string
  naturalWidth: number
  naturalHeight: number
  image: {
    width: number
    height: number
    data: Uint8ClampedArray
  }
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No fue posible leer la imagen seleccionada.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !SUPPORTED_DATA_URL.test(reader.result)) {
        reject(new Error('El archivo no es una imagen PNG, JPEG o WebP válida.'))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onerror = () => reject(new Error('El navegador no pudo decodificar esta imagen.'))
    image.onload = () => resolve(image)
    image.src = source
  })
}

export async function prepareImageFile(file: File): Promise<PreparedImageFile> {
  if (
    (file.type && !SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) ||
    (!file.type && !SUPPORTED_IMAGE_EXTENSION.test(file.name))
  ) {
    throw new Error('Selecciona una imagen PNG, JPEG o WebP.')
  }
  if (file.size > MAX_ANALYSIS_FILE_BYTES) {
    throw new Error('La imagen debe pesar menos de 20 MB.')
  }

  const source = await readAsDataUrl(file)
  const decoded = await loadImage(source)
  const naturalWidth = decoded.naturalWidth
  const naturalHeight = decoded.naturalHeight
  if (!naturalWidth || !naturalHeight) {
    throw new Error('La imagen no tiene dimensiones válidas.')
  }

  const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))
  const canvas = window.document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('El navegador no pudo preparar el análisis de la imagen.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, width, height)
  context.drawImage(decoded, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height)

  return {
    source,
    name: file.name,
    naturalWidth,
    naturalHeight,
    image: { width, height, data: new Uint8ClampedArray(pixels.data) },
  }
}
