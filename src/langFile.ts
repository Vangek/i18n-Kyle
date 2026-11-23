import type { LangConflict, LangEntry } from './types'
import { escapeSingleQuoted, isIdentifier } from './text'

export function serializeLang(entries: LangEntry[]): string {
  const lines = entries.map((entry, index) => {
    const comma = index === entries.length - 1 ? '' : ','
    const key = isIdentifier(entry.key) ? entry.key : `'${escapeSingleQuoted(entry.key)}'`
    return `  ${key}: '${escapeSingleQuoted(entry.value)}'${comma}`
  })
  if (lines.length === 0) return 'export default {\n}\n'
  return `export default {\n${lines.join('\n')}\n}\n`
}

export function parseLangFile(source: string): LangEntry[] | null {
  const trimmed = source.trim()
  if (!trimmed) return []
  const matched = trimmed.match(/^export\s+default\s+\{([\s\S]*)\}\s*;?$/)
  if (!matched) return null

  const body = matched[1]
  const entries: LangEntry[] = []
  let index = 0

  const skip = () => {
    while (index < body.length) {
      const char = body[index]
      if (/\s/.test(char)) {
        index += 1
        continue
      }
      if (char === '/' && body[index + 1] === '/') {
        while (index < body.length && body[index] !== '\n') index += 1
        continue
      }
      if (char === '/' && body[index + 1] === '*') {
        index += 2
        while (index < body.length && !(body[index] === '*' && body[index + 1] === '/')) index += 1
        index = Math.min(body.length, index + 2)
        continue
      }
      break
    }
  }

  while (index < body.length) {
    skip()
    if (index >= body.length) break
    if (body[index] === ',') {
      index += 1
      continue
    }

    let key = ''
    if (body[index] === "'" || body[index] === '"') {
      const parsed = readString(body, index)
      if (!parsed) return null
      key = parsed.value
      index = parsed.end
    } else if (/[A-Za-z_$]/.test(body[index])) {
      const start = index
      index += 1
      while (index < body.length && /[\w$]/.test(body[index])) index += 1
      key = body.slice(start, index)
    } else {
      return null
    }

    skip()
    if (body[index] !== ':') return null
    index += 1
    skip()
    const parsed = readString(body, index)
    if (!parsed) return null
    index = parsed.end
    entries.push({ key, value: parsed.value })
  }

  return entries
}

function readString(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start]
  if (quote !== "'" && quote !== '"') return null
  let value = ''
  let index = start + 1
  while (index < source.length) {
    const char = source[index]
    if (char === '\\') {
      const next = source[index + 1]
      if (next === undefined) return null
      if (next === 'n') value += '\n'
      else if (next === 'r') value += '\r'
      else if (next === 't') value += '\t'
      else if (next === 'u' && /^[0-9a-fA-F]{4}/.test(source.slice(index + 2, index + 6))) {
        value += String.fromCharCode(parseInt(source.slice(index + 2, index + 6), 16))
        index += 6
        continue
      } else value += next
      index += 2
      continue
    }
    if (char === quote) return { value, end: index + 1 }
    if (char === '\n' || char === '\r') return null
    value += char
    index += 1
  }
  return null
}

export function valueToKeyMap(entries: LangEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    if (!map.has(entry.value)) map.set(entry.value, entry.key)
  }
  return map
}

export function mergeEntries(
  existing: LangEntry[],
  incoming: LangEntry[],
  options: { strict: boolean; fillEmpty?: boolean },
): { entries: LangEntry[]; conflicts: LangConflict[] } {
  const conflicts: LangConflict[] = []
  const values = new Map(existing.map((entry) => [entry.key, entry.value]))
  const order = existing.map((entry) => entry.key)

  for (const item of incoming) {
    if (!values.has(item.key)) {
      values.set(item.key, item.value)
      order.push(item.key)
      continue
    }
    const previous = values.get(item.key) ?? ''
    if (previous === item.value) continue
    if (options.fillEmpty && previous === '' && item.value !== '') {
      values.set(item.key, item.value)
      continue
    }
    if (options.strict) {
      conflicts.push({ key: item.key, existing: previous, incoming: item.value })
    }
  }

  return {
    entries: order.map((key) => ({ key, value: values.get(key) ?? '' })),
    conflicts,
  }
}
