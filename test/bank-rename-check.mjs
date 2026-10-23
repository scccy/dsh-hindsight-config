/**
 * Replicates the engine's bank-id derivation exactly (dist/dsh.js):
 *   probeGitLayout → resolveProjectRoot → gitProjectName → applyTemplate
 * then shows what happens when a directory is renamed.
 *
 * Run: node bank-rename-check.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, normalize } from 'node:path'
import { tmpdir } from 'node:os'

const TEMPLATE = 'coding-agent::{gitProject}'

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()
}

/** Same shape as probeGitLayout/resolveProjectRoot: `.git` dir → its parent. */
function resolveProjectRoot(directory) {
  let commonDir
  try {
    commonDir = git(directory, ['rev-parse', '--git-common-dir'])
  } catch {
    return { status: 'absent' }
  }
  if (!commonDir) return { status: 'absent' }
  // rev-parse may answer a path relative to the directory.
  const absolute = normalize(commonDir.startsWith('.') || !/^[A-Za-z]:|^\//.test(commonDir) ? join(directory, commonDir) : commonDir)
  if (basename(absolute) === '.git') return { status: 'resolved', root: dirname(absolute) }
  return { status: 'resolved', root: absolute }
}

/** gitProjectName(directory, resolveWorktrees=true, sessionRoot) */
function gitProjectName(directory, sessionRoot = '') {
  const projectRoot = resolveProjectRoot(directory)
  if (projectRoot.status === 'resolved') return basename(projectRoot.root)
  return basename(sessionRoot || directory)
}

function deriveBankId(directory, config = {}) {
  if (config.mapPathToBank) {
    const best = Object.entries(config.mapPathToBank)
      .filter(([prefix]) => normalize(directory).startsWith(normalize(prefix)))
      .sort((a, b) => b[0].length - a[0].length)[0]
    if (best) return best[1]
  }
  const dynamic = config.dynamicBankId ?? !config.bankId
  if (!dynamic) return config.bankId
  const template = config.bankIdTemplate ?? TEMPLATE
  return template.replace('{gitProject}', gitProjectName(directory)).replace('{project}', basename(directory))
}

const root = join(tmpdir(), `bank-rename-${process.pid}`)
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })

console.log('=== 1) 普通 git 仓库 ===')
const repo = join(root, 'my-project')
mkdirSync(repo)
git(repo, ['init', '-q'])
writeFileSync(join(repo, 'a.txt'), 'x')
git(repo, ['add', '.'])
git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init'])
const before = deriveBankId(repo)
console.log(`  目录 ${basename(repo)} → bank ${before}`)

console.log('\n=== 2) 把目录改名（同一份代码、同一份 .git）===')
const renamed = join(root, 'renamed-project')
renameSync(repo, renamed)
const after = deriveBankId(renamed)
console.log(`  目录 ${basename(renamed)} → bank ${after}`)
console.log(`  ${before === after ? '不变' : '变了 → 这是一个全新的空 bank，旧记忆留在 ' + before}`)

console.log('\n=== 3) 非 git 目录（纯文件夹）===')
const plain = join(root, 'plain-folder')
mkdirSync(plain)
console.log(`  目录 ${basename(plain)} → bank ${deriveBankId(plain)}`)
const plain2 = join(root, 'plain-renamed')
renameSync(plain, plain2)
console.log(`  改名后 ${basename(plain2)} → bank ${deriveBankId(plain2)}`)

console.log('\n=== 4) 有 mapPathToBank 时（路径前缀固定）===')
console.log(`  原路径在映射内   → bank ${deriveBankId(renamed, { mapPathToBank: { [root]: 'team::shared' } })}`)
console.log(`  移出映射前缀后   → bank ${deriveBankId(join(tmpdir(), 'moved-away'), { mapPathToBank: { [root]: 'team::shared' } })}`)

console.log('\n=== 5) 固定 bankId 时（静态解析）===')
console.log(`  改名前后都是 → bank ${deriveBankId(renamed, { bankId: 'my-static-bank' })}`)

console.log('\n=== 6) 模板换成 {project} ===')
console.log(`  → bank ${deriveBankId(renamed, { bankIdTemplate: 'coding-agent::{project}' })}`)

rmSync(root, { recursive: true, force: true })
