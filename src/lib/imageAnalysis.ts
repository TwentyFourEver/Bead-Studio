import { IMPORT_VISIBLE_MARGIN } from './geometry'

export { IMPORT_VISIBLE_MARGIN } from './geometry'

export interface RGB {
  r: number
  g: number
  b: number
}

export interface PixelImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface ImageAnalysisOptions {
  backgroundMode: 'auto' | 'manual'
  backgroundColor: RGB | null
  /** CIE76 (Delta E) distance from the background, in the range 0-100. */
  backgroundTolerance: number
  /** CIE76 (Delta E) used to merge bead colours, in the range 0-24. */
  colorMergeDeltaE: number
  maxRotationDegrees: number
}

export interface PaletteColor {
  color: string
  rgb: RGB
  count: number
}

export interface DetectedBead {
  id: string
  sourceX: number
  sourceY: number
  radiusX: number
  radiusY: number
  angleDegrees: number
  row: number
  column: number
  color: string
  rgb: RGB
  area: number
  confidence: number
}

export interface GridTransform {
  /** Source-image position of normalized grid cell (0, 0). */
  originX: number
  originY: number
  /** Source pixels per one PatternDocument grid index. */
  stepX: number
  stepY: number
  rotationDegrees: number
  /** normalized coordinate = raw fitted coordinate + offset */
  rowOffset: number
  columnOffset: number
  sourceWidth: number
  sourceHeight: number
}

export interface PatternAnalysisResult {
  imageWidth: number
  imageHeight: number
  rows: number
  columns: number
  cells: Record<string, string>
  palette: PaletteColor[]
  beads: DetectedBead[]
  transform: GridTransform | null
  background: RGB | null
  confidence: number
  warnings: string[]
  canApply: boolean
}

export interface SampledGridCell {
  sourceX: number
  sourceY: number
  rgb: RGB
  color: string
}

export const DEFAULT_IMAGE_ANALYSIS_OPTIONS: Readonly<ImageAnalysisOptions> = {
  backgroundMode: 'auto',
  backgroundColor: null,
  backgroundTolerance: 14,
  colorMergeDeltaE: 8,
  maxRotationDegrees: 15,
}

export const MAX_VISIBLE_BEADS_PER_AXIS = 199
const MAX_GRID_DIMENSION = MAX_VISIBLE_BEADS_PER_AXIS * 2 - 1
const MIN_ALPHA = 32

interface Lab {
  l: number
  a: number
  b: number
}

interface Component {
  index: number
  area: number
  centerX: number
  centerY: number
  radiusMajor: number
  radiusMinor: number
  angle: number
  aspect: number
  fill: number
  circularity: number
  rgb: RGB
  shapeScore: number
}

interface FittedBead {
  component: Component
  rawRow: number
  rawColumn: number
  residual: number
}

interface StepFit {
  step: number
  phase: number
  score: number
}

