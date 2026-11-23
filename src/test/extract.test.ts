import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { extractChinese, ExtractError } from '../extract'
import { assignKeys, toBaseKey } from '../keys'
import { mergeEntries, parseLangFile, serializeLang } from '../langFile'
import { assertSafeModuleName, defaultModuleName, findProjectRoot, resolveLangRoot } from '../paths'
import { applyReplacements, buildCall, occurrenceInsert } from '../replace'
import { planLangFiles, writeLangModule, WriterError } from '../writer'
import { getWebviewHtml } from '../webview'

const vueSource = [
  '<template>',
  '  <footer>',
  '    <h1 class="品牌">伊伊之</h1>',
  '    <p class="caption">旅行计划</p>',
  '    <p>',
  '      世界很大，值得亲自感受。',
  '      让每一趟旅行，都有值得期待的体验。',
  '    </p>',
  '    <button title="开始探索">开始探索</button>',
  '    <input placeholder="请输入目的地" />',
  '    <span :alt="\'热门目的地\'">{{ \'简体中文\' }}</span>',
  '    <small>© {year} voyage 伊伊之</small>',
  '    <!-- 注释里的中文不要 -->',
  '    <p>{{ count }} 个目的地</p>',
  '    <p :title="isEn ? \'中文标题\' : name">已国际化</p>',
  '  </footer>',
  '</template>',
  '<script setup>',
  "const msg = '脚本里的中文不要提取'",
  '</script>',
  '',
].join('\n')

test('提取 template 中文，并忽略 script、注释和 class', () => {
  const result = extractChinese(vueSource)
  const texts = result.entries.map((entry) => entry.zh)
  assert.deepEqual(texts, [
    '伊伊之',
    '旅行计划',
    '世界很大，值得亲自感受。\n让每一趟旅行，都有值得期待的体验。',
    '开始探索',
    '请输入目的地',
    '热门目的地',
    '简体中文',
    '© {year} voyage 伊伊之',
    '个目的地',
    '已国际化',
  ])
  const explore = result.entries.find((entry) => entry.zh === '开始探索')
  assert.equal(explore?.occurrences.length, 2)
  assert.deepEqual(result.warnings, ["复杂表达式中的中文未提取：isEn ? '中文标题' : name"])
  assert.equal(texts.some((text) => text.includes('脚本') || text.includes('注释') || text === '品牌'), false)
})

test('相同中文共用一个键，并按原文位置替换', () => {
  const result = extractChinese(vueSource)
  const keys = assignKeys(
    result.entries.map((entry) => entry.zh),
    new Map(),
    new Set(),
  )
  assert.equal(toBaseKey('开始探索'), 'kaiShiTanSuo')
  assert.equal(toBaseKey('旅行计划'), 'lvXingJiHua')
  assert.equal(toBaseKey('© {year} voyage 伊伊之'), 'yiYiZhi')
  const replacements = result.entries.flatMap((entry, index) => {
    const call = buildCall('$t', 'footer', keys[index])
    return entry.occurrences.map((occurrence) => ({
      start: occurrence.start,
      end: occurrence.end,
      insert: occurrenceInsert(occurrence, call),
    }))
  })
  const next = applyReplacements(vueSource, replacements)
  assert.match(next, /<button :title="\$t\('footer\.kaiShiTanSuo'\)">\{\{ \$t\('footer\.kaiShiTanSuo'\) \}\}<\/button>/)
  assert.match(next, /<input :placeholder="\$t\('footer\.qingShuRuMuDeDi'\)" \/>/)
  assert.match(next, /:alt="\$t\('footer\.reMenMuDeDi'\)"/)
  assert.match(next, /\{\{ \$t\('footer\.jianTiZhongWen'\) \}\}/)
  assert.match(next, /class="品牌"/)
  assert.match(next, /脚本里的中文不要提取/)
  assert.match(next, /注释里的中文不要/)
  assert.match(next, /中文标题/)
  assert.doesNotMatch(next, />伊伊之</)
  assert.doesNotMatch(next, /开始探索/)
})

