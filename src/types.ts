export type OccurrenceKind = 'text' | 'attr' | 'interpolation' | 'expr'

export interface Occurrence {
  kind: OccurrenceKind
  start: number
  end: number
  /** 静态属性名，例如 title、placeholder。 */
  name?: string
}

export interface ChineseEntry {
  id: string
  zh: string
  occurrences: Occurrence[]
}

export interface ExtractResult {
  entries: ChineseEntry[]
  warnings: string[]
}

export interface LangEntry {
  key: string
  value: string
}

export interface LangConflict {
  key: string
  existing: string
  incoming: string
}
