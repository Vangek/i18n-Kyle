import { compact, hasChinese } from './text'

export interface CodeStringHit {
  /** 含引号，相对于传入 source 的起点。 */
  start: number
  end: number
  value: string
}

export interface CodeScanResult {
  hits: CodeStringHit[]
  warnings: string[]
}

interface Frame {
  start: number
  value: string
  interpolated: boolean
  /** 0 表示正在读取模板静态文本，大于 0 表示正在读取 ${} 表达式。 */
  braceDepth: number
}

const REGEX_BEFORE = new Set(['(', '[', '{', ',', ';', '!', '&', '|', '?', ':', '=', '+', '-', '*', '%', '~', '^', '<', '>'])
const REGEX_KEYWORD = /^(return|case|throw|typeof|void|do|else|in|of|instanceof|yield|await|delete|new)$/

export function scanCodeStrings(source: string): CodeScanResult {
  const hits: CodeStringHit[] = []
  const warnings: string[] = []
  const covered: Array<[number, number]> = []
  const frames: Frame[] = []
  let index = 0

  const inStatic = () => {
    const frame = frames[frames.length - 1]
    return Boolean(frame && frame.braceDepth === 0)
  }

  while (index < source.length) {
    if (inStatic()) {
      index = consumeStatic(source, index, frames, hits, warnings, covered)
      continue
    }
    const next = consumeCode(source, index, frames, hits, covered)
    if (next <= index) {
      index += 1
      continue
    }
    index = next
  }

  if (hasUncoveredChinese(source, covered)) {
    warnings.push('还有字符串和注释以外的中文，未提取。')
  }
  return { hits, warnings }
}

/** 跳过字符串、注释和模板后，找到真正的结束标签。 */
export function findClosingTag(source: string, contentStart: number, tagName: string): number {
  const closer = new RegExp(`^</${tagName}\\s*>`, 'i')
  let index = contentStart
  while (index < source.length) {
    const char = source[index]
    if (char === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index + 2)
      index = newline < 0 ? source.length : newline + 1
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end < 0 ? source.length : end + 2
      continue
    }
    if (char === "'" || char === '"') {
      const literal = readQuoted(source, index, source.length)
      index = literal ? literal.end : index + 1
      continue
    }
    if (char === '`') {
      const end = skipTemplate(source, index, source.length)
      index = end < 0 ? index + 1 : end
      continue
    }
    if (char === '/' && canStartRegex(source, index)) {
      const end = skipRegex(source, index, source.length)
      index = end < 0 ? index + 1 : end
      continue
    }
    if (char === '<' && closer.test(source.slice(index))) return index
    index += 1
  }
  return -1
}

function consumeStatic(
  source: string,
  index: number,
  frames: Frame[],
  hits: CodeStringHit[],
  warnings: string[],
  covered: Array<[number, number]>,
): number {
  const frame = frames[frames.length - 1]
  if (!frame) return index + 1
  const char = source[index]
  if (char === '\\') {
    const decoded = decodeEscape(source, index, source.length)
    frame.value += decoded.value
    return Math.max(decoded.next, index + 1)
  }
  if (char === '`') {
    closeFrame(source, frames, index + 1, hits, warnings, covered)
    return index + 1
  }
  if (char === '$' && source[index + 1] === '{') {
    frame.interpolated = true
    frame.braceDepth = 1
    return index + 2
  }
  frame.value += char
  return index + 1
}

function consumeCode(
  source: string,
  index: number,
  frames: Frame[],
  hits: CodeStringHit[],
  covered: Array<[number, number]>,
): number {
  const char = source[index]
  if (char === '/' && source[index + 1] === '/') {
    const newline = source.indexOf('\n', index + 2)
    const end = newline < 0 ? source.length : newline + 1
    covered.push([index, end])
    return end
  }
  if (char === '/' && source[index + 1] === '*') {
    const blockEnd = source.indexOf('*/', index + 2)
    const end = blockEnd < 0 ? source.length : blockEnd + 2
    covered.push([index, end])
    return end
  }
  if (char === "'" || char === '"') {
    const literal = readQuoted(source, index, source.length)
    if (!literal) return index + 1
    covered.push([index, literal.end])
    pushLiteral(source, index, literal.end, literal.value, hits)
    return literal.end
  }
  if (char === '`') {
    frames.push({ start: index, value: '', interpolated: false, braceDepth: 0 })
    return index + 1
  }
  if (char === '/' && canStartRegex(source, index)) {
    const end = skipRegex(source, index, source.length)
    if (end > index) {
      covered.push([index, end])
      return end
    }
  }
  if (frames.length > 0 && char === '{') {
    frames[frames.length - 1].braceDepth += 1
    return index + 1
  }
  if (frames.length > 0 && char === '}') {
    frames[frames.length - 1].braceDepth -= 1
    return index + 1
  }
  return index + 1
}

function closeFrame(
  source: string,
  frames: Frame[],
  end: number,
  hits: CodeStringHit[],
  warnings: string[],
  covered: Array<[number, number]>,
): void {
  const frame = frames.pop()
  if (!frame) return
  covered.push([frame.start, end])
  if (frame.interpolated) {
    if (hasChinese(frame.value)) {
      warnings.push(`模板字符串中的中文未提取：${compact(source.slice(frame.start, end))}`)
    }
    return
  }
  pushLiteral(source, frame.start, end, frame.value, hits)
}

