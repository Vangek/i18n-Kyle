import {
  NodeTypes,
  parse as parseTemplate,
  type AttributeNode,
  type DirectiveNode,
  type ElementNode,
  type InterpolationNode,
  type RootNode,
  type TemplateChildNode,
  type TextNode,
} from '@vue/compiler-dom'
import { findClosingTag, scanCodeStrings } from './codeScan'
import type { ChineseEntry, ExtractResult, Occurrence } from './types'
import {
  compact,
  decodeEntities,
  hasChinese,
  isI18nCall,
  normalizeMessage,
  parsePureStringLiteral,
  trimOffsets,
} from './text'

const SKIP_ATTR = new Set(['class', 'style', 'key', 'ref', 'is', 'xmlns', 'slot'])
const SKIP_TAGS = new Set(['script', 'style'])
const SCRIPT_LANGS = new Set(['js', 'javascript', 'jsx', 'ts', 'typescript', 'tsx', 'mjs', 'cjs'])

export class ExtractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractError'
  }
}

export function extractChinese(source: string): ExtractResult {
  const blocks = sliceSfcBlocks(source)
  const template = blocks.find((block) => block.kind === 'template')
  const scripts = blocks.filter((block) => block.kind === 'script')
  if (!template && scripts.length === 0) {
    throw new ExtractError('这个 Vue 文件没有 <template> 或 <script>。')
  }
  if (template?.lang && template.lang !== 'html' && scripts.length === 0) {
    throw new ExtractError(`暂不支持 <template lang="${template.lang}">，目前只提取 HTML 模板。`)
  }

  const warnings: string[] = []
  const grouped = new Map<string, ChineseEntry>()
  let sequence = 1

  const add = (zh: string, occurrence: Occurrence) => {
    const text = zh.trim()
    if (!text || !hasChinese(text)) return
    const existing = grouped.get(text)
    if (existing) {
      existing.occurrences.push(occurrence)
      return
    }
    grouped.set(text, {
      id: `t${sequence}`,
      zh: text,
      occurrences: [occurrence],
    })
    sequence += 1
  }

  if (template && (!template.lang || template.lang === 'html')) {
    parseTemplateBlock(template, add, warnings)
  } else if (template?.lang && template.lang !== 'html') {
    warnings.push(`暂不支持 <template lang="${template.lang}">，已跳过模板。`)
  }
  for (const script of scripts) addScriptBlock(script, add, warnings)

  return {
    entries: [...grouped.values()],
    warnings: [...new Set(warnings)],
  }
}

export function extractJavaScript(source: string): ExtractResult {
  const warnings: string[] = []
  const grouped = new Map<string, ChineseEntry>()
  let sequence = 1
  const add = (zh: string, occurrence: Occurrence) => {
    const text = zh.trim()
    if (!text || !hasChinese(text)) return
    const existing = grouped.get(text)
    if (existing) {
      existing.occurrences.push(occurrence)
      return
    }
    grouped.set(text, { id: `t${sequence}`, zh: text, occurrences: [occurrence] })
    sequence += 1
  }
  addCode(source, 0, add, warnings)
  return {
    entries: [...grouped.values()],
    warnings: [...new Set(warnings)],
  }
}

