/**
 * What bank id does a Chinese directory name produce, and does the engine
 * transform it at all?
 *
 * Run: node chinese-bank-id.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, normalize } from 'node:path'
import { tmpdir } from 'node:os'

const TEMPLATE = 'coding-agent::{gitProject}'

function resolveProjectRoot(directory) {
  let commonDir
  try {
    commonDir = execFileSync('git', ['-C', directory, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return { status: 'absent' }
  }
  if (!commonDir) return { status: 'absent' }
  const absolute = normalize(/^[A-Za-z]:|^\//.test(commonDir) ? commonDir : join(directory, commonDir))
  return basename(absolute) === '.git' ? { status: 'resolved', root: dirname(absolute) } : { status: 'resolved', root: absolute }
}

function gitProjectName(directory) {
  const root = resolveProjectRoot(directory)
  return root.status === 'resolved' ? basename(root.root) : basename(directory)
}

function bankId(directory, template = TEMPLATE) {
  return template.replace('{gitProject}', gitProjectName(directory)).replace('{project}', basename(directory))
}

const root = join(tmpdir(), `cjk-${process.pid}`)
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })

const cases = [
  ['git 仓库：dsh-插件开发', 'dsh-插件开发', true],
  ['纯文件夹：dsh-插件开发', 'dsh-插件开发', false],
  ['带空格：dsh 插件开发', 'dsh 插件开发', false],
  ['带斜杠感的：dsh/插件', 'dsh-插件', false],
]

for (const [label, name, useGit] of cases) {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  if (useGit) {
    execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' })
    writeFileSync(join(dir, 'a.txt'), 'x')
  }
  const id = bankId(dir)
  console.log(`${label}`)
  console.log(`  目录 basename = ${JSON.stringify(basename(dir))}`)
  console.log(`  bank id       = ${JSON.stringify(id)}`)
  console.log(`  URL 编码后    = ${encodeURIComponent(id)}`)
  console.log('')
}

rmSync(root, { recursive: true, force: true })
