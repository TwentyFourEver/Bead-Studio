import { isPatternDocument } from './patternState'
import type {
  BeadStudioProject,
  MirrorMode,
  ReferenceMode,
  TraceImage,
} from '../types'

export const PROJECT_EXTENSION = '.beadstudio'
export const PROJECT_FORMAT = 'bead-studio-project'

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const IMAGE_DATA_PATTERN = /^data:image\/(?:png|jpeg|webp|gif);base64,/i
const MIRROR_MODES: MirrorMode[] = ['none', 'vertical', 'horizontal', 'both']
const REFERENCE_MODES: ReferenceMode[] = ['floating', 'trace']

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isTraceImage(value: unknown): value is TraceImage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TraceImage>
  return (
    typeof candidate.src === 'string' &&
    IMAGE_DATA_PATTERN.test(candidate.src) &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    isFiniteNumber(candidate.naturalWidth) &&
    candidate.naturalWidth > 0 &&
    isFiniteNumber(candidate.naturalHeight) &&
    candidate.naturalHeight > 0 &&
    isFiniteNumber(candidate.baseScale) &&
    candidate.baseScale > 0 &&
    isFiniteNumber(candidate.scalePercent) &&
    candidate.scalePercent >= 10 &&
    candidate.scalePercent <= 300 &&
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNumber(candidate.opacity) &&
    candidate.opacity >= 0.1 &&
    candidate.opacity <= 1 &&
    typeof candidate.visible === 'boolean'
  )
}

export function isBeadStudioProject(value: unknown): value is BeadStudioProject {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BeadStudioProject>
  const editor = candidate.editor as Partial<BeadStudioProject['editor']> | undefined

  return (
    candidate.format === PROJECT_FORMAT &&
    candidate.version === 1 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    candidate.name.length <= 120 &&
    isPatternDocument(candidate.document) &&
    !!editor &&
    typeof editor.color === 'string' &&
    COLOR_PATTERN.test(editor.color) &&
    MIRROR_MODES.includes(editor.mirrorMode as MirrorMode) &&
    REFERENCE_MODES.includes(editor.referenceMode as ReferenceMode) &&
    (editor.traceImage === null || isTraceImage(editor.traceImage))
  )
}

export function parseProjectFile(source: string): BeadStudioProject {
  const parsed: unknown = JSON.parse(source)
  if (!isBeadStudioProject(parsed)) {
    throw new Error('El archivo no es un proyecto válido de Bead Studio.')
  }
  return parsed
}

export function serializeProjectFile(project: BeadStudioProject) {
  if (!isBeadStudioProject(project)) {
    throw new Error('El proyecto contiene datos no válidos.')
  }
  return JSON.stringify(project, null, 2)
}

export function projectFilename(name: string) {
  const safeName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `${safeName || 'patron-bisuteria'}${PROJECT_EXTENSION}`
}

export function downloadProjectFile(project: BeadStudioProject) {
  const blob = new Blob([serializeProjectFile(project)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = projectFilename(project.name)
  link.click()
  URL.revokeObjectURL(url)
}
