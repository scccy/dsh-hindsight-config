/**
 * Exercises the plugin's OWN /aliases route end-to-end against a THROWAWAY bank.
 *
 * The bank is created and deleted directly through the Hindsight API (our panel
 * deliberately has no "create bank" operation), and every alias operation goes
 * through the plugin's Host route — the same code path the panel uses.
 *
 * Run: node test/alias-roundtrip.mjs [apiUrl]
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

const override = process.argv[2]
if (override) process.env.HINDSIGHT_CONFIG = process.env.HINDSIGHT_CONFIG || ''

const routes = new Map()
apply({
  effect(fn) {
    fn()
  },
  get() {
    return undefined
  },
  inject(_services, callback) {
    callback({
      webServer: {
        getOrigin: () => 'http://127.0.0.1:1',
        register(route) {
          routes.set(route.path, route.handler)
          return () => {}
        },
      },
    })
  },
})

/** Call one of the plugin's Host routes. */
function call(path, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const handler = routes.get(`/hindsight-config/api${path.split('?')[0]}`)
    if (!handler) return reject(new Error(`no route for ${path}`))
    const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
    const req = {
      method,
      url: `/hindsight-config/api${path}`,
      headers: { host: '127.0.0.1:1' },
      async *[Symbol.asyncIterator]() {
        for (const chunk of payload) yield chunk
      },
    }
    const chunks = []
    handler(req, {
      writeHead() {},
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk))
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed
        try {
          parsed = text ? JSON.parse(text) : null
        } catch {
          parsed = text
        }
        resolve(parsed)
      },
    }).catch(reject)
  })
}

const state = await call('/state')
const apiUrl = String(state.effective.apiUrl || '').replace(/\/+$/, '')
const stamp = Date.now().toString(36)
const bank = `zz-alias-test-${stamp}`
const alias = `zz-测试-插件开发-${stamp}`

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`)
}

const direct = async (method, path, body) => {
  const response = await fetch(apiUrl + path, {
    method,
    headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  const text = await response.text()
  try {
    return { status: response.status, body: text ? JSON.parse(text) : null }
  } catch {
    return { status: response.status, body: text }
  }
}

const enc = encodeURIComponent
try {
  console.log(`API: ${apiUrl}`)
  console.log(`临时 bank: ${bank}\n临时 alias: ${alias}\n`)

  const created = await direct('PUT', `/v1/default/banks/${enc(bank)}`, {})
  check(`准备：建临时 bank (${created.status})`, created.status === 200 || created.status === 201, created.body)
  if (created.status !== 200 && created.status !== 201) throw new Error('cannot create the throwaway bank')

  console.log('\n1) 面板路由：读取别名（初始为空）')
  const empty = await call(`/aliases?bankId=${enc(bank)}`)
  check('ok 且为空', empty?.ok === true && (empty.aliases || []).length === 0, empty)

  console.log('\n2) 面板路由：添加中文别名')
  const added = await call('/aliases', { method: 'POST', body: { bankId: bank, alias, primary: false } })
  check('添加成功', added?.ok === true, added)

  console.log('\n3) 面板路由：再读一次，别名在列表里')
  const listed = await call(`/aliases?bankId=${enc(bank)}`)
  check('列表含该别名', (listed?.aliases || []).some((entry) => entry.alias === alias), listed)

  console.log('\n4) 别名真的能到达这个 bank')
  const viaAlias = await direct('GET', `/v1/default/banks/${enc(alias)}/stats`)
  check('别名解析到原 bank', viaAlias.status === 200 && viaAlias.body?.bank_id === bank, viaAlias.body?.bank_id)

  console.log('\n5) 面板路由：设为显示名（primary）')
  const primary = await call('/aliases', { method: 'PATCH', body: { bankId: bank, alias, primary: true } })
  check('PATCH 成功', primary?.ok === true, primary)
  const afterPrimary = await call(`/aliases?bankId=${enc(bank)}`)
  check('primary 已生效', (afterPrimary?.aliases || []).some((entry) => entry.alias === alias && entry.primary === true), afterPrimary)

  console.log('\n6) 面板路由：删除别名')
  const removedAlias = await call(`/aliases?bankId=${enc(bank)}&alias=${enc(alias)}`, { method: 'DELETE' })
  check('删除成功', removedAlias?.ok === true, removedAlias)
  const gone = await direct('GET', `/v1/default/banks/${enc(alias)}/stats`)
  check('别名已不可用', gone.status === 404, gone.status)

  console.log('\n7) 面板路由的错误处理：缺 bankId / 空别名 / 重复别名')
  const noBank = await call('/aliases')
  check('缺 bankId → ok:false', noBank?.ok === false, noBank)
  const blank = await call('/aliases', { method: 'POST', body: { bankId: bank, alias: '   ' } })
  check('空别名 → ok:false', blank?.ok === false, blank)
  await call('/aliases', { method: 'POST', body: { bankId: bank, alias: `dup-${stamp}` } })
  const dup = await call('/aliases', { method: 'POST', body: { bankId: bank, alias: `dup-${stamp}` } })
  check('重复别名 → 服务端拒绝并回传原因', dup?.ok === false && Boolean(dup?.error), dup)
} finally {
  const cleanup = await direct('DELETE', `/v1/default/banks/${enc(bank)}`)
  console.log(`\n清理：DELETE 临时 bank → ${cleanup.status}`)
  const left = await direct('GET', `/v1/default/banks/${enc(bank)}/stats`)
  check('临时 bank 已不存在', left.status === 404, left.status)
}

console.log(failures === 0 ? '\nALIAS ROUTE OK' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