interface GridFit {
  rotation: number
  stepX: number
  stepY: number
  phaseX: number
  phaseY: number
  beads: FittedBead[]
  confidence: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function median(values: number[]) {
  if (!values.length) return 0
  values.sort((left, right) => left - right)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
}

function histogramMedian(histogram: Uint32Array, count: number) {
  if (count <= 0) return 0
  const target = Math.floor((count - 1) / 2)
  let accumulated = 0
  for (let value = 0; value < histogram.length; value += 1) {
    accumulated += histogram[value]
    if (accumulated > target) return value
  }
  return 255
}

function rgbToHex(rgb: RGB) {
  const channel = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

function srgbToLinear(value: number) {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function rgbToLab(rgb: RGB): Lab {
  const red = srgbToLinear(rgb.r)
  const green = srgbToLinear(rgb.g)
  const blue = srgbToLinear(rgb.b)
  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883
  const pivot = (value: number) =>
    value > 216 / 24389 ? Math.cbrt(value) : (24389 / 27 * value + 16) / 116
  const fx = pivot(x)
  const fy = pivot(y)
  const fz = pivot(z)
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

function deltaE(left: Lab, right: Lab) {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b)
}

function normalizedOptions(options?: Partial<ImageAnalysisOptions>): ImageAnalysisOptions {
  const backgroundColor = options?.backgroundColor
    ? {
        r: clamp(Math.round(options.backgroundColor.r), 0, 255),
        g: clamp(Math.round(options.backgroundColor.g), 0, 255),
        b: clamp(Math.round(options.backgroundColor.b), 0, 255),
      }
    : null
  return {
    backgroundMode: options?.backgroundMode ?? DEFAULT_IMAGE_ANALYSIS_OPTIONS.backgroundMode,
    backgroundColor,
    backgroundTolerance: clamp(
      options?.backgroundTolerance ?? DEFAULT_IMAGE_ANALYSIS_OPTIONS.backgroundTolerance,
      0,
      100,
    ),
    colorMergeDeltaE: clamp(
      options?.colorMergeDeltaE ?? DEFAULT_IMAGE_ANALYSIS_OPTIONS.colorMergeDeltaE,
      0,
      24,
    ),
    maxRotationDegrees: clamp(
      options?.maxRotationDegrees ?? DEFAULT_IMAGE_ANALYSIS_OPTIONS.maxRotationDegrees,
      0,
      15,
    ),
  }
}

function validateImage(image: PixelImage) {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) {
    throw new RangeError('La imagen debe tener dimensiones enteras positivas.')
  }
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError('Los píxeles deben proporcionarse como Uint8ClampedArray.')
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new RangeError('La longitud RGBA no coincide con las dimensiones de la imagen.')
  }
}

function edgePixelIndices(width: number, height: number) {
  const indices: number[] = []
  const band = Math.max(1, Math.min(8, Math.floor(Math.min(width, height) * 0.03)))
  const perimeterPixels = Math.max(1, 2 * band * (width + height))
  const stride = Math.max(1, Math.ceil(perimeterPixels / 20_000))
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (x < band || y < band || x >= width - band || y >= height - band) {
        indices.push(y * width + x)
      }
    }
  }
  return indices
}

function estimateBackground(image: PixelImage): RGB | null {
  const indices = edgePixelIndices(image.width, image.height)
  let transparent = 0
  const bins = new Map<number, { count: number; r: number[]; g: number[]; b: number[] }>()
  for (const index of indices) {
    const offset = index * 4
    const alpha = image.data[offset + 3]
    if (alpha < MIN_ALPHA) {
      transparent += 1
      continue
    }
    const r = image.data[offset]
    const g = image.data[offset + 1]
    const b = image.data[offset + 2]
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4)
    const bin = bins.get(key) ?? { count: 0, r: [], g: [], b: [] }
    bin.count += 1
    bin.r.push(r)
    bin.g.push(g)
    bin.b.push(b)
    bins.set(key, bin)
  }
  if (!indices.length || transparent / indices.length >= 0.3) return null
  let dominant: { count: number; r: number[]; g: number[]; b: number[] } | null = null
  for (const bin of bins.values()) {
    if (!dominant || bin.count > dominant.count) dominant = bin
  }
  return dominant
    ? { r: median(dominant.r), g: median(dominant.g), b: median(dominant.b) }
    : null
}

function buildForegroundMask(
  image: PixelImage,
  background: RGB | null,
  tolerance: number,
) {
  const mask = new Uint8Array(image.width * image.height)
  const backgroundLab = background ? rgbToLab(background) : null
  const cache = new Map<number, Lab>()
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4
    if (image.data[offset + 3] < MIN_ALPHA) continue
    if (!backgroundLab) {
      mask[index] = 1
      continue
    }
    const rgb = {
      r: image.data[offset],
      g: image.data[offset + 1],
      b: image.data[offset + 2],
    }
    const key = (rgb.r >> 3) << 10 | (rgb.g >> 3) << 5 | (rgb.b >> 3)
    let lab = cache.get(key)
    if (!lab) {
      lab = rgbToLab(rgb)
      cache.set(key, lab)
    }
    if (deltaE(lab, backgroundLab) > tolerance) mask[index] = 1
  }
  return mask
}