test('多行中文会收成一条，并保留换行', () => {
  const source = `<template>\n  <p>\n    第一行中文\n    第二行中文\n  </p>\n</template>\n`
  const result = extractChinese(source)
  assert.deepEqual(
    result.entries.map((entry) => entry.zh),
    ['第一行中文\n第二行中文'],
  )
})

test('script 中的模板字符串和嵌套 template 不会切错', () => {
  const source = [
    '<script setup lang="ts" generic="T extends Record<string, string>">',
    "const example = '<template>脚本里的模板中文</template>'",
    '</script>',
    '<template>',
    '  <template v-if="show">',
    '    <span>真正的中文</span>',
    '  </template>',
    '</template>',
    '',
  ].join('\n')
  const result = extractChinese(source)
  assert.deepEqual(
    result.entries.map((entry) => entry.zh),
    ['真正的中文'],
  )
})

test('没有 template、或不是 HTML 模板时给出明确错误', () => {
  assert.throws(() => extractChinese('<script>const a = "中文"</script>\n'), ExtractError)
  assert.throws(() => extractChinese('<template lang="pug">\np 中文\n</template>\n'), /pug/)
})

test('语言文件格式与 cn.js / en.js 示例一致', () => {
  const source = serializeLang([
    { key: 'brandName', value: '伊伊之' },
    { key: 'brandCaption', value: '旅行计划' },
    { key: 'description', value: '世界很大，值得亲自感受。\n让每一趟旅行，都有值得期待的体验。' },
    { key: 'tagline', value: "发现灵感 · 对话调整 · 保存计划" },
  ])
  assert.equal(
    source,
    [
      'export default {',
      "  brandName: '伊伊之',",
      "  brandCaption: '旅行计划',",
      "  description: '世界很大，值得亲自感受。\\n让每一趟旅行，都有值得期待的体验。',",
      "  tagline: '发现灵感 · 对话调整 · 保存计划'",
      '}',
      '',
    ].join('\n'),
  )
  assert.deepEqual(parseLangFile(source), [
    { key: 'brandName', value: '伊伊之' },
    { key: 'brandCaption', value: '旅行计划' },
    { key: 'description', value: '世界很大，值得亲自感受。\n让每一趟旅行，都有值得期待的体验。' },
    { key: 'tagline', value: '发现灵感 · 对话调整 · 保存计划' },
  ])
})

test('合并时保留已有翻译，空英文可以被补上，中文冲突会拦住', () => {
  const existing = parseLangFile("export default {\n  // keep\n  brandName: \"伊伊之\",\n  explore: 'Start'\n};\n")
  assert.ok(existing)
  const merged = mergeEntries(
    existing,
    [
      { key: 'brandName', value: '伊伊之' },
      { key: 'explore', value: '开始探索' },
      { key: 'help', value: '使用帮助' },
    ],
    { strict: true },
  )
  assert.equal(merged.conflicts.length, 1)
  assert.equal(merged.conflicts[0].key, 'explore')
  assert.deepEqual(
    merged.entries.map((entry) => entry.key),
    ['brandName', 'explore', 'help'],
  )

  const english = mergeEntries(
    [
      { key: 'explore', value: '' },
      { key: 'help', value: 'Help' },
    ],
    [
      { key: 'explore', value: 'Explore' },
      { key: 'help', value: 'Assistance' },
    ],
    { strict: false, fillEmpty: true },
  )
  assert.deepEqual(english.entries, [
    { key: 'explore', value: 'Explore' },
    { key: 'help', value: 'Help' },
  ])
  assert.equal(english.conflicts.length, 0)
})

