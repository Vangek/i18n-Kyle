const CJK = /[\u4e00-\u9fff]/

export function hasChinese(text: string): boolean {
  return CJK.test(text)
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/gi, '&')
}

export function dedent(text: string): string {
  const lines = text.split(/\r?\n/)
  let min = Number.POSITIVE_INFINITY
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue
    const indent = lines[index].match(/^[ \t]*/)?.[0].length ?? 0
    if (indent < min) min = indent
  }
  if (!Number.isFinite(min)) {
    return lines.map((line) => line.trim()).join('\n').trim()
  }
  return lines
    .map((line, index) => (index === 0 ? line.trim() : line.slice(min).trimEnd()))
    .join('\n')
    .trim()
}

export function normalizeMessage(text: string, preserveIndent: boolean): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim()
  if (!trimmed) return ''
  if (preserveIndent || !trimmed.includes('\n')) return trimmed
  return dedent(trimmed)
}

export function trimOffsets(raw: string): { start: number; end: number } | null {
  let start = 0
  let end = raw.length
  while (start < end && /\s/.test(raw[start])) start += 1
  while (end > start && /\s/.test(raw[end - 1])) end -= 1
  if (start >= end) return null
  return { start, end }
}

/** 整个表达式就是一个引号字符串时返回解码后的内容。 */
export function parsePureStringLiteral(expr: string): string | null {
  const text = expr.trim()
  if (text.length < 2) return null
  const quote = text[0]
  if ((quote !== "'" && quote !== '"' && quote !== '`') || text[text.length - 1] !== quote) {
    return null
  }
  if (quote === '`' && text.includes('${')) return null
  const body = text.slice(1, -1)
  let value = ''
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === '\n' || char === '\r') return null
    if (char === '\\') {
      const next = body[index + 1]
      if (next === undefined) return null
      if (next === 'n') value += '\n'
      else if (next === 'r') value += '\r'
      else if (next === 't') value += '\t'
      else value += next
      index += 1
      continue
    }
    if (char === quote) return null
    value += char
  }
  return value
}

export function isI18nCall(expr: string): boolean {
  return /(?:^|[^\w$])(?:\$t|\$tc|\$te|\$d|\$n|i18n\.t|t)\s*\(/.test(expr)
}

export function escapeSingleQuoted(value: string): string {
  let out = ''
  for (const char of value) {
    if (char === '\\') out += '\\\\'
    else if (char === "'") out += "\\'"
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === '\t') out += '\\t'
    else if (char === '\u2028') out += '\\u2028'
    else if (char === '\u2029') out += '\\u2029'
    else out += char
  }
  return out
}

export function isIdentifier(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
}

export function compact(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine
}