function extractComponents(image: PixelImage, mask: Uint8Array) {
  const { width, height, data } = image
  const visited = new Uint8Array(mask.length)
  const queue = new Int32Array(mask.length)
  const components: Component[] = []
  const minimumArea = Math.max(6, Math.floor(width * height / 2_000_000))

  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || visited[seed]) continue
    let head = 0
    let tail = 1
    queue[0] = seed
    visited[seed] = 1
    let area = 0
    let sumX = 0
    let sumY = 0
    let sumXX = 0
    let sumYY = 0
    let sumXY = 0
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    let perimeter = 0
    let interiorCount = 0
    const allRed = new Uint32Array(256)
    const allGreen = new Uint32Array(256)
    const allBlue = new Uint32Array(256)
    const innerRed = new Uint32Array(256)
    const innerGreen = new Uint32Array(256)
    const innerBlue = new Uint32Array(256)

    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      area += 1
      sumX += x
      sumY += y
      sumXX += x * x
      sumYY += y * y
      sumXY += x * y
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      const pixelOffset = index * 4
      const red = data[pixelOffset]
      const green = data[pixelOffset + 1]
      const blue = data[pixelOffset + 2]
      allRed[red] += 1
      allGreen[green] += 1
      allBlue[blue] += 1

      let isInterior = true
      const visit = (neighbor: number, valid: boolean) => {
        if (!valid || !mask[neighbor]) {
          perimeter += 1
          isInterior = false
        } else if (!visited[neighbor]) {
          visited[neighbor] = 1
          queue[tail++] = neighbor
        }
      }
      visit(index - 1, x > 0)
      visit(index + 1, x + 1 < width)
      visit(index - width, y > 0)
      visit(index + width, y + 1 < height)
      if (isInterior) {
        interiorCount += 1
        innerRed[red] += 1
        innerGreen[green] += 1
        innerBlue[blue] += 1
      }
    }

    if (area < minimumArea) continue
    const centerX = sumX / area
    const centerY = sumY / area
    const varianceX = Math.max(0, sumXX / area - centerX * centerX)
    const varianceY = Math.max(0, sumYY / area - centerY * centerY)
    const covariance = sumXY / area - centerX * centerY
    const trace = varianceX + varianceY
    const discriminant = Math.sqrt(Math.max(0, (varianceX - varianceY) ** 2 + 4 * covariance ** 2))
    const majorVariance = Math.max(0.25, (trace + discriminant) / 2)
    const minorVariance = Math.max(0.25, (trace - discriminant) / 2)
    const radiusMajor = 2 * Math.sqrt(majorVariance)
    const radiusMinor = 2 * Math.sqrt(minorVariance)
    const angle = 0.5 * Math.atan2(2 * covariance, varianceX - varianceY)
    const boxArea = (maxX - minX + 1) * (maxY - minY + 1)
    const fill = area / boxArea
    const circularity = perimeter ? 4 * Math.PI * area / (perimeter * perimeter) : 0
    const aspect = radiusMajor / radiusMinor
    const colorCount = interiorCount >= Math.max(3, area * 0.08) ? interiorCount : area
    const redHistogram = colorCount === interiorCount ? innerRed : allRed
    const greenHistogram = colorCount === interiorCount ? innerGreen : allGreen
    const blueHistogram = colorCount === interiorCount ? innerBlue : allBlue
    const shapeScore =
      clamp((circularity - 0.08) / 0.55, 0, 1) *
      clamp((fill - 0.18) / 0.55, 0, 1) *
      clamp((4 - aspect) / 2.5, 0, 1)
    components.push({
      index: components.length,
      area,
      centerX,
      centerY,
      radiusMajor,
      radiusMinor,
      angle,
      aspect,
      fill,
      circularity,
      rgb: {
        r: histogramMedian(redHistogram, colorCount),
        g: histogramMedian(greenHistogram, colorCount),
        b: histogramMedian(blueHistogram, colorCount),
      },
      shapeScore,
    })
  }
  return components
}

function selectBeadSizedComponents(components: Component[], imageArea: number) {
  const eligible = components.filter(
    (component) =>
      component.area < imageArea * 0.2 &&
      component.aspect <= 4 &&
      component.fill >= 0.2 &&
      component.circularity >= 0.09,
  )
  if (!eligible.length) return []
  const binWidth = 0.28
  const buckets = new Map<number, Component[]>()
  for (const component of eligible) {
    const key = Math.round(Math.log(component.area) / binWidth)
    const bucket = buckets.get(key) ?? []
    bucket.push(component)
    buckets.set(key, bucket)
  }
  let best: Component[] = []
  let bestScore = -1
  for (const key of buckets.keys()) {
    const group = eligible.filter(
      (component) => Math.abs(Math.round(Math.log(component.area) / binWidth) - key) <= 1,
    )
    const score = group.reduce(
      (total, component) => total + Math.sqrt(component.area) * (0.25 + component.shapeScore),
      0,
    )
    if (score > bestScore) {
      best = group
      bestScore = score
    }
  }
  const typicalArea = median(best.map((component) => component.area))
  return eligible.filter(
    (component) =>
      component.area >= typicalArea * 0.38 &&
      component.area <= typicalArea * 2.65 &&
      component.aspect <= 3.2 &&
      component.fill >= 0.24 &&
      component.circularity >= 0.12,
  )
}