function parseTemplateBlock(
  template: SfcBlock,
  add: (zh: string, occurrence: Occurrence) => void,
  warnings: string[],
): void {
  let ast: RootNode
  try {
    ast = parseTemplate(template.content, { comments: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ExtractError(`template 解析失败：${message}`)
  }
  const base = template.offset
  const abs = (offset: number) => base + offset

  const walk = (node: RootNode | TemplateChildNode, preserveIndent: boolean) => {
    if (node.type === NodeTypes.ROOT) {
      for (const child of node.children) walk(child, preserveIndent)
      return
    }
    if (node.type === NodeTypes.ELEMENT) {
      walkElement(node, preserveIndent)
      return
    }
    if (node.type === NodeTypes.TEXT) {
      handleText(node, preserveIndent)
      return
    }
    if (node.type === NodeTypes.INTERPOLATION) {
      handleInterpolation(node)
    }
  }

  const walkElement = (node: ElementNode, preserveIndent: boolean) => {
    if (SKIP_TAGS.has(node.tag)) return
    const nextPreserve = preserveIndent || node.tag === 'pre' || node.tag === 'textarea'
    for (const prop of node.props) {
      if (prop.type === NodeTypes.ATTRIBUTE) handleAttribute(prop)
      else if (prop.type === NodeTypes.DIRECTIVE) handleDirective(prop)
    }
    for (const child of node.children) walk(child, nextPreserve)
  }

  const handleText = (node: TextNode, preserveIndent: boolean) => {
    const raw = node.loc.source
    const trimmed = trimOffsets(raw)
    if (!trimmed) return
    const zh = normalizeMessage(decodeEntities(raw.slice(trimmed.start, trimmed.end)), preserveIndent)
    add(zh, {
      kind: 'text',
      start: abs(node.loc.start.offset + trimmed.start),
      end: abs(node.loc.start.offset + trimmed.end),
    })
  }

  const handleAttribute = (attr: AttributeNode) => {
    if (!attr.value || SKIP_ATTR.has(attr.name)) return
    const zh = normalizeMessage(decodeEntities(attr.value.content), false)
    add(zh, {
      kind: 'attr',
      name: attr.name,
      start: abs(attr.loc.start.offset),
      end: abs(attr.loc.end.offset),
    })
  }

  const handleDirective = (directive: DirectiveNode) => {
    const expression = directive.exp
    if (!expression || expression.type !== NodeTypes.SIMPLE_EXPRESSION) return
    considerExpression(expression.content, {
      kind: 'expr',
      start: abs(expression.loc.start.offset),
      end: abs(expression.loc.end.offset),
    })
  }

  const handleInterpolation = (node: InterpolationNode) => {
    if (node.content.type !== NodeTypes.SIMPLE_EXPRESSION) return
    considerExpression(node.content.content, {
      kind: 'interpolation',
      start: abs(node.loc.start.offset),
      end: abs(node.loc.end.offset),
    })
  }

  const considerExpression = (expr: string, occurrence: Occurrence) => {
    if (!hasChinese(expr)) return
    const literal = parsePureStringLiteral(expr.trim())
    if (literal != null) {
      add(normalizeMessage(literal, false), occurrence)
      return
    }
    if (isI18nCall(expr)) return
    warnings.push(`复杂表达式中的中文未提取：${compact(expr)}`)
  }

  walk(ast, false)
}

function addScriptBlock(
  script: SfcBlock,
  add: (zh: string, occurrence: Occurrence) => void,
  warnings: string[],
): void {
  const lang = (script.lang ?? '').toLowerCase()
  if (lang && !SCRIPT_LANGS.has(lang)) {
    warnings.push(`暂不支持 <script lang="${script.lang}">，已跳过。`)
    return
  }
  addCode(script.content, script.offset, add, warnings)
}

function addCode(
  content: string,
  offset: number,
  add: (zh: string, occurrence: Occurrence) => void,
  warnings: string[],
): void {
  const scanned = scanCodeStrings(content)
  for (const hit of scanned.hits) {
    add(hit.value, { kind: 'code', start: offset + hit.start, end: offset + hit.end })
  }
  warnings.push(...scanned.warnings)
}

interface SfcBlock {
  kind: 'template' | 'script'
  content: string
  offset: number
  lang: string | null
}

function sliceSfcBlocks(source: string): SfcBlock[] {
  const blocks: SfcBlock[] = []
  let index = 0
  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4)
      index = end < 0 ? source.length : end + 3
      continue
    }
    if (source[index] !== '<') {
      index += 1
      continue
    }
    const tag = readTag(source, index)
    if (!tag || tag.closing || (tag.tag !== 'template' && tag.tag !== 'script' && tag.tag !== 'style')) {
      index += 1
      continue
    }
    const contentEnd = tag.tag === 'script'
      ? findClosingTag(source, tag.end, 'script')
      : findTagEnd(source, tag.end, tag.tag)
    if (contentEnd < 0) return blocks
    if (tag.tag === 'template' || tag.tag === 'script') {
      blocks.push({
        kind: tag.tag,
        content: source.slice(tag.end, contentEnd),
        offset: tag.end,
        lang: readLang(tag.attrs),
      })
    }
    const closer = readTag(source, contentEnd)
    index = closer?.end ?? contentEnd
  }
  return blocks
}

function findTagEnd(source: string, contentStart: number, tagName: string): number {
  let depth = 1
  let index = contentStart
  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4)
      index = end < 0 ? source.length : end + 3
      continue
    }
    if (source[index] !== '<') {
      index += 1
      continue
    }
    const tag = readTag(source, index)
    if (!tag || tag.tag !== tagName) {
      index += 1
      continue
    }
    if (tag.closing) {
      depth -= 1
      if (depth === 0) return index
    } else {
      depth += 1
    }
    index = tag.end
  }
  return -1
}

function readTag(
  source: string,
  start: number,
): { closing: boolean; tag: string; attrs: string; end: number } | null {
  if (source[start] !== '<') return null
  let index = start + 1
  let closing = false
  if (source[index] === '/') {
    closing = true
    index += 1
  }
  if (!/[A-Za-z]/.test(source[index] ?? '')) return null
  const nameStart = index
  while (index < source.length && /[\w:-]/.test(source[index])) index += 1
  const tag = source.slice(nameStart, index).toLowerCase()
  if (closing) {
    while (index < source.length && /\s/.test(source[index])) index += 1
    if (source[index] !== '>') return null
    return { closing: true, tag, attrs: '', end: index + 1 }
  }
  const attrStart = index
  let quote: string | null = null
  while (index < source.length) {
    const char = source[index]
    if (quote) {
      if (char === quote) quote = null
      index += 1
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      index += 1
      continue
    }
    if (char === '>') return { closing: false, tag, attrs: source.slice(attrStart, index), end: index + 1 }
    index += 1
  }
  return null
}

function readLang(attrs: string): string | null {
  const matched = /\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attrs)
  return matched?.[1] ?? matched?.[2] ?? matched?.[3] ?? null
}
