import fs from 'fs/promises'
import path from 'path'
import { mergeEntries, parseLangFile, serializeLang } from './langFile'
import { assertSafeModuleName } from './paths'
import type { LangEntry } from './types'

export class WriterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WriterError'
  }
}

export interface PlannedLangFiles {
  directory: string
  cnPath: string
  enPath: string
  cnText: string
  enText: string
}

export function planLangFiles(options: {
  langRoot: string
  moduleName: string
  cnSource: string | null
  enSource: string | null
  entries: Array<{ key: string; zh: string; en: string }>
}): PlannedLangFiles {
  const moduleName = assertSafeModuleName(options.moduleName)
  const directory = path.join(options.langRoot, moduleName)
  const cnExisting = readExisting(options.cnSource, 'cn.js')
  const enExisting = readExisting(options.enSource, 'en.js')
  const cnMerged = mergeEntries(
    cnExisting,
    options.entries.map((entry) => ({ key: entry.key, value: entry.zh })),
    { strict: true },
  )
  if (cnMerged.conflicts.length > 0) {
    const detail = cnMerged.conflicts
      .map((conflict) => `${conflict.key}：已有「${preview(conflict.existing)}」，本次是「${preview(conflict.incoming)}」`)
      .join('\n')
    throw new WriterError(`这些键已存在且中文不同，请修改键名后再写入：\n${detail}`)
  }
  const enMerged = mergeEntries(
    enExisting,
    options.entries.map((entry) => ({ key: entry.key, value: entry.en })),
    { strict: false, fillEmpty: true },
  )
  return {
    directory,
    cnPath: path.join(directory, 'cn.js'),
    enPath: path.join(directory, 'en.js'),
    cnText: serializeLang(cnMerged.entries),
    enText: serializeLang(enMerged.entries),
  }
}

function readExisting(source: string | null, fileName: string): LangEntry[] {
  if (source == null) return []
  const parsed = parseLangFile(source)
  if (!parsed) {
    throw new WriterError(`已存在 ${fileName}，但内容不是 export default { ... }，已停止写入，避免覆盖。`)
  }
  return parsed
}

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ')
  return oneLine.length > 24 ? `${oneLine.slice(0, 24)}…` : oneLine
}

export async function writeLangModule(options: {
  langRoot: string
  moduleName: string
  entries: Array<{ key: string; zh: string; en: string }>
}): Promise<PlannedLangFiles> {
  const moduleName = assertSafeModuleName(options.moduleName)
  const directory = path.join(options.langRoot, moduleName)
  const cnPath = path.join(directory, 'cn.js')
  const enPath = path.join(directory, 'en.js')
  const plan = planLangFiles({
    langRoot: options.langRoot,
    moduleName,
    cnSource: await readFileIfExists(cnPath),
    enSource: await readFileIfExists(enPath),
    entries: options.entries,
  })
  await fs.mkdir(plan.directory, { recursive: true })
  await fs.writeFile(plan.cnPath, plan.cnText, 'utf8')
  await fs.writeFile(plan.enPath, plan.enText, 'utf8')
  return plan
}

async function readFileIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    throw error
  }
}