function wrapRotation(angle: number) {
  const quarter = Math.PI / 4
  while (angle > quarter / 2) angle -= quarter
  while (angle < -quarter / 2) angle += quarter
  return angle
}

function estimateRotation(components: Component[]) {
  let sumCos = 0
  let sumSin = 0
  let totalWeight = 0
  for (const component of components) {
    const weight = Math.max(0, component.aspect - 1.12) * component.shapeScore
    sumCos += Math.cos(component.angle * 4) * weight
    sumSin += Math.sin(component.angle * 4) * weight
    totalWeight += weight
  }
  if (totalWeight >= Math.max(0.25, components.length * 0.035)) {
    return wrapRotation(Math.atan2(sumSin, sumCos) / 4)
  }

  sumCos = 0
  sumSin = 0
  totalWeight = 0
  const sample = components.slice(0, 140)
  for (let left = 0; left < sample.length; left += 1) {
    const neighbors = sample
      .map((component, right) => ({
        right,
        dx: component.centerX - sample[left].centerX,
        dy: component.centerY - sample[left].centerY,
      }))
      .filter(({ right }) => right !== left)
      .sort((a, b) => a.dx * a.dx + a.dy * a.dy - (b.dx * b.dx + b.dy * b.dy))
      .slice(0, 6)
    for (const { dx, dy } of neighbors) {
      const distance = Math.hypot(dx, dy)
      if (!distance) continue
      const angle = Math.atan2(dy, dx)
      const weight = 1 / distance
      sumCos += Math.cos(angle * 8) * weight
      sumSin += Math.sin(angle * 8) * weight
      totalWeight += weight
    }
  }
  return totalWeight ? wrapRotation(Math.atan2(sumSin, sumCos) / 8) : 0
}

function circularPhase(coordinates: number[], step: number) {
  let sumCos = 0
  let sumSin = 0
  for (const coordinate of coordinates) {
    const angle = 2 * Math.PI * coordinate / step
    sumCos += Math.cos(angle)
    sumSin += Math.sin(angle)
  }
  let phase = Math.atan2(sumSin, sumCos) * step / (2 * Math.PI)
  if (phase < 0) phase += step
  return phase
}

function coordinateResidual(coordinate: number, phase: number, step: number) {
  const grid = Math.round((coordinate - phase) / step)
  return Math.abs(coordinate - (phase + grid * step)) / step
}

function evaluateStep(coordinates: number[], step: number): StepFit {
  const phase = circularPhase(coordinates, step)
  const residuals = coordinates.map((coordinate) => coordinateResidual(coordinate, phase, step))
  const inlierFraction = residuals.filter((residual) => residual <= 0.24).length / residuals.length
  const score = inlierFraction * 0.75 + (1 - Math.min(0.5, median(residuals)) / 0.5) * 0.25
  return { step, phase, score }
}

function fitAxisStep(coordinates: number[], expectedDiameter: number) {
  const minimum = Math.max(2, expectedDiameter * 0.72)
  const maximum = Math.max(minimum + 1, expectedDiameter * 2.8)
  const sorted = [...coordinates].sort((left, right) => left - right)
  const candidates = new Set<number>([expectedDiameter])
  const sampleStride = Math.max(1, Math.ceil(sorted.length / 100))
  for (let left = 0; left < sorted.length; left += sampleStride) {
    for (let right = left + 1; right < sorted.length; right += sampleStride) {
      const difference = sorted[right] - sorted[left]
      if (difference > maximum * 10) break
      for (let divisor = 1; divisor <= 10; divisor += 1) {
        const candidate = difference / divisor
        if (candidate >= minimum && candidate <= maximum) {
          candidates.add(Math.round(candidate * 20) / 20)
        }
      }
    }
  }
  let best: StepFit | null = null
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate) || candidate < minimum || candidate > maximum) continue
    const fit = evaluateStep(coordinates, candidate)
    const physicalPenalty = Math.abs(Math.log(candidate / expectedDiameter)) * 0.025
    const adjustedScore = fit.score - physicalPenalty
    if (
      !best ||
      adjustedScore > best.score + 0.005 ||
      (Math.abs(adjustedScore - best.score) <= 0.005 && candidate < best.step)
    ) {
      best = { ...fit, score: adjustedScore }
    }
  }
  return best
}

