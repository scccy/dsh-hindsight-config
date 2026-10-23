/**
 * End-to-end test of the panel's mental-model routes against a THROWAWAY bank,
 * with HINDSIGHT_CONFIG pointed at a throwaway config file.
 *
 * The point that matters: editing a SEEDED page's source_query must land in the
 * server AND in the client config, because the engine re-pushes the config every
 * session. `clear` is used for the action endpoint (fast, no LLM); refresh and
 * dry-run are thin passthroughs that would call the model.
 *
 * Run: node test/mental-model-routes.mjs
 */
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

const apiUrl = process.argv[2] || 'http://127.0.0.1:8888'
const dir = await mkdtemp(join(tmpdir(), 'dhc-mm-'))
const configPath = join(dir, 'coding-agent.json')
process.env.HINDSIGHT_CONFIG = configPath
await writeFile(configPath, JSON.stringify({ apiUrl, serverMode: 'self-hosted' }, null, 2), 'utf8')

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
        try {
          resolve(text ? JSON.parse(text) : null)
        } catch {
          resolve(text)
        }
      },
    }).catch(reject)
  })
}

const direct = async (method, path, body) => {
  const response = await fetch(apiUrl + path, {
    method,
    headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  const text = await response.text()
  try {
    return { status: response.status, body: text ? JSON.parse(text) : null }
  } catch {
    return { status: response.status, body: text }
  }
}

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`)
}

const stamp = Date.now().toString(36)
const bank = `zz-mm-route-${stamp}`
const enc = encodeURIComponent

try {
  console.log(`临时 bank: ${bank}\n临时配置: ${configPath}\n`)
  await direct('PUT', `/v1/default/banks/${enc(bank)}`, {})

  console.log('1) 像引擎一样建一张【内置页名】的知识页')
  const made = await direct('POST', `/v1/default/banks/${enc(bank)}/knowledge-base/pages`, {
    name: 'Component map',
    source_query: 'Original taxonomy question.',
    tags: ['knowledge:component'],
    trigger: { mode: 'delta', refresh_cron: '17 * * * *' },
  })
  check(`创建成功 (${made.status})`, made.status === 201, made.body)

  console.log('\n2) 面板路由：列表 + 识别为内置页')
  const listed = await call(`/mental-models?bankId=${enc(bank)}`)
  check('ok', listed?.ok === true, listed)
  const model = (listed?.models || [])[0]
  check('有一个心智模型', Boolean(model), listed?.models)
  check('被标记为内置页', model?.isTaxonomy === true, model)
  check('返回 taxonomy 清单', (listed?.taxonomy || []).length === 5, listed?.taxonomy)

  console.log('\n3) 面板路由：改内置页 source_query → 服务端 + 客户端配置都要变')
  const patched = await call('/mental-model', { method: 'PATCH', body: { bankId: bank, id: model.id, sourceQuery: 'REWRITTEN-BY-PANEL.' } })
  check('PATCH ok', patched?.ok === true, patched)
  check('报告已写配置', patched?.configWrite?.written === true, patched?.configWrite)
  // The list endpoint blanks source_query/trigger, so read the detail record —
  // which is exactly what the panel's editor does.
  const after = await call(`/mental-model?bankId=${enc(bank)}&id=${enc(model.id)}`)
  check('服务端已变', after?.model?.source_query === 'REWRITTEN-BY-PANEL.', after?.model?.source_query)
  const cfg = JSON.parse(await readFile(configPath, 'utf8'))
  console.log(`     config.pages = ${JSON.stringify(cfg.pages)}`)
  check('配置 pages["Component map"].source_query 已写', cfg.pages?.['Component map']?.source_query === 'REWRITTEN-BY-PANEL.', cfg.pages)

  console.log('\n4) 面板路由：cron 带 H 必须被拒（服务端不认 H）')
  const withH = await call('/mental-model', { method: 'PATCH', body: { bankId: bank, id: model.id, refreshCron: 'H * * * *' } })
  check('400 并解释原因', withH?.ok === false && /H/.test(withH?.error || ''), withH)

  console.log('\n5) 面板路由：具体 cron 可以写')
  const cron = await call('/mental-model', { method: 'PATCH', body: { bankId: bank, id: model.id, refreshCron: '5 * * * *' } })
  check('PATCH ok', cron?.ok === true, cron)
  const trig = (await call(`/mental-model?bankId=${enc(bank)}&id=${enc(model.id)}`))?.model?.trigger
  check('trigger.refresh_cron 已改', trig?.refresh_cron === '5 * * * *', trig?.refresh_cron)

  console.log('\n6) 面板路由：动作端点（用 clear，避免触发 LLM）')
  const cleared = await call('/mental-model-action', { method: 'POST', body: { bankId: bank, id: model.id, action: 'clear' } })
  check('clear ok', cleared?.ok === true, cleared)

  console.log('\n7) 面板路由：删除')
  const removed = await call(`/mental-model?bankId=${enc(bank)}&id=${enc(model.id)}`, { method: 'DELETE' })
  check('DELETE ok', removed?.ok === true, removed)
  const gone = await call(`/mental-models?bankId=${enc(bank)}`)
  check('列表已空', (gone?.models || []).length === 0, gone?.models)

  console.log('\n8) 错误处理')
  check('缺 bankId → ok:false', (await call('/mental-models'))?.ok === false)
  check('未知 action → ok:false', (await call('/mental-model-action', { method: 'POST', body: { bankId: bank, id: 'x', action: 'nope' } }))?.ok === false)
  check('空 patch → ok:false', (await call('/mental-model', { method: 'PATCH', body: { bankId: bank, id: 'x' } }))?.ok === false)
} finally {
  const cleanup = await direct('DELETE', `/v1/default/banks/${enc(bank)}`)
  console.log(`\n清理：DELETE 临时 bank → ${cleanup.status}`)
  await rm(dir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nMENTAL MODEL ROUTES OK' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
