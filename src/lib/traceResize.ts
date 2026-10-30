import { getTraceImageSize, type TraceImage } from '../types'

export type TraceCorner = 'nw' | 'ne' | 'sw' | 'se'
export type TraceResizeHandle = TraceCorner | 'n' | 'e' | 's' | 'w'
const MIN_SIZE = 8
const MAX_SIZE = 20000

export function resizeTraceFromHandle(
  image: TraceImage, handle: TraceResizeHandle, deltaX: number, deltaY: number,
  keepProportions = image.keepProportions ?? true,
): TraceImage {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (deltaX === 0 && deltaY === 0)) return image
  const size = getTraceImageSize(image)
  const fromLeft = handle.includes('w')
  const fromTop = handle.includes('n')
  const horizontal = fromLeft || handle.includes('e')
  const vertical = fromTop || handle.includes('s')
  const rawWidth = size.width + (horizontal ? (fromLeft ? -deltaX : deltaX) : 0)
  const rawHeight = size.height + (vertical ? (fromTop ? -deltaY : deltaY) : 0)
  let width: number
  let height: number
  if (keepProportions && handle.length === 2) {
    const widthScale = rawWidth / size.width
    const heightScale = rawHeight / size.height
    const desired = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale
    const factor = Math.max(Math.min(1, Math.max(MIN_SIZE / size.width, MIN_SIZE / size.height)),
      Math.min(Math.max(1, Math.min(MAX_SIZE / size.width, MAX_SIZE / size.height)), desired))
    width = size.width * factor
    height = size.height * factor
  } else {
    width = Math.max(MIN_SIZE, Math.min(MAX_SIZE, rawWidth))
    height = Math.max(MIN_SIZE, Math.min(MAX_SIZE, rawHeight))
  }
  const scale = image.baseScale * image.scalePercent / 100
  return {
    ...image,
    x: fromLeft ? image.x + size.width - width : image.x,
    y: fromTop ? image.y + size.height - height : image.y,
    widthFactor: width / (image.naturalWidth * scale),
    heightFactor: height / (image.naturalHeight * scale),
  }
}