function linearAxisFit(values: number[], indices: number[], fallbackStep: number) {
  const count = values.length
  if (!count) return { phase: 0, step: fallbackStep }
  const meanValue = values.reduce((sum, value) => sum + value, 0) / count
  const meanIndex = indices.reduce((sum, value) => sum + value, 0) / count
  let covariance = 0
  let variance = 0
  for (let index = 0; index < count; index += 1) {
    covariance += (indices[index] - meanIndex) * (values[index] - meanValue)
    variance += (indices[index] - meanIndex) ** 2
  }
  const step = variance > 0 ? covariance / variance : fallbackStep
  return {
    step: step > fallbackStep * 0.7 && step < fallbackStep * 1.3 ? step : fallbackStep,
    phase: meanValue - (step > 0 ? step : fallbackStep) * meanIndex,
  }
}

function fitGrid(components: Component[], maxRotationDegrees: number): GridFit | null {
  if (components.length < 3) return null
  let rotation = estimateRotation(components)
  const limit = maxRotationDegrees * Math.PI / 180
  rotation = clamp(rotation, -limit, limit)
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const projected = components.map((component) => ({
    component,
    u: cosine * component.centerX + sine * component.centerY,
    v: -sine * component.centerX + cosine * component.centerY,
  }))
  const expectedDiameter = median(components.map((component) => component.radiusMajor * 2))
  const horizontal = fitAxisStep(projected.map(({ u }) => u), expectedDiameter)
  const vertical = fitAxisStep(projected.map(({ v }) => v), expectedDiameter)
  if (!horizontal || !vertical || horizontal.score < 0.43 || vertical.score < 0.43) return null

  let stepX = horizontal.step
  let stepY = vertical.step
  let phaseX = horizontal.phase
  let phaseY = vertical.phase
  let assignments: Array<FittedBead & { u: number; v: number }> = []

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const tentative = projected.map(({ component, u, v }) => {
      const rawColumn = Math.round((u - phaseX) / stepX)
      const rawRow = Math.round((v - phaseY) / stepY)
      const residual = Math.hypot(
        (u - (phaseX + rawColumn * stepX)) / stepX,
        (v - (phaseY + rawRow * stepY)) / stepY,
      )
      return { component, u, v, rawColumn, rawRow, residual }
    })
    const close = tentative.filter(({ residual }) => residual <= 0.36)
    if (close.length < 3) return null
    const evenWeight = close
      .filter(({ rawRow, rawColumn }) => (rawRow + rawColumn) % 2 === 0)
      .reduce((sum, bead) => sum + 0.3 + bead.component.shapeScore, 0)
    const oddWeight = close
      .filter(({ rawRow, rawColumn }) => Math.abs(rawRow + rawColumn) % 2 === 1)
      .reduce((sum, bead) => sum + 0.3 + bead.component.shapeScore, 0)
    const parity = oddWeight > evenWeight ? 1 : 0
    assignments = close.filter(
      ({ rawRow, rawColumn }) => Math.abs(rawRow + rawColumn) % 2 === parity,
    )
    if (parity === 1) {
      for (const bead of assignments) bead.rawColumn += 1
      phaseX -= stepX
    }
    if (assignments.length < 3) return null
    const byCell = new Map<string, (typeof assignments)[number]>()
    for (const bead of assignments) {
      const key = `${bead.rawRow}:${bead.rawColumn}`
      const current = byCell.get(key)
      if (!current || bead.residual - bead.component.shapeScore * 0.08 < current.residual - current.component.shapeScore * 0.08) {
        byCell.set(key, bead)
      }
    }
    assignments = [...byCell.values()]
    const xFit = linearAxisFit(
      assignments.map(({ u }) => u),
      assignments.map(({ rawColumn }) => rawColumn),
      stepX,
    )
    const yFit = linearAxisFit(
      assignments.map(({ v }) => v),
      assignments.map(({ rawRow }) => rawRow),
      stepY,
    )
    stepX = xFit.step
    phaseX = xFit.phase
    stepY = yFit.step
    phaseY = yFit.phase
  }

  const fitted = assignments.map(({ component, rawRow, rawColumn, u, v }) => ({
    component,
    rawRow,
    rawColumn,
    residual: Math.hypot(
      (u - (phaseX + rawColumn * stepX)) / stepX,
      (v - (phaseY + rawRow * stepY)) / stepY,
    ),
  })).filter(({ residual }) => residual <= 0.38)
  const uniqueRows = new Set(fitted.map(({ rawRow }) => rawRow)).size
  const uniqueColumns = new Set(fitted.map(({ rawColumn }) => rawColumn)).size
  if (fitted.length < 3 || uniqueRows < 2 || uniqueColumns < 2) return null
  const residualConfidence = 1 - clamp(median(fitted.map(({ residual }) => residual)) / 0.38, 0, 1)
  const retention = fitted.length / components.length
  const countConfidence = clamp((fitted.length - 2) / 10, 0, 1)
  const confidence = clamp(residualConfidence * 0.5 + retention * 0.3 + countConfidence * 0.2, 0, 1)
  return { rotation, stepX, stepY, phaseX, phaseY, beads: fitted, confidence }
}

