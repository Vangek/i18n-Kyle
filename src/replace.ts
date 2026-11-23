import type { Occurrence } from './types'

export interface Replacement {
  start: number
  end: number
  insert: string
}

export function assertI18nFunction(fn: string): string {
  const value = fn.trim()
  if (!/^[$A-Za-z_][\w$]*(\.[$A-Za-z_][\w$]*)*$/.test(value)) {
    throw new Error('i18n 函数名无效，请在设置里修改 i18nKyle.i18nFunction。')
  }
  return value
}

export function buildCall(fn: string, moduleName: string, key: string): string {
  return `${fn}('${moduleName}.${key}')`
}

export function occurrenceInsert(occurrence: Occurrence, call: string): string {
  if (occurrence.kind === 'text' || occurrence.kind === 'interpolation') return `{{ ${call} }}`
  if (occurrence.kind === 'attr') return `:${occurrence.name}="${call}"`
  return call
}

export function applyReplacements(source: string, replacements: Replacement[]): string {
  const sorted = [...replacements].sort((a, b) => b.start - a.start || b.end - a.end)
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]
    if (current.start < 0 || current.end > source.length || current.start > current.end) {
      throw new Error('替换区间无效。')
    }
    const next = sorted[index - 1]
    if (next && current.end > next.start) throw new Error('替换区间重叠。')
  }
  let output = source
  for (const replacement of sorted) {
    output = output.slice(0, replacement.start) + replacement.insert + output.slice(replacement.end)
  }
  return output
}
