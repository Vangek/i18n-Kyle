const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const root = path.join(__dirname, '..')
const manifestPath = path.join(root, 'package.json')

const targets = {
  vscode: { publisher: 'KaiWang', fileName: 'vscode' },
  cursor: { publisher: 'Vangek', fileName: 'cursor' },
}

async function main() {
  const target = await resolveTarget(process.argv[2])
  const selected = targets[target]
  const original = fs.readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(original)
  const output = path.join(root, `${manifest.name}-${selected.fileName}-${manifest.version}.vsix`)

  manifest.publisher = selected.publisher
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  try {
    console.log(`正在打包 ${target}，publisher 为 ${selected.publisher}`)
    run('npm', ['run', 'build'])
    run('npx', [
      'vsce',
      'package',
      '--no-dependencies',
      '--allow-missing-repository',
      '--no-rewrite-relative-links',
      '--out',
      output,
    ])
    console.log(`已生成 ${path.basename(output)}`)
  } finally {
    fs.writeFileSync(manifestPath, original)
  }
}

async function resolveTarget(argument) {
  const fromArgument = normalize(argument)
  if (fromArgument) return fromArgument
  if (!process.stdin.isTTY) {
    throw new Error('请指定打包目标：node scripts/package-target.js vscode 或 cursor')
  }

  const answer = await question(
    [
      '打包前请确认目标商店：',
      '  vscode  publisher: KaiWang',
      '  cursor  publisher: Vangek',
      '请输入 vscode 或 cursor：',
    ].join('\n'),
  )
  const target = normalize(answer)
  if (!target) throw new Error('只能输入 vscode 或 cursor。')
  return target
}

function normalize(value) {
  const text = String(value || '').trim().toLowerCase()
  if (text === '1' || text === 'vscode' || text === 'vs code') return 'vscode'
  if (text === '2' || text === 'cursor') return 'cursor'
  return ''
}

function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${prompt} `, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