function clusterColors(colors: RGB[], threshold: number) {
  interface ColorCluster {
    indices: number[]
    lab: Lab
    sumR: number
    sumG: number
    sumB: number
    bucket: string
  }

  const clusters: ColorCluster[] = []
  const buckets = new Map<string, number[]>()
  const bucketKey = (lab: Lab) => [lab.l, lab.a, lab.b]
    .map((channel) => Math.floor(channel / Math.max(1, threshold)))
    .join(':')
  const addToBucket = (key: string, index: number) => {
    const entries = buckets.get(key) ?? []
    entries.push(index)
    buckets.set(key, entries)
  }

  for (let index = 0; index < colors.length; index += 1) {
    const rgb = colors[index]
    const lab = rgbToLab(rgb)
    let selected = -1
    let bestDistance = Number.POSITIVE_INFINITY

    if (threshold > 0) {
      const size = Math.max(1, threshold)
      const baseL = Math.floor(lab.l / size)
      const baseA = Math.floor(lab.a / size)
      const baseB = Math.floor(lab.b / size)
      for (let dl = -1; dl <= 1; dl += 1) {
        for (let da = -1; da <= 1; da += 1) {
          for (let db = -1; db <= 1; db += 1) {
            const candidates = buckets.get(`${baseL + dl}:${baseA + da}:${baseB + db}`) ?? []
            for (const candidate of candidates) {
              const distance = deltaE(lab, clusters[candidate].lab)
              if (distance <= threshold && distance < bestDistance) {
                selected = candidate
                bestDistance = distance
              }
            }
          }
        }
      }
    } else {
      const candidates = buckets.get(rgbToHex(rgb)) ?? []
      selected = candidates[0] ?? -1
    }

    if (selected < 0) {
      const bucket = threshold > 0 ? bucketKey(lab) : rgbToHex(rgb)
      selected = clusters.length
      clusters.push({ indices: [index], lab, sumR: rgb.r, sumG: rgb.g, sumB: rgb.b, bucket })
      addToBucket(bucket, selected)
      continue
    }

    const cluster = clusters[selected]
    cluster.indices.push(index)
    cluster.sumR += rgb.r
    cluster.sumG += rgb.g
    cluster.sumB += rgb.b
    if (threshold > 0) {
      const count = cluster.indices.length
      cluster.lab = rgbToLab({
        r: cluster.sumR / count,
        g: cluster.sumG / count,
        b: cluster.sumB / count,
      })
      const nextBucket = bucketKey(cluster.lab)
      if (nextBucket !== cluster.bucket) {
        const previousEntries = buckets.get(cluster.bucket)
        if (previousEntries) {
          const position = previousEntries.indexOf(selected)
          if (position >= 0) previousEntries.splice(position, 1)
          if (!previousEntries.length) buckets.delete(cluster.bucket)
        }
        cluster.bucket = nextBucket
        addToBucket(nextBucket, selected)
      }
    }
  }
  const assignments = new Array<RGB>(colors.length)
  const palette: PaletteColor[] = []
  for (const cluster of clusters) {
    const rgb = {
      r: Math.round(median(cluster.indices.map((index) => colors[index].r))),
      g: Math.round(median(cluster.indices.map((index) => colors[index].g))),
      b: Math.round(median(cluster.indices.map((index) => colors[index].b))),
    }
    const color = rgbToHex(rgb)
    palette.push({ color, rgb, count: cluster.indices.length })
    for (const index of cluster.indices) assignments[index] = rgb
  }
  palette.sort((left, right) => right.count - left.count || left.color.localeCompare(right.color))
  return { assignments, palette }
}

