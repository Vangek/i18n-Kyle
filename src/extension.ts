import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import * as vscode from 'vscode'
import { extractChinese, extractJavaScript, ExtractError } from './extract'
import { assignKeys } from './keys'
import { parseLangFile, valueToKeyMap } from './langFile'
import { assertSafeModuleName, defaultModuleName, findProjectRoot, resolveLangRoot, toDisplayPath } from './paths'
import { applyReplacements, assertI18nFunction, buildCall, occurrenceInsert } from './replace'
import type { ChineseEntry } from './types'
import { translateWithDeepSeek } from './deepseek'
import { getWebviewHtml } from './webview'
import { writeLangModule, WriterError } from './writer'

interface Session {
  id: number
  uri: vscode.Uri
  version: number
  source: string
  projectRoot: string
  langRoot: string
  entries: ChineseEntry[]
  warnings: string[]
}

let panel: vscode.WebviewPanel | undefined
let session: Session | undefined
let sessionSeq = 0
let pendingInit: Record<string, unknown> | undefined
let extensionContext: vscode.ExtensionContext | undefined

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context
  context.subscriptions.push(
    vscode.commands.registerCommand('i18nKyle.extractFromVue', (uri?: vscode.Uri) => {
      return runExtract(uri, context)
    }),
    vscode.commands.registerCommand('i18nKyle.setDeepSeekApiKey', () => setDeepSeekApiKey(context)),
  )
}

export function deactivate(): void {
  panel?.dispose()
}

async function runExtract(uri: vscode.Uri | undefined, context: vscode.ExtensionContext): Promise<void> {
  const target = resolveSourceUri(uri)
  if (!target) {
    void vscode.window.showWarningMessage('请先打开或在资源管理器中选中一个 Vue 或 JavaScript 文件。')
    return
  }

  const document = await vscode.workspace.openTextDocument(target)
  const vueFile = isVueFile(target.fsPath)
  let extracted: ReturnType<typeof extractChinese>
  try {
    extracted = vueFile ? extractChinese(document.getText()) : extractJavaScript(document.getText())
  } catch (error) {
    void vscode.window.showErrorMessage(errorMessage(error))
    return
  }
  if (extracted.entries.length === 0) {
    const extra = extracted.warnings.length ? `\n${extracted.warnings.join('\n')}` : ''
    void vscode.window.showInformationMessage(`没有可提取的中文。${extra}`)
    return
  }

  const folder = vscode.workspace.getWorkspaceFolder(target)
  const projectRoot = findProjectRoot(target.fsPath, folder?.uri.fsPath)
  const langRoot = resolveLangRoot(target.fsPath, projectRoot)
  const moduleName = defaultModuleName(target.fsPath)
  let existing: Awaited<ReturnType<typeof readEntries>>
  let existingEnglish: Awaited<ReturnType<typeof readEntries>>
  try {
    existing = await readEntries(path.join(langRoot, moduleName, 'cn.js'))
    existingEnglish = await readEntries(path.join(langRoot, moduleName, 'en.js'))
  } catch (error) {
    void vscode.window.showErrorMessage(errorMessage(error))
    return
  }
  if (existing === null) {
    extracted.warnings.push('已有的 cn.js 不是 export default { ... }，确认写入时会停止，避免覆盖原文件。')
  }
  const currentEntries = existing ?? []
  const reserved = new Set(currentEntries.map((entry) => entry.key))
  const known = valueToKeyMap(currentEntries)
  const englishByKey = new Map((existingEnglish ?? []).map((entry) => [entry.key, entry.value]))
  const keys = assignKeys(
    extracted.entries.map((entry) => entry.zh),
    known,
    reserved,
  )

  session = {
    id: ++sessionSeq,
    uri: target,
    version: document.version,
    source: document.getText(),
    projectRoot,
    langRoot,
    entries: extracted.entries,
    warnings: extracted.warnings,
  }

  const view = ensurePanel(context)
  view.title = `提取 ${path.basename(target.fsPath)}`
  pendingInit = {
    type: 'init',
    sessionId: session.id,
    fileLabel: toDisplayPath(projectRoot, target.fsPath),
    defaultModule: moduleName,
    langRootLabel: toDisplayPath(projectRoot, langRoot),
    i18nFunction: readI18nFunction(),
    syntax: vueFile ? 'vue' : 'js',
    replaceDefault: true,
    autoTranslate: true,
    warnings: extracted.warnings,
    entries: extracted.entries.map((entry, index) => ({
      id: entry.id,
      key: keys[index],
      zh: entry.zh,
      en: englishByKey.get(keys[index]) ?? '',
      reused: known.get(entry.zh) === keys[index],
    })),
  }
  view.webview.html = getWebviewHtml(randomBytes(16).toString('hex'))
}

function ensurePanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, true)
    return panel
  }
  panel = vscode.window.createWebviewPanel('i18nKyle.extract', '提取中文', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })
  context.subscriptions.push(panel.webview.onDidReceiveMessage((message) => onMessage(message)))
  panel.onDidDispose(() => {
    panel = undefined
    session = undefined
    pendingInit = undefined
  })
  context.subscriptions.push(panel)
  return panel
}

const SOURCE_EXTENSIONS = new Set(['.vue', '.js', '.mjs', '.cjs'])

function resolveSourceUri(uri: vscode.Uri | undefined): vscode.Uri | undefined {
  if (uri && isSourceFile(uri.fsPath)) return uri
  const editor = vscode.window.activeTextEditor
  if (editor && isSourceFile(editor.document.uri.fsPath)) return editor.document.uri
  return undefined
}

function isSourceFile(file: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())
}

function isVueFile(file: string): boolean {
  return path.extname(file).toLowerCase() === '.vue'
}

async function onMessage(message: {
  type?: string
  sessionId?: number
  moduleName?: string
  replace?: boolean
  entries?: Array<{ id?: string; key?: string; en?: string }>
}): Promise<void> {
  if (message.type === 'ready') {
    if (pendingInit) void panel?.webview.postMessage(pendingInit)
    return
  }
  if (!session || message.sessionId !== session.id || !panel) return
  if (message.type === 'regenerate') {
    await regenerate(String(message.moduleName ?? ''))
    return
  }
  if (message.type === 'translate') {
    await translateEmptyEntries(message.entries ?? [])
    return
  }
  if (message.type === 'submit') {
    await submit(message)
  }
}

async function translateEmptyEntries(chosen: Array<{ id?: string }>): Promise<void> {
  if (!session || !panel) return
  const current = session
  try {
    const ids = [...new Set(chosen.map((item) => item.id).filter((id): id is string => Boolean(id)))]
    const entries = ids
      .map((id) => current.entries.find((entry) => entry.id === id))
      .filter((entry): entry is ChineseEntry => Boolean(entry))
    if (entries.length === 0) throw new Error('没有需要翻译的条目。')
    if (!extensionContext) throw new Error('扩展尚未完成初始化，请重新运行提取命令。')
    const apiKey = await extensionContext.secrets.get('i18nKyle.deepseek.apiKey')
    if (!apiKey) {
      throw new Error('尚未配置 DeepSeek API Key。请先运行命令「i18n Kyle: 设置 DeepSeek API Key」。')
    }

    const translations: Array<{ id: string; en: string }> = []
    for (const entry of entries) {
      const translation = await translateWithDeepSeek(entry.zh, apiKey)
      translations.push({ id: entry.id, en: translation })
    }
    void panel.webview.postMessage({ type: 'translations', sessionId: current.id, entries: translations })
  } catch (error) {
    const text = errorMessage(error)
    void panel.webview.postMessage({ type: 'error', message: text })
  }
}

async function setDeepSeekApiKey(context: vscode.ExtensionContext): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    title: '配置 DeepSeek 翻译',
    prompt: '输入 DeepSeek API Key',
    password: true,
    ignoreFocusOut: true,
  })
  if (apiKey === undefined) return
  if (!apiKey.trim()) {
    void vscode.window.showErrorMessage('API Key 不能为空。')
    return
  }
  await context.secrets.store('i18nKyle.deepseek.apiKey', apiKey.trim())
  void vscode.window.showInformationMessage('DeepSeek API Key 已安全保存。')
}

async function regenerate(moduleName: string): Promise<void> {
  if (!session || !panel) return
  let existingKeys = new Set<string>()
  try {
    const safeName = assertSafeModuleName(moduleName)
    const existing = await readEntries(path.join(session.langRoot, safeName, 'cn.js'))
    existingKeys = new Set((existing ?? []).map((entry) => entry.key))
  } catch {
    existingKeys = new Set()
  }
  const keys = assignKeys(
    session.entries.map((entry) => entry.zh),
    new Map(),
    existingKeys,
  )
  void panel.webview.postMessage({ type: 'keys', sessionId: session.id, keys })
}

