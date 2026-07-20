import { describe, expect, it } from 'vitest'
import type { BeadStudioProject } from '../types'
import { DEFAULT_PATTERN } from './patternState'
import {
  isBeadStudioProject,
  parseProjectFile,
  projectFilename,
  serializeProjectFile,
} from './projectFile'

const project: BeadStudioProject = {
  format: 'bead-studio-project',
  version: 1,
  name: 'Pulsera de verano',
  document: {
    ...DEFAULT_PATTERN,
    rows: 5,
    columns: 5,
    cells: { '0:0': '#ff0000', '2:2': '#14b8a6' },
  },
  editor: {
    color: '#14b8a6',
    mirrorMode: 'both',
    referenceMode: 'floating',
    traceImage: null,
  },
}

describe('archivos de proyecto', () => {
  it('conserva el documento editable y las preferencias al serializar', () => {
    const restored = parseProjectFile(serializeProjectFile(project))
    expect(restored).toEqual(project)
    expect(restored.document.cells['2:2']).toBe('#14b8a6')
  })

  it('rechaza archivos que no sean proyectos válidos', () => {
    expect(isBeadStudioProject({ ...project, format: 'otro-formato' })).toBe(false)
    expect(() => parseProjectFile('{"version":1}')).toThrow(/proyecto válido/)
    expect(() => parseProjectFile('{incorrecto')).toThrow()
  })

  it('crea un nombre de archivo seguro con la extensión propia', () => {
    expect(projectFilename('Pulsera de verano')).toBe('pulsera-de-verano.beadstudio')
    expect(projectFilename('  ')).toBe('patron-bisuteria.beadstudio')
  })
})
