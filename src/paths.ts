import fs from 'fs'
import path from 'path'

export function findProjectRoot(vueFile: string, workspaceRoot?: string): string {
  if (workspaceRoot) return path.resolve(workspaceRoot)
  let dir = path.dirname(path.resolve(vueFile))
  const stop = path.parse(dir).root
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, 'src'))) {
      return dir
    }
    if (dir === stop) return path.dirname(path.resolve(vueFile))
    const parent = path.dirname(dir)
    if (parent === dir) return dir
    dir = parent
  }
}

/** 优先使用 Vue 文件所在的最近一层 src，否则在项目根下创建 src。 */
export function resolveLangRoot(vueFile: string, projectRoot: string): string {
  const root = path.resolve(projectRoot)
  let dir = path.dirname(path.resolve(vueFile))
  while (dir === root || dir.startsWith(root + path.sep)) {
    if (path.basename(dir) === 'src') return path.join(dir, 'i18n', 'lang')
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.join(root, 'src', 'i18n', 'lang')
}

export function defaultModuleName(vueFile: string): string {
  const fileName = path.basename(vueFile, path.extname(vueFile))
  const raw = fileName.toLowerCase() === 'index' ? path.basename(path.dirname(vueFile)) : fileName
  if (/^[A-Z][A-Za-z0-9]*$/.test(raw)) {
    return raw.charAt(0).toLowerCase() + raw.slice(1)
  }
  return raw
}

export function assertSafeModuleName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('文件名不能为空。')
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    throw new Error('文件名不能包含路径。')
  }
  if (!/^[\w\u4e00-\u9fff][\w\u4e00-\u9fff.-]*$/.test(trimmed)) {
    throw new Error('文件名只能包含字母、数字、中文、下划线、连字符和点。')
  }
  return trimmed
}

export function toDisplayPath(projectRoot: string, target: string): string {
  const relative = path.relative(projectRoot, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return target
  return relative.split(path.sep).join('/')
}
