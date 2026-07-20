export type ToolMode = 'paint' | 'erase' | 'select' | 'pan' | 'trace' | 'number'
export type NumberingMode = 'manual' | 'automatic'
export type MirrorMode = 'none' | 'vertical' | 'horizontal' | 'both'
export type BeadOrientation = 'vertical' | 'horizontal'
export type BackgroundMode = 'transparent' | 'solid'
export type ReferenceMode = 'floating' | 'trace'

export interface PatternDocument {
  version: 1
  rows: number
  columns: number
  cells: Record<string, string>
  guideSteps?: GuideStep[]
  background: {
    mode: BackgroundMode
    color: string
  }
}

export interface GuideStep {
  row: number
  column: number
}

export interface BeadGeometry {
  row: number
  column: number
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
  orientation: BeadOrientation
}

export interface ViewTransform {
  scale: number
  offsetX: number
  offsetY: number
}

export interface TraceImage {
  src: string
  name: string
  naturalWidth: number
  naturalHeight: number
  baseScale: number
  scalePercent: number
  x: number
  y: number
  opacity: number
  visible: boolean
}

export interface BeadStudioProject {
  format: 'bead-studio-project'
  version: 1
  name: string
  document: PatternDocument
  editor: {
    color: string
    mirrorMode: MirrorMode
    referenceMode: ReferenceMode
    traceImage: TraceImage | null
    showGuideSteps?: boolean
  }
}

export function getTraceImageSize(trace: TraceImage) {
  const scale = trace.baseScale * (trace.scalePercent / 100)
  return {
    width: trace.naturalWidth * scale,
    height: trace.naturalHeight * scale,
  }
}