function emptyResult(image: PixelImage, background: RGB | null, warning: string): PatternAnalysisResult {
  return {
    imageWidth: image.width,
    imageHeight: image.height,
    rows: 0,
    columns: 0,
    cells: {},
    palette: [],
    beads: [],
    transform: null,
    background,
    confidence: 0,
    warnings: [warning],
    canApply: false,
  }
}

function normalizationBounds(fitted: FittedBead[]) {
  const minRawRow = Math.min(...fitted.map(({ rawRow }) => rawRow))
  const maxRawRow = Math.max(...fitted.map(({ rawRow }) => rawRow))
  const minRawColumn = Math.min(...fitted.map(({ rawColumn }) => rawColumn))
  const maxRawColumn = Math.max(...fitted.map(({ rawColumn }) => rawColumn))
  const spanRows = maxRawRow - minRawRow + 1
  const spanColumns = maxRawColumn - minRawColumn + 1
  const rowPadding = spanRows % 2 === 0 ? 1 : 0
  let columnPadding = spanColumns % 2 === 0 ? 1 : 0
  const beforeRows = 0
  let beforeColumns = 0
  if (Math.abs(-minRawRow - minRawColumn) % 2 !== 0) {
    if (columnPadding === 0) columnPadding += 2
    beforeColumns = 1
  }
  const margin = IMPORT_VISIBLE_MARGIN * 2
  return {
    rows: spanRows + rowPadding + margin * 2,
    columns: spanColumns + columnPadding + margin * 2,
    rowOffset: -minRawRow + beforeRows + margin,
    columnOffset: -minRawColumn + beforeColumns + margin,
  }
}

export function gridToSourcePoint(transform: GridTransform, row: number, column: number) {
  const rotation = transform.rotationDegrees * Math.PI / 180
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  return {
    x: transform.originX + cosine * column * transform.stepX - sine * row * transform.stepY,
    y: transform.originY + sine * column * transform.stepX + cosine * row * transform.stepY,
  }
}

export function sampleGridCellColor(
  image: PixelImage,
  transform: GridTransform,
  row: number,
  column: number,
  options?: Partial<ImageAnalysisOptions>,
): SampledGridCell | null {
  validateImage(image)
  const resolved = normalizedOptions(options)
  const center = gridToSourcePoint(transform, row, column)
  const background = resolved.backgroundMode === 'manual'
    ? resolved.backgroundColor
    : estimateBackground(image)
  const backgroundLab = background ? rgbToLab(background) : null
  const radius = Math.max(1.5, Math.min(transform.stepX, transform.stepY) * 0.27)
  const minimumX = Math.max(0, Math.floor(center.x - radius))
  const maximumX = Math.min(image.width - 1, Math.ceil(center.x + radius))
  const minimumY = Math.max(0, Math.floor(center.y - radius))
  const maximumY = Math.min(image.height - 1, Math.ceil(center.y + radius))
  const red: number[] = []
  const green: number[] = []
  const blue: number[] = []
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      if ((x - center.x) ** 2 + (y - center.y) ** 2 > radius ** 2) continue
      const offset = (y * image.width + x) * 4
      if (image.data[offset + 3] < MIN_ALPHA) continue
      const rgb = { r: image.data[offset], g: image.data[offset + 1], b: image.data[offset + 2] }
      if (backgroundLab && deltaE(rgbToLab(rgb), backgroundLab) <= resolved.backgroundTolerance) continue
      red.push(rgb.r)
      green.push(rgb.g)
      blue.push(rgb.b)
    }
  }
  if (red.length < 3) return null
  const rgb = { r: Math.round(median(red)), g: Math.round(median(green)), b: Math.round(median(blue)) }
  return { sourceX: center.x, sourceY: center.y, rgb, color: rgbToHex(rgb) }
}