async function submit(message: {
  moduleName?: string
  replace?: boolean
  entries?: Array<{ id?: string; key?: string; en?: string }>
}): Promise<void> {
  if (!session || !panel) return
  const current = session
  try {
    const moduleName = assertSafeModuleName(String(message.moduleName ?? ''))
    const chosen = normalizeChosen(message.entries ?? [], current.entries)
    const i18nFunction = assertI18nFunction(readI18nFunction())
    const replace = Boolean(message.replace)
    if (replace) {
      const document = await vscode.workspace.openTextDocument(current.uri)
      if (document.version !== current.version || document.getText() !== current.source) {
        throw new Error('源文件已变化，请重新执行提取。')
      }
    }
    await assertLangFilesSaved(current.langRoot, moduleName)

    const written = await writeLangModule({
      langRoot: current.langRoot,
      moduleName,
      entries: chosen.map((entry) => ({ key: entry.key, zh: entry.zh, en: entry.en })),
    })
    await adoptOpenDocument(written.cnPath, written.cnText)
    await adoptOpenDocument(written.enPath, written.enText)

    let replacedCount = 0
    if (replace) {
      const replacements = chosen.flatMap((entry) => {
        const call = buildCall(i18nFunction, moduleName, entry.key)
        return entry.occurrences.map((occurrence) => ({
          start: occurrence.start,
          end: occurrence.end,
          insert: occurrenceInsert(occurrence, call),
        }))
      })
      const next = applyReplacements(current.source, replacements)
      replacedCount = replacements.length
      const edit = new vscode.WorkspaceEdit()
      const document = await vscode.workspace.openTextDocument(current.uri)
      const full = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
      edit.replace(current.uri, full, next)
      const applied = await vscode.workspace.applyEdit(edit)
      if (!applied) throw new Error('语言文件已写入，但替换源文件失败。')
    }

    const cnLabel = toDisplayPath(current.projectRoot, written.cnPath)
    const enLabel = toDisplayPath(current.projectRoot, written.enPath)
    const replaceLabel = replace ? `，并替换了 ${replacedCount} 处文本` : ''
    const done = `已写入 ${cnLabel} 与 ${enLabel}${replaceLabel}。目录不存在时已自动创建。`
    void panel.webview.postMessage({ type: 'done', message: done })
    const action = await vscode.window.showInformationMessage(done, '打开 cn.js')
    if (action === '打开 cn.js') {
      const doc = await vscode.workspace.openTextDocument(written.cnPath)
      await vscode.window.showTextDocument(doc, { preview: false })
    }
  } catch (error) {
    const text = errorMessage(error)
    void panel.webview.postMessage({ type: 'error', message: text })
    void vscode.window.showErrorMessage(text)
  }
}

function normalizeChosen(
  chosen: Array<{ id?: string; key?: string; en?: string }>,
  entries: ChineseEntry[],
): Array<ChineseEntry & { key: string; en: string }> {
  if (chosen.length === 0) throw new Error('请至少选择一条中文。')
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const seen = new Set<string>()
  return chosen.map((item) => {
    const entry = item.id ? byId.get(item.id) : undefined
    if (!entry) throw new Error('提取结果已过期，请重新执行命令。')
    const key = String(item.key ?? '').trim()
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) || key === '__proto__') {
      throw new Error(`键名「${key || '空'}」需要是英文驼峰，例如 brandName。`)
    }
    if (seen.has(key)) throw new Error(`键名重复：${key}`)
    seen.add(key)
    return { ...entry, key, en: String(item.en ?? '') }
  })
}

async function assertLangFilesSaved(langRoot: string, moduleName: string): Promise<void> {
  const directory = path.join(langRoot, moduleName)
  for (const fileName of ['cn.js', 'en.js']) {
    const file = path.join(directory, fileName)
    const open = vscode.workspace.textDocuments.find((document) => path.resolve(document.uri.fsPath) === path.resolve(file))
    if (open?.isDirty) throw new Error(`${fileName} 有未保存的修改，请先保存后再提取。`)
  }
}

async function adoptOpenDocument(file: string, text: string): Promise<void> {
  const open = vscode.workspace.textDocuments.find((document) => path.resolve(document.uri.fsPath) === path.resolve(file))
  if (!open || open.getText() === text) return
  const edit = new vscode.WorkspaceEdit()
  const full = new vscode.Range(open.positionAt(0), open.positionAt(open.getText().length))
  edit.replace(open.uri, full, text)
  await vscode.workspace.applyEdit(edit)
}

async function readEntries(file: string) {
  try {
    const source = await fs.readFile(file, 'utf8')
    return parseLangFile(source)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return []
    throw error
  }
}

function readI18nFunction(): string {
  return vscode.workspace.getConfiguration('i18nKyle').get<string>('i18nFunction') || '$t'
}

function errorMessage(error: unknown): string {
  if (error instanceof ExtractError || error instanceof WriterError || error instanceof Error) return error.message
  return String(error)
}
