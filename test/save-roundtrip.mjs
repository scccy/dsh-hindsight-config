/**
 * Round-trip test for the write path, on a THROWAWAY config file.
 *
 * HINDSIGHT_CONFIG points at a temp file, so the real ~/.hindsight/coding-agent.json
 * is never touched. Covers: token preserved when the UI does not set one,
 * unknown keys preserved, validation refusing a bad value, backup written,
 * and the unparsable-file guard.
 *
 * Run: node test/save-roundtrip.mjs
 */
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = await mkdtemp(join(tmpdir(), 'dhc-test-'))
const configPath = join(dir, 'coding-agent.json')
process.env.HINDSIGHT_CONFIG = configPath

await writeFile(
  configPath,
  JSON.stringify(
    {
      apiUrl: 'http://10.1.2.3:8888',
      serverMode: 'self-hosted',
      apiToken: 'secret-token-value',
      retainSessions: true,
      myOwnKey: { keep: true },
      harnesses: { dsh: { retainSessions: false } },
    },
    null,
    2,
  ),
  'utf8',
)

const { apply } = await import('../index.js')

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
        getOrigin: () => 'http://127.0.0.1:58192',
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
    const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
    const req = {
      method,
      url: `/hindsight-config/api${path}`,
      headers: { host: '127.0.0.1:58192' },
      async *[Symbol.asyncIterator]() {
        for (const chunk of payload) yield chunk
      },
    }
    let status = 0
    const chunks = []
    handler(req, {
      writeHead(code) {
        status = code
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk))
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed = null
        try {
          parsed = text ? JSON.parse(text) : null
        } catch {
          parsed = text
        }
        resolve({ status, body: parsed })
      },
    }).catch(reject)
  })
}

let failures = 0
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}

console.log('GET /state reads the throwaway file')
const state = await call('/state')
check('path is the override', state.body?.path === configPath, state.body?.path)
check('token reported as present', state.body?.hasToken === true, state.body)
check('token text never returned', !JSON.stringify(state.body).includes('secret-token-value'), state.body?.raw?.apiToken)
check('harness override wins in effective', state.body?.effective?.retainSessions === false, state.body?.effectiveSource)
check('effective source names the harness layer', state.body?.effectiveSource?.retainSessions === 'harnesses.dsh', state.body?.effectiveSource)

console.log('\nPOST /save changes one value and keeps everything else')
const saved = await call('/save', {
  method: 'POST',
  body: { raw: { ...state.body.raw, apiUrl: 'https://hindsight.remote.example', maxParallelRetains: 4, myOwnKey: { keep: true }, harnesses: { dsh: { retainSessions: false } } }, token: { action: 'keep' } },
})
check('200', saved.status === 200, saved.body)
const written = JSON.parse(await readFile(configPath, 'utf8'))
check('new apiUrl on disk', written.apiUrl === 'https://hindsight.remote.example', written.apiUrl)
check('number coerced', written.maxParallelRetains === 4, written.maxParallelRetains)
check('token preserved', written.apiToken === 'secret-token-value', written.apiToken)
check('unknown key preserved', written.myOwnKey?.keep === true, written.myOwnKey)
check('harness section preserved', written.harnesses?.dsh?.retainSessions === false, written.harnesses)
check('restart list reported', Array.isArray(saved.body?.restartRequired) && saved.body.restartRequired.includes('apiUrl'), saved.body?.restartRequired)
const backup = await readFile(`${configPath}.hindsight-ui-backup`, 'utf8')
check('backup keeps the previous content', backup.includes('10.1.2.3'), backup.slice(0, 80))

console.log('\nPOST /save with token action=set / clear')
await call('/save', { method: 'POST', body: { raw: written, token: { action: 'set', value: 'rotated-token' } } })
check('token replaced', JSON.parse(await readFile(configPath, 'utf8')).apiToken === 'rotated-token')
const current = JSON.parse(await readFile(configPath, 'utf8'))
await call('/save', { method: 'POST', body: { raw: current, token: { action: 'clear' } } })
check('token removed', JSON.parse(await readFile(configPath, 'utf8')).apiToken === undefined)

console.log('\nPOST /save refuses an invalid value and writes nothing')
const before = await readFile(configPath, 'utf8')
const rejected = await call('/save', { method: 'POST', body: { raw: { pageTriggerType: 'sometimes' }, token: { action: 'keep' } } })
check('400', rejected.status === 400, rejected.body)
check('file untouched', (await readFile(configPath, 'utf8')) === before)

console.log('\nA corrupt file is reported, and overwriting it needs explicit consent')
await writeFile(configPath, '{ "apiUrl": "http://x:1", ', 'utf8')
const corrupt = await call('/state')
check('parseError surfaced', typeof corrupt.body?.parseError === 'string', corrupt.body?.parseError)
check('invalid text is shown for repair', typeof corrupt.body?.invalidText === 'string', Boolean(corrupt.body?.invalidText))
const refused = await call('/save', { method: 'POST', body: { raw: { apiUrl: 'http://y:2' }, token: { action: 'keep' } } })
check('409 without consent', refused.status === 409, refused.body)
const forced = await call('/save', { method: 'POST', body: { raw: { apiUrl: 'http://y:2' }, token: { action: 'keep' }, allowOverwriteInvalid: true } })
check('200 with consent', forced.status === 200, forced.body)
check('healthy file afterwards', JSON.parse(await readFile(configPath, 'utf8')).apiUrl === 'http://y:2')

await rm(dir, { recursive: true, force: true })
console.log(failures === 0 ? '\nSAVE ROUND-TRIP OK' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