export function analyzePatternImage(
  image: PixelImage,
  options?: Partial<ImageAnalysisOptions>,
): PatternAnalysisResult {
  validateImage(image)
  const resolved = normalizedOptions(options)
  const warnings: string[] = []
  const background = resolved.backgroundMode === 'manual'
    ? resolved.backgroundColor
    : estimateBackground(image)
  if (resolved.backgroundMode === 'manual' && !background) {
    throw new Error('El modo de fondo manual requiere backgroundColor.')
  }
  const mask = buildForegroundMask(image, background, resolved.backgroundTolerance)
  const components = extractComponents(image, mask)
  const candidates = selectBeadSizedComponents(components, image.width * image.height)
  if (candidates.length < 3) {
    return emptyResult(image, background, 'No se encontraron suficientes cuentas separadas del fondo.')
  }
  const unconstrainedRotation = estimateRotation(candidates) * 180 / Math.PI
  if (Math.abs(unconstrainedRotation) > resolved.maxRotationDegrees + 0.5) {
    warnings.push(`La inclinación se limitó a ${resolved.maxRotationDegrees.toFixed(0)} grados.`)
  }
  const fit = fitGrid(candidates, resolved.maxRotationDegrees)
  if (!fit) {
    return emptyResult(image, background, 'No fue posible ajustar una retícula alternada fiable.')
  }
  const bounds = normalizationBounds(fit.beads)
  const exceedsLimit = bounds.rows > MAX_GRID_DIMENSION || bounds.columns > MAX_GRID_DIMENSION
  if (exceedsLimit) {
    return emptyResult(
      image,
      background,
      'El patrón y su margen de 5 posiciones superan el límite de 199 cuentas visibles por eje.',
    )
  }
  const rows = bounds.rows
  const columns = bounds.columns
  const cosine = Math.cos(fit.rotation)
  const sine = Math.sin(fit.rotation)
  const originU = fit.phaseX - bounds.columnOffset * fit.stepX
  const originV = fit.phaseY - bounds.rowOffset * fit.stepY
  const transform: GridTransform = {
    originX: cosine * originU - sine * originV,
    originY: sine * originU + cosine * originV,
    stepX: fit.stepX,
    stepY: fit.stepY,
    rotationDegrees: fit.rotation * 180 / Math.PI,
    rowOffset: bounds.rowOffset,
    columnOffset: bounds.columnOffset,
    sourceWidth: image.width,
    sourceHeight: image.height,
  }
  const normalized = fit.beads.map((bead) => ({
    ...bead,
    row: bead.rawRow + bounds.rowOffset,
    column: bead.rawColumn + bounds.columnOffset,
  })).filter(({ row, column }) => row >= 0 && row < rows && column >= 0 && column < columns)
  const colors = clusterColors(normalized.map(({ component }) => component.rgb), resolved.colorMergeDeltaE)
  const cells: Record<string, string> = {}
  const beads: DetectedBead[] = normalized.map((bead, index) => {
    const rgb = colors.assignments[index]
    const color = rgbToHex(rgb)
    cells[`${bead.row}:${bead.column}`] = color
    return {
      id: `bead-${bead.component.index}`,
      sourceX: bead.component.centerX,
      sourceY: bead.component.centerY,
      radiusX: bead.component.radiusMajor,
      radiusY: bead.component.radiusMinor,
      angleDegrees: bead.component.angle * 180 / Math.PI,
      row: bead.row,
      column: bead.column,
      color,
      rgb,
      area: bead.component.area,
      confidence: clamp((1 - bead.residual / 0.38) * 0.7 + bead.component.shapeScore * 0.3, 0, 1),
    }
  })
  const rejected = components.length - beads.length
  if (rejected > 0) {
    warnings.push(`Se ignoraron ${rejected} formas que parecían texto, ruido o elementos fuera de la retícula.`)
  }
  if (fit.confidence < 0.58) {
    warnings.push('La retícula tiene confianza baja; revisa la vista previa.')
  }
  const canApply = !exceedsLimit && beads.length >= 3 && fit.confidence >= 0.42
  return {
    imageWidth: image.width,
    imageHeight: image.height,
    rows,
    columns,
    cells,
    palette: colors.palette,
    beads,
    transform,
    background,
    confidence: fit.confidence,
    warnings,
    canApply,
  }
}
