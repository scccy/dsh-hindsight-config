/**
 * Host-half smoke test without Cordis: mount the plugin on a fake context,
 * capture the HTTP routes it registers, and call them with fake req/res.
 *
 * Run: node test/smoke.mjs
 * It reads the real config file and talks to the real Hindsight endpoint in it,
 * so it exercises exactly the code path the browser uses.
 */
import { apply } from '../index.js'
import { readFile } from 'node:fs/promises'

const routes = new Map()

/** Mount the plugin on a fake Host context; `engine` fakes a Loader entry table. */
function mount(target, { loaderEntries } = {}) {
  const ctx = {
    effect(fn) {
      fn()
    },
    get(service) {
      if (service === 'loader' && loaderEntries) {
        return { entries: () => loaderEntries }
      }
      return undefined
    },
    inject(_services, callback) {
      callback({
        webServer: {
          getOrigin: () => 'http://127.0.0.1:58192',
          register(route) {
            target.set(route.path, route.handler)
            return () => target.delete(route.path)
          },
        },
      })
    },
  }
  apply(ctx)
  return ctx
}

mount(routes)

console.log('registered routes:')
for (const path of [...routes.keys()].sort()) console.log('  ', path)

function call(path, { method = 'GET', body, host = '127.0.0.1:58192', url } = {}) {
  return new Promise((resolve, reject) => {
    const pathname = path.split('?')[0]
    const handler = routes.get(`/hindsight-config/api${pathname}`)
    if (!handler) return reject(new Error(`no route for ${path}`))
    const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
    const req = {
      method,
      url: url || `/hindsight-config/api${path}`,
      headers: { host },
      async *[Symbol.asyncIterator]() {
        for (const chunk of payload) yield chunk
      },
    }
    let status = 0
    const chunks = []
    const res = {
      writeHead(code) {
        status = code
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk))
        let parsed = null
        const text = Buffer.concat(chunks).toString('utf8')
        try {
          parsed = text ? JSON.parse(text) : null
        } catch {
          parsed = text
        }
        resolve({ status, body: parsed })
      },
    }
    handler(req, res).catch(reject)
  })
}

let failures = 0
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}

console.log('\nGET /state')
const state = await call('/state')
check('200', state.status === 200, state)
check('has path', typeof state.body?.path === 'string', state.body?.path)
check('fields served', Array.isArray(state.body?.fields) && state.body.fields.length > 40, state.body?.fields?.length)
check('groups served', state.body?.groups?.length === 8, state.body?.groups?.length)
check('token never echoed', !JSON.stringify(state.body?.raw || {}).includes('Bearer'), state.body?.raw?.apiToken)
check('effective has apiUrl', typeof state.body?.effective?.apiUrl === 'string', state.body?.effective?.apiUrl)
check('immediate keys', JSON.stringify(state.body?.immediateKeys) === '["apiToken"]', state.body?.immediateKeys)
if (state.body?.errors?.length) check('config validates', false, state.body.errors)

console.log('\nGET /state from a foreign Host header (should be 403)')
const blocked = await call('/state', { host: 'evil.example.com' })
check('403', blocked.status === 403, blocked)

console.log('\nPOST /probe (values from the file)')
const probe = await call('/probe', { method: 'POST', body: { endpoint: {} } })
check('200', probe.status === 200, probe)
check('server answered', probe.body?.ok === true, probe.body)
check('health has status or is a clear error', probe.body?.health?.status !== undefined || probe.body?.health?.ok === false, probe.body?.health)
check('version carries api_version when reachable', probe.body?.ok !== true || typeof probe.body?.version?.api_version === 'string', probe.body?.version)

console.log('\nPOST /probe against an unreachable host (error path)')
const bad = await call('/probe', { method: 'POST', body: { endpoint: { serverMode: 'self-hosted', apiUrl: 'http://127.0.0.1:9' } } })
check('reports unreachable, not a crash', bad.status === 200 && bad.body?.ok === false, bad.body)
check('has a human hint', typeof bad.body?.health?.hint === 'string', bad.body?.health)

console.log('\nGET /banks')
const banks = await call('/banks')
check('200', banks.status === 200, banks)
if (probe.body?.ok) {
  check('lists banks', banks.body?.ok === true && Array.isArray(banks.body.banks), banks.body)
  console.log('     banks:', (banks.body?.banks || []).map((bank) => bank.id).join(', '))
}