test('缺少 src/i18n/lang 时会按文件名创建 cn.js 和 en.js', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-kyle-'))
  const langRoot = path.join(root, 'src', 'i18n', 'lang')
  const written = await writeLangModule({
    langRoot,
    moduleName: 'footer',
    entries: [
      { key: 'brandName', zh: '伊伊之', en: '' },
      { key: 'explore', zh: '开始探索', en: 'Explore' },
    ],
  })
  assert.equal(written.cnPath, path.join(langRoot, 'footer', 'cn.js'))
  const cn = await fs.readFile(written.cnPath, 'utf8')
  const en = await fs.readFile(written.enPath, 'utf8')
  assert.match(cn, /brandName: '伊伊之'/)
  assert.match(en, /explore: 'Explore'/)
  assert.match(en, /brandName: ''/)

  await assert.rejects(
    () =>
      writeLangModule({
        langRoot,
        moduleName: 'footer',
        entries: [{ key: 'brandName', zh: '另一个名字', en: '' }],
      }),
    WriterError,
  )
  const still = await fs.readFile(written.cnPath, 'utf8')
  assert.match(still, /伊伊之/)
  assert.doesNotMatch(still, /另一个名字/)
})

test('无法解析的旧文件不会被覆盖', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-kyle-'))
  const dir = path.join(root, 'src', 'i18n', 'lang', 'footer')
  await fs.mkdir(dir, { recursive: true })
  const cnPath = path.join(dir, 'cn.js')
  const original = 'export const messages = { brandName: "伊伊之" }\n'
  await fs.writeFile(cnPath, original, 'utf8')
  assert.throws(
    () =>
      planLangFiles({
        langRoot: path.join(root, 'src', 'i18n', 'lang'),
        moduleName: 'footer',
        cnSource: original,
        enSource: null,
        entries: [{ key: 'brandName', zh: '伊伊之', en: '' }],
      }),
    /停止写入/,
  )
  assert.equal(await fs.readFile(cnPath, 'utf8'), original)
})

test('模块名默认取 Vue 文件名，index 则取父目录', () => {
  assert.equal(defaultModuleName('/app/src/components/Footer.vue'), 'footer')
  assert.equal(defaultModuleName('/app/src/components/UserProfile.vue'), 'userProfile')
  assert.equal(defaultModuleName('/app/src/components/user-profile.vue'), 'user-profile')
  assert.equal(defaultModuleName('/app/src/components/footer/index.vue'), 'footer')
  assert.throws(() => assertSafeModuleName('../footer'), /路径/)
  assert.throws(() => assertSafeModuleName(''), /不能为空/)
  assert.equal(assertSafeModuleName(' footer '), 'footer')
})

test('语言目录优先落在 Vue 文件所属的 src 下', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-kyle-proj-'))
  const vueFile = path.join(root, 'packages', 'web', 'src', 'views', 'Footer.vue')
  await fs.mkdir(path.dirname(vueFile), { recursive: true })
  assert.equal(findProjectRoot(vueFile), path.join(root, 'packages', 'web'))
  assert.equal(resolveLangRoot(vueFile, root), path.join(root, 'packages', 'web', 'src', 'i18n', 'lang'))

  const outside = path.join(root, 'legacy', 'Footer.vue')
  assert.equal(resolveLangRoot(outside, root), path.join(root, 'src', 'i18n', 'lang'))
})

test('提取面板页面包含命令需要的控件', () => {
  const html = getWebviewHtml('nonce123')
  assert.match(html, /nonce-nonce123/)
  assert.match(html, /acquireVsCodeApi/)
  assert.match(html, /写入语言文件/)
  assert.match(html, /语言文件名/)
  assert.match(html, /AI 翻译空英文/)
})

test('已有中文会复用原来的键', () => {
  const keys = assignKeys(
    ['伊伊之', '开始探索'],
    new Map([['伊伊之', 'brandName']]),
    new Set(['brandName']),
  )
  assert.deepEqual(keys, ['brandName', 'kaiShiTanSuo'])
})