function pushLiteral(source: string, start: number, end: number, value: string, hits: CodeStringHit[]): void {
  const text = value.replace(/\r\n/g, '\n').trim()
  if (!text || !hasChinese(text)) return
  if (isI18nArgument(source, start) || isModuleSpecifier(source, start)) return
  hits.push({ start, end, value: text })
}

function hasUncoveredChinese(source: string, covered: Array<[number, number]>): boolean {
  const chars = source.split('')
  for (const [start, end] of covered) {
    for (let index = start; index < end && index < chars.length; index += 1) chars[index] = ' '
  }
  return hasChinese(chars.join(''))
}

function isI18nArgument(source: string, start: number): boolean {
  return /(?:\$tc|\$te|\$t|(?:^|[^\w$])t)\s*\(\s*$/.test(source.slice(0, start))
}

function isModuleSpecifier(source: string, start: number): boolean {
  const prefix = source.slice(0, start)
  return (
    /(?:^|[^\w$])from\s+$/.test(prefix) ||
    /(?:^|[^\w$])require\s*\(\s*$/.test(prefix) ||
    /(?:^|[^\w$])import\s*\(\s*$/.test(prefix) ||
    /(?:^|[^\w$])import\s+$/.test(prefix)
  )
}

function readQuoted(source: string, start: number, limit: number): { end: number; value: string } | null {
  const quote = source[start]
  let index = start + 1
  let value = ''
  while (index < limit) {
    const char = source[index]
    if (char === '\\') {
      const decoded = decodeEscape(source, index, limit)
      if (decoded.next <= index) return null
      value += decoded.value
      index = decoded.next
      continue
    }
    if (char === '\n' || char === '\r') return null
    if (char === quote) return { end: index + 1, value }
    value += char
    index += 1
  }
  return null
}

function decodeEscape(source: string, index: number, limit: number): { value: string; next: number } {
  if (source[index] !== '\\' || index + 1 >= limit) {
    return { value: source[index] ?? '', next: Math.min(limit, index + 1) }
  }
  const next = source[index + 1]
  if (next === '\n') return { value: '', next: index + 2 }
  if (next === '\r') return { value: '', next: source[index + 2] === '\n' ? index + 3 : index + 2 }
  const simple: Record<string, string> = {
    n: '\n',
    r: '\r',
    t: '\t',
    b: '\b',
    f: '\f',
    v: '\v',
    '0': '\0',
    '\\': '\\',
    "'": "'",
    '"': '"',
    '`': '`',
    $: '$',
  }
  if (Object.prototype.hasOwnProperty.call(simple, next)) return { value: simple[next], next: index + 2 }
  if (next === 'x' && /^[0-9a-f]{2}$/i.test(source.slice(index + 2, index + 4))) {
    return { value: String.fromCharCode(parseInt(source.slice(index + 2, index + 4), 16)), next: index + 4 }
  }
  if (next === 'u' && source[index + 2] === '{') {
    const end = source.indexOf('}', index + 3)
    const hex = end > index ? source.slice(index + 3, end) : ''
    if (end >= 0 && end < limit && /^[0-9a-f]+$/i.test(hex) && hex.length <= 6) {
      const code = parseInt(hex, 16)
      if (code <= 0x10ffff) return { value: String.fromCodePoint(code), next: end + 1 }
    }
  }
  if (next === 'u' && /^[0-9a-f]{4}$/i.test(source.slice(index + 2, index + 6))) {
    return { value: String.fromCharCode(parseInt(source.slice(index + 2, index + 6), 16)), next: index + 6 }
  }
  return { value: next, next: index + 2 }
}

function canStartRegex(source: string, slashIndex: number): boolean {
  let index = slashIndex - 1
  while (index >= 0 && /\s/.test(source[index])) index -= 1
  if (index < 0) return true
  const char = source[index]
  if (REGEX_BEFORE.has(char)) return true
  const word = /[A-Za-z_$][\w$]*$/.exec(source.slice(0, index + 1))
  return Boolean(word && REGEX_KEYWORD.test(word[0]))
}

function skipRegex(source: string, start: number, limit: number): number {
  let index = start + 1
  let inClass = false
  while (index < limit) {
    const char = source[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '\n' || char === '\r') return -1
    if (char === '[' && !inClass) inClass = true
    else if (char === ']' && inClass) inClass = false
    else if (char === '/' && !inClass) {
      index += 1
      while (index < limit && /[a-z]/i.test(source[index])) index += 1
      return index
    }
    index += 1
  }
  return -1
}

function skipTemplate(source: string, start: number, limit: number): number {
  const frames = [0]
  let index = start + 1
  while (index < limit && frames.length > 0) {
    const depth = frames[frames.length - 1]
    const char = source[index]
    if (depth === 0) {
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === '`') {
        frames.pop()
        index += 1
        continue
      }
      if (char === '$' && source[index + 1] === '{') {
        frames[frames.length - 1] = 1
        index += 2
        continue
      }
      index += 1
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index + 2)
      index = newline < 0 || newline >= limit ? limit : newline + 1
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end < 0 || end >= limit ? limit : end + 2
      continue
    }
    if (char === "'" || char === '"') {
      const literal = readQuoted(source, index, limit)
      index = literal ? literal.end : index + 1
      continue
    }
    if (char === '`') {
      frames.push(0)
      index += 1
      continue
    }
    if (char === '{') frames[frames.length - 1] += 1
    else if (char === '}') frames[frames.length - 1] -= 1
    index += 1
  }
  return frames.length === 0 ? index : -1
}