const firstBank = banks.body?.banks?.[0]?.id
if (firstBank) {
  console.log(`\nGET /bank?bankId=${firstBank}`)
  const detail = await call(`/bank?bankId=${encodeURIComponent(firstBank)}`)
  check('200', detail.status === 200, detail)
  check('stats present', detail.body?.ok === true && detail.body?.stats !== null, detail.body?.statsError)
  check('curated knobs present', Array.isArray(detail.body?.curated) && detail.body.curated.length > 10, detail.body?.curated?.length)
  console.log('     documents:', detail.body?.stats?.total_documents, ' nodes:', detail.body?.stats?.total_nodes)
}

console.log('\nPOST /bank-config with no updates (guarded)')
const bankNoop = await call('/bank-config', { method: 'POST', body: { bankId: firstBank || 'x', updates: {} } })
check('400', bankNoop.status === 400, bankNoop)

console.log('\nPOST /save with an invalid value (must reject, not write)')
const invalid = await call('/save', { method: 'POST', body: { raw: { serverMode: 'nope' }, token: { action: 'keep' } } })
check('400', invalid.status === 400, invalid)
check('error names the field', JSON.stringify(invalid.body?.errors || []).includes('serverMode'), invalid.body)

console.log('\nPOST /validate on unknown keys (warns, does not error)')
const unknown = await call('/validate', { method: 'POST', body: { raw: { componnetMap: 1 } } })
check('warns unknown key', unknown.body?.warnings?.length === 1 && unknown.body?.errors?.length === 0, unknown.body)

console.log('\nGET /logs?file=plugin')
const logs = await call('/logs?file=plugin&lines=5')
check('200', logs.status === 200, logs)
check('returns lines array', Array.isArray(logs.body?.lines), logs.body)

console.log('\nengine self-check — no Loader in this fake context')
check('reports not installed', state.body?.engine?.installed === false && state.body?.engine?.mounted === false, state.body?.engine)
check('baseline shipped with the fields', typeof state.body?.fieldsBaseline === 'string', state.body?.fieldsBaseline)
check(
  'engine version resolves (profile scan) or reports null with a reason',
  state.body?.engineVersion === null || /^\d+\.\d+\.\d+/.test(String(state.body?.engineVersion)),
  { version: state.body?.engineVersion, manifest: state.body?.engineManifest },
)
if (state.body?.engineVersion) console.log(`     engine ${state.body.engineVersion} from ${state.body.engineManifest}`)

// A second mount with a fake Loader entry table, the way the real Host reports it.
function withLoader(rows) {
  const table = new Map()
  const prev = routes
  return new Promise((resolve) => {
    const ctx = mount(table, { loaderEntries: rows })
    resolve({ table, ctx, prev })
  })
}

{
  const { table } = await withLoader([{ options: { id: 'hindsight', name: '@vectorize-io/hindsight-coding-agents/dsh' }, fiber: { state: 2 } }])
  routes.clear()
  for (const [key, value] of table) routes.set(key, value)
  const active = await call('/state')
  check('engine active → mounted', active.body?.engine?.mounted === true && active.body?.engine?.rowId === 'hindsight', active.body?.engine)
}
{
  const { table } = await withLoader([{ options: { id: 'hindsight', name: '@vectorize-io/hindsight-coding-agents/dsh' }, fiber: { state: 1 } }])
  routes.clear()
  for (const [key, value] of table) routes.set(key, value)
  const loading = await call('/state')
  check('engine loading → installed but not mounted', loading.body?.engine?.installed === true && loading.body?.engine?.mounted === false && loading.body?.engine?.state === 'loading', loading.body?.engine)
}

console.log('\ncordis.patch.yml is the umbrella (engine row + panel row)')
const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
check('inserts the engine row', /- id: hindsight\s*\n\s*name: "@vectorize-io\/hindsight-coding-agents\/dsh"/.test(patch), patch)
check('inserts the panel row', /- id: hindsight-config\s*\n\s*name: dsh-hindsight-config/.test(patch), patch)
check('the engine row reuses the official bundle id (dedupe)', (patch.match(/^\s*- id: hindsight$/gm) || []).length === 1, patch)

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
