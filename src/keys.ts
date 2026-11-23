import { pinyin } from 'pinyin-pro'

const MAX_CHARS = 6

export function toBaseKey(text: string): string {
  const characters = Array.from(text)
  const chinese = characters.filter((char) => /[\u4e00-\u9fff]/.test(char))
  const chars = (chinese.length > 0 ? chinese : characters.filter((char) => /[A-Za-z0-9]/.test(char))).slice(0, MAX_CHARS)
  if (chars.length === 0) return 'text'

  let key = ''
  let isFirst = true
  for (const char of chars) {
    const part = /[\u4e00-\u9fff]/.test(char) ? chinesePart(char) : char
    const clean = part.replace(/[^A-Za-z0-9]/g, '')
    if (!clean) continue
    key += isFirst ? clean.toLowerCase() : clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()
    isFirst = false
  }

  key = key.replace(/[^A-Za-z0-9_$]/g, '')
  if (!key) return 'text'
  if (!/^[A-Za-z_$]/.test(key)) key = `t${key}`
  return key
}

function chinesePart(char: string): string {
  const result = pinyin(char, { toneType: 'none', type: 'string', nonZh: 'removed' })
  return result
    .replace(/ü/gi, 'v')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
}

export function uniqueKey(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base}${index}`)) index += 1
  return `${base}${index}`
}

export function assignKeys(
  texts: string[],
  valueToKey: Map<string, string>,
  reserved: Set<string>,
): string[] {
  const used = new Set(reserved)
  const keys: string[] = []
  for (const text of texts) {
    const reused = valueToKey.get(text)
    if (reused) {
      keys.push(reused)
      used.add(reused)
      continue
    }
    const key = uniqueKey(toBaseKey(text), used)
    used.add(key)
    keys.push(key)
  }
  return keys
}
