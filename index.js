/**
 * Host half of dsh-hindsight-config.
 *
 * Everything about the Hindsight *server* goes over HTTP with the configured
 * credential: in a real deployment that server is on another machine, so this
 * plugin never reads, writes, or assumes the existence of server-side files or
 * processes. Only the local client config file (~/.hindsight/coding-agent.json
 * or $HINDSIGHT_CONFIG) is touched, and that is the file the Hindsight plugin
 * itself reads.
 *
 * The browser half never sees the api token and never talks to the Hindsight
 * server directly: it calls these routes, which proxy with the token and are
 * gated the same way the Harness gates its own /api.
 */
import { readFile, writeFile, rename, mkdir, stat, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { FIELDS, GROUPS, HARNESS, KNOWN_EXTRA_KEYS, coerce, immediateKeys, ENGINE_BASELINE, ENGINE_PACKAGE, TAXONOMY_PAGES, taxonomyName } from './fields.js'

export const name = 'hindsight-config'
export const inject = []

const PREFIX = '/hindsight-config/api'
const LOG_DIR = join(homedir(), '.hindsight', 'coding-agents-logs')
const UPSTREAM_TIMEOUT_MS = 8000
const FIBER_STATE = { 0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 4: 'disposed', 5: 'unloading' }

const configPath = () => process.env.HINDSIGHT_CONFIG || join(homedir(), '.hindsight', 'coding-agent.json')

/* -------------------------------------------------------------------- engine */

/**
 * Is the memory engine mounted right now, and at which release?
 *
 * This panel talks to the Hindsight server on its own, so without this the UI
 * looks healthy even when nothing provides memory inside DSH. The answer comes
 * from the Loader entry table (the row, not a guess) plus the installed
 * package's own manifest.
 */
function engineStatusOf(ctx) {
  let entry
  try {
    const loader = ctx.get('loader')
    const entries = loader && typeof loader.entries === 'function' ? loader.entries() : []
    for (const candidate of entries) {
      const name = candidate?.options?.name
      if (typeof name === 'string' && name.startsWith(ENGINE_PACKAGE)) entry = candidate
    }
  } catch {
    /* loader absent: report "not installed" rather than fail the whole panel */
  }
  if (!entry) return { installed: false, mounted: false, state: null, rowId: null }
  const state = entry.fiber?.state
  return {
    installed: true,
    mounted: state === 2,
    state: FIBER_STATE[state] ?? null,
    rowId: entry.options?.id ?? null,
  }
}

async function engineVersion(loaderBaseUrl) {
  const candidates = []
  const push = (dir) => {
    if (typeof dir !== 'string' || !dir.trim()) return
    const candidate = join(dir, 'node_modules', ENGINE_PACKAGE, 'package.json')
    if (!candidates.includes(candidate)) candidates.push(candidate)
  }
  push(process.env.DSH_PROFILE_DIR)
  push(loaderBaseUrl)
  push(process.cwd())
  // Last resort: whichever profile has the engine installed. The Host process
  // itself does not always carry DSH_PROFILE_DIR (only its child shells do), so
  // without this the version reads as unknown on a CLI-launched host.
  try {
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    for (const name of await readdir(join(home, 'profiles'))) push(join(home, 'profiles', name))
  } catch {
    /* no profiles directory: keep the candidates gathered so far */
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(await readFile(candidate, 'utf8'))
      if (typeof parsed?.version === 'string') return { version: parsed.version, manifest: candidate }
    } catch {
      /* try the next candidate */
    }
  }
  return { version: null, manifest: null, tried: candidates.length }
}


/* ------------------------------------------------------------------ config IO */

async function readConfigFile() {
  const path = configPath()
  let text = ''
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { path, exists: false, text: '', raw: {}, parseError: null }
    return { path, exists: false, text: '', raw: {}, parseError: `无法读取配置文件：${error?.message || error}` }
  }
  try {
    const raw = JSON.parse(text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { path, exists: true, text, raw: {}, parseError: '配置文件顶层必须是一个 JSON 对象' }
    }
    return { path, exists: true, text, raw, parseError: null }
  } catch (error) {
    // The plugin itself swallows this: it logs and falls back to {} — every
    // setting silently stops applying. Surface it loudly instead.
    return { path, exists: true, text, raw: {}, parseError: `JSON 解析失败：${error?.message || error}` }
  }
}

/** Best-effort masking for the unparsable-file view. */
function redactTokenText(text) {
  return String(text).replace(/("apiToken"\s*:\s*)"(?:[^"\\]|\\.)*"/g, '$1"••••（已隐藏）"')
}

async function writeConfigFile(nextRaw) {  const path = configPath()
  await mkdir(dirname(path), { recursive: true })
  const body = `${JSON.stringify(nextRaw, null, 2)}\n`
  const tmp = `${path}.hindsight-ui-${process.pid}.tmp`
  await writeFile(tmp, body, 'utf8')
  // Keep the previous content reachable; the official installer keeps its own
  // backup too, so this only ever describes "what this UI replaced".
  try {
    const previous = await readFile(path, 'utf8')
    await writeFile(`${path}.hindsight-ui-backup`, previous, 'utf8')
  } catch {
    /* no previous file */
  }
  await rename(tmp, path)
  return path
}

/** env fallback layer, mirroring the plugin: the FILE wins where it sets a value. */
function envLayer() {
  const out = {}
  const present = {}
  for (const field of FIELDS) {
    if (!field.env) continue
    const value = process.env[field.env]
    if (value === undefined || value === '') continue
    present[field.env] = value
    const coerced = coerce(field, field.type === 'stringList' ? value : value)
    if (coerced !== null) out[field.key] = coerced
  }
  return { values: out, present }
}

function effectiveOf(raw) {
  const { values: fromEnv } = envLayer()
  const perHarness = raw.harnesses?.[HARNESS]
  const out = {}
  const source = {}
  for (const field of FIELDS) {
    if (field.type === 'secret') continue
    let value = field.default
    let from = 'default'
    if (fromEnv[field.key] !== undefined) {
      value = fromEnv[field.key]
      from = 'env'
    }
    const fileValue = raw[field.key]
    if (fileValue !== undefined) {
      const coerced = coerce(field, fileValue)
      if (coerced !== null) {
        value = coerced
        from = 'file'
      } else {
        value = fileValue
        from = 'invalid'
      }
    }
    if (perHarness && perHarness[field.key] !== undefined) {
      value = perHarness[field.key]
      from = `harnesses.${HARNESS}`
    }
    if (value !== undefined) {
      out[field.key] = value
      source[field.key] = from
    }
  }
  return { values: out, source }
}

/** Validate the raw file shape without contacting the server. */
function validate(nextRaw) {
  const errors = []
  const warnings = []
  if (!nextRaw || typeof nextRaw !== 'object' || Array.isArray(nextRaw)) {
    return { errors: [{ key: '', message: '顶层必须是一个 JSON 对象' }], warnings }
  }
  const known = new Set([...FIELDS.map((field) => field.key), ...KNOWN_EXTRA_KEYS])
  for (const key of Object.keys(nextRaw)) {
    if (!known.has(key)) {
      warnings.push({
        key,
        message: `未知字段 "${key}"：Hindsight 会忽略它（可能是拼写错误，或属于更新版本的插件）`,
      })
    }
  }
  for (const field of FIELDS) {
    const value = nextRaw[field.key]
    if (value === undefined) continue
    if (field.type === 'secret') {
      if (typeof value !== 'string') errors.push({ key: field.key, message: '必须是字符串' })
      continue
    }
    const coerced = coerce(field, value)
    if (coerced === null) {
      const hint =
        field.type === 'select'
          ? `取值必须是：${field.options.join(' / ')}`
          : field.type === 'number'
            ? `必须是数字${field.min !== undefined ? `，且 ≥ ${field.min}` : ''}${field.max !== undefined ? `，且 ≤ ${field.max}` : ''}`
            : field.type === 'json'
              ? '必须是 JSON 对象'
              : field.type === 'stringList'
                ? '必须是字符串数组'
                : field.type === 'boolean'
                  ? '必须是 true / false'
                  : '必须是字符串'
      errors.push({ key: field.key, message: hint })
    }
  }
  return { errors, warnings }
}

/* ------------------------------------------------------------ remote server */

function endpointFrom(raw, override) {
  const cfg = override && Object.keys(override).length ? override : raw
  const mode = cfg.serverMode || 'cloud'
  let apiUrl = cfg.apiUrl || 'https://api.hindsight.vectorize.io'
  const apiPort = cfg.apiPort || 9077
  if (mode === 'daemon') {
    // Daemon mode always means a process on THIS machine — the one case where
    // localhost is correct by definition.
    const port = apiPort
    apiUrl = `http://127.0.0.1:${port}`
  }
  return { apiUrl: String(apiUrl).replace(/\/+$/, ''), apiToken: cfg.apiToken, mode }
}

function describeFetchError(error, apiUrl) {
  const code = error?.cause?.code || error?.code || ''
  const reason = error?.name === 'TimeoutError' ? `请求超时（${UPSTREAM_TIMEOUT_MS}ms）` : code || error?.message || String(error)
  const hints = {
    ENOTFOUND: '域名解析失败：检查 apiUrl 是否拼对、DNS 是否可达',
    ECONNREFUSED: '连接被拒绝：对端没有在这个地址/端口上监听，或防火墙拦了',
    EHOSTUNREACH: '主机不可达：网络路由不通',
    ECONNRESET: '连接被重置：可能是 TLS/代理/端口不匹配',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS 证书不受信任：自签名证书需要额外信任配置',
    CERT_HAS_EXPIRED: 'TLS 证书已过期',
  }
  return { kind: 'unreachable', apiUrl, message: reason, hint: hints[code] || '确认服务端地址、端口、网络与证书' }
}

async function upstream(raw, path, options = {}) {
  const { apiUrl, apiToken } = endpointFrom(raw, options.endpointOverride)
  const url = `${apiUrl}${path}`
  const headers = { accept: 'application/json' }
  if (apiToken) headers.authorization = `Bearer ${apiToken}`
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  let response
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, ...describeFetchError(error, apiUrl) }
  }
  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    const detail =
      (data && (data.detail || data.message || data.error)) ||
      (typeof data === 'string' ? data.slice(0, 400) : '')
    return {
      ok: false,
      kind: response.status === 401 || response.status === 403 ? 'auth' : 'http',
      status: response.status,
      apiUrl,
      message: `HTTP ${response.status} ${response.statusText}`,
      hint:
        response.status === 401 || response.status === 403
          ? '服务端要求认证或拒绝了该凭据：检查 apiToken（云端还需要正确的 apiUrl）'
          : undefined,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
    }
  }
  return { ok: true, status: response.status, apiUrl, data }
}

/* ------------------------------------------------------------------- routes */

function json(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1_000_000) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function makeGuard(ctx, webServer) {
  const ownOrigin = safeOrigin(webServer)
  return function admit(req) {
    // The Harness's own gate, when this composition has one: it carries the
    // browser login and the trusted-host fence that /api uses.
    try {
      const connection = ctx.get('connection')
      const gate = connection?.requestRejection
      if (typeof gate === 'function') {
        const url = `http://${req.headers.host || 'localhost'}${req.url || '/'}`
        const request = new Request(url, { method: req.method || 'GET', headers: req.headers })
        const rejection = gate.call(connection, request)
        if (rejection) return `被宿主连接策略拒绝：${typeof rejection === 'string' ? rejection : JSON.stringify(rejection)}`
      }
    } catch {
      /* a gate that throws must not open a hole: fall through to the origin check */
    }
    const host = req.headers.host || ''
    if (!host) return '缺少 Host 头'
    const bare = host.split(':')[0]
    const loopback = bare === '127.0.0.1' || bare === 'localhost' || bare === '::1' || bare === '[::1]'
    if (ownOrigin && host === ownOrigin.host) return null
    if (loopback) return null
    return `仅接受本机或同源请求（Host: ${host}）`
  }
}

function safeOrigin(webServer) {
  try {
    const url = new URL(webServer.getOrigin())
    return { host: url.host, origin: url.origin }
  } catch {
    return null
  }
}

async function tailLog(file, lines) {
  const name = file === 'diag' ? 'diag.jsonl' : file === 'usage' ? 'usage.jsonl' : 'plugin.log'
  const path = join(LOG_DIR, name)
  try {
    const info = await stat(path)
    const handle = await readFile(path, 'utf8')
    const all = handle.split(/\r?\n/)
    const tail = all.slice(Math.max(0, all.length - 1 - lines), -1)
    return { path, size: info.size, modified: info.mtimeMs, lines: tail }
  } catch (error) {
    return { path, error: `读取失败：${error?.message || error}`, lines: [] }
  }
}

function curatedBankFields(config) {
  const pick = (key) => ({ key, value: config?.[key] ?? null })
  return [
    { key: 'enable_observations', type: 'boolean', group: 'beliefs' },
    { key: 'enable_auto_consolidation', type: 'boolean', group: 'beliefs' },
    { key: 'mental_model_min_refresh_interval_seconds', type: 'number', group: 'beliefs' },
    { key: 'max_observations_per_scope', type: 'number', group: 'beliefs' },
    { key: 'retain_extraction_mode', type: 'select', options: ['concise', 'verbose', 'verbatim', 'chunks', 'custom'], group: 'retain' },
    { key: 'retain_mission', type: 'text', group: 'retain' },
    { key: 'reflect_mission', type: 'text', group: 'retain' },
    { key: 'observations_mission', type: 'text', group: 'retain' },
    { key: 'recall_budget_function', type: 'select', options: ['fixed', 'adaptive'], group: 'recall' },
    { key: 'recall_budget_min', type: 'number', group: 'recall' },
    { key: 'recall_budget_max', type: 'number', group: 'recall' },
    { key: 'recall_max_tokens', type: 'number', group: 'recall' },
    { key: 'enable_temporal_retrieval', type: 'boolean', group: 'recall' },
    { key: 'enable_graph_retrieval', type: 'boolean', group: 'recall' },
    { key: 'store_document_text', type: 'boolean', group: 'recall' },
  ].map((entry) => ({ ...entry, value: config?.[entry.key] ?? null }))
}

/**
 * Persist a taxonomy page's question into the client config, which is the input
 * the engine re-pushes from every session. Without this, a server-side edit to a
 * seeded page is silently undone at the next session.
 *
 * Returns what happened so the UI can say it out loud.
 */
async function writePageSourceQuery(name, sourceQuery) {
  const canonical = taxonomyName(name)
  if (!canonical) return { written: false, reason: 'not-taxonomy' }
  const file = await readConfigFile()
  if (file.parseError) return { written: false, reason: 'config-unreadable', detail: file.parseError }
  const raw = { ...file.raw }
  const pages = { ...(raw.pages && typeof raw.pages === 'object' && !Array.isArray(raw.pages) ? raw.pages : {}) }
  // Match an existing key case-insensitively so we do not create a duplicate.
  const existingKey = Object.keys(pages).find((key) => key.toLowerCase() === canonical.toLowerCase()) ?? canonical
  const current = pages[existingKey]
  if (current === false) {
    // `false` means "do not seed this page"; an edit is an explicit intent to keep it.
    pages[existingKey] = { source_query: sourceQuery }
  } else if (current && typeof current === 'object') {
    pages[existingKey] = { ...current, source_query: sourceQuery }
  } else {
    pages[existingKey] = { source_query: sourceQuery }
  }
  raw.pages = pages
  await writeConfigFile(raw)
  return { written: true, key: existingKey }
}

/** The five seeded page names, so the UI can flag which edits are config-owned. */
function taxonomyList() {
  return [...TAXONOMY_PAGES]
}

/* --------------------------------------------------------------------- apply */

export function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    const webServer = hostCtx.webServer
    const admit = makeGuard(ctx, webServer)

    const route = (path, handler) => {
      ctx.effect(() =>
        webServer.register({
          kind: 'exact',
          path: `${PREFIX}${path}`,
          handler: async (req, res) => {
            const rejection = admit(req)
            if (rejection) return json(res, 403, { ok: false, error: rejection })
            try {
              await handler(req, res)
            } catch (error) {
              json(res, 500, { ok: false, error: String(error?.message || error) })
            }
          },
        }),
      )
    }

    route('/state', async (_req, res) => {
      const file = await readConfigFile()
      const env = envLayer()
      const effective = effectiveOf(file.raw)
      const engine = engineStatusOf(ctx)
      const release = await engineVersion(
        (() => {
          try {
            const loader = ctx.get('loader')
            return loader?.config?.baseUrl ?? loader?.ctx?.baseUrl
          } catch {
            return undefined
          }
        })(),
      )
      const hasToken = Boolean(file.raw.apiToken || env.present.HINDSIGHT_API_TOKEN)
      const tokenFrom = file.raw.apiToken ? 'file' : env.present.HINDSIGHT_API_TOKEN ? 'env' : null
      const redacted = { ...file.raw }
      if (redacted.apiToken) redacted.apiToken = '••••••••（已保存，不显示）'
      const validation = validate(file.raw)
      json(res, 200, {
        ok: true,
        path: file.path,
        exists: file.exists,
        parseError: file.parseError,
        // Only when the file cannot be parsed: the user has to see what is
        // wrong, and the raw text is the only place that answer exists. The
        // token is masked best-effort; the UI treats this text as read-only.
        invalidText: file.parseError ? redactTokenText(file.text).slice(0, 200_000) : null,
        raw: redacted,
        effective: effective.values,
        effectiveSource: effective.source,
        hasToken,
        tokenFrom,
        envPresent: env.present,
        harness: HARNESS,
        groups: GROUPS,
        fields: FIELDS,
        immediateKeys: immediateKeys(),
        warnings: validation.warnings,
        errors: validation.errors,
        logDir: LOG_DIR,
        engine,
        enginePackage: ENGINE_PACKAGE,
        engineVersion: release.version,
        engineManifest: release.manifest,
        fieldsBaseline: ENGINE_BASELINE,
      })
    })

    route('/validate', async (req, res) => {
      const body = await readBody(req)
      json(res, 200, { ok: true, ...validate(body.raw) })
    })

    route('/save', async (req, res) => {
      const body = await readBody(req)
      const file = await readConfigFile()
      const next = { ...(body.raw || {}) }
      // Token is a tri-state the browser can express without ever seeing it.
      if (body.token?.action === 'set' && typeof body.token.value === 'string') {
        if (body.token.value.trim() === '') delete next.apiToken
        else next.apiToken = body.token.value.trim()
      } else if (body.token?.action === 'clear') {
        delete next.apiToken
      } else if (file.raw.apiToken !== undefined) {
        next.apiToken = file.raw.apiToken
      }
      if (file.parseError && body.allowOverwriteInvalid !== true) {
        return json(res, 409, {
          ok: false,
          error: `现有文件无法解析（${file.parseError}）。直接覆盖会丢掉里面可能还有效的内容。`,
          parseError: file.parseError,
        })
      }
      const result = validate(next)
      if (result.errors.length) return json(res, 400, { ok: false, ...result })
      const path = await writeConfigFile(next)
      json(res, 200, {
        ok: true,
        path,
        warnings: result.warnings,
        restartRequired: FIELDS.filter((field) => field.restart !== false && next[field.key] !== undefined).map((field) => field.key),
        immediate: immediateKeys(),
      })
    })

    route('/probe', async (req, res) => {
      const body = await readBody(req)
      const file = await readConfigFile()
      // Probe the values currently in the form, so "test" works before saving.
      const candidate = {
        ...file.raw,
        ...(body.endpoint || {}),
      }
      const health = await upstream(candidate, '/health', { timeoutMs: 5000 })
      if (!health.ok) return json(res, 200, { ok: false, health })
      const version = await upstream(candidate, '/version', { timeoutMs: 5000 })
      json(res, 200, {
        ok: true,
        apiUrl: health.apiUrl,
        health: health.data,
        version: version.ok ? version.data : null,
        versionError: version.ok ? null : version,
      })
    })

    route('/banks', async (req, res) => {
      const file = await readConfigFile()
      const url = new URL(req.url || '/', 'http://localhost')
      const q = url.searchParams.get('q') || ''
      const query = q ? `?q=${encodeURIComponent(q)}&limit=200` : '?limit=200'
      const result = await upstream(file.raw, `/v1/default/banks${query}`)
      if (!result.ok) return json(res, 200, { ok: false, error: result })
      const banks = (result.data?.banks || []).map((bank) => ({
        id: bank.bank_id || bank.id,
        name: bank.name || bank.bank_id || bank.id,
        disposition: bank.disposition,
        hasMission: Boolean(bank.mission),
      }))
      json(res, 200, { ok: true, apiUrl: result.apiUrl, banks })
    })

    route('/bank', async (req, res) => {
      const file = await readConfigFile()
      const url = new URL(req.url || '/', 'http://localhost')
      const bankId = url.searchParams.get('bankId') || ''
      if (!bankId) return json(res, 400, { ok: false, error: '缺少 bankId' })
      const encoded = encodeURIComponent(bankId)
      const [stats, config] = await Promise.all([
        upstream(file.raw, `/v1/default/banks/${encoded}/stats`),
        upstream(file.raw, `/v1/default/banks/${encoded}/config`),
      ])
      if (!stats.ok && !config.ok) return json(res, 200, { ok: false, error: stats.ok ? config : stats })
      json(res, 200, {
        ok: true,
        bankId,
        stats: stats.ok ? stats.data : null,
        statsError: stats.ok ? null : stats,
        config: config.ok ? config.data?.config : null,
        overrides: config.ok ? config.data?.overrides : null,
        configError: config.ok ? null : config,
        curated: config.ok ? curatedBankFields(config.data?.config) : [],
      })
    })

    route('/bank-config', async (req, res) => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: '仅支持 POST' })
      const body = await readBody(req)
      const file = await readConfigFile()
      const bankId = String(body.bankId || '')
      const updates = body.updates && typeof body.updates === 'object' ? body.updates : null
      if (!bankId) return json(res, 400, { ok: false, error: '缺少 bankId' })
      if (!updates || !Object.keys(updates).length) return json(res, 400, { ok: false, error: '没有要写入的变更' })
      const result = await upstream(file.raw, `/v1/default/banks/${encodeURIComponent(bankId)}/config`, {
        method: 'PATCH',
        body: { updates },
      })
      if (!result.ok) return json(res, 200, { ok: false, error: result })
      json(res, 200, { ok: true, bankId, updated: Object.keys(updates), response: result.data })
    })

    // Bank aliases: extra ids that also reach one bank. This is what makes a
    // directory rename non-destructive — add the new name as an alias first,
    // and sessions resolving to it keep writing the same bank.
    route('/aliases', async (req, res) => {
      const file = await readConfigFile()
      const url = new URL(req.url || '/', 'http://localhost')
      // GET/DELETE carry the bank in the query; POST/PATCH carry it in the body.
      const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : {}
      const bankId = String(body.bankId || url.searchParams.get('bankId') || '')
      if (!bankId) return json(res, 400, { ok: false, error: '缺少 bankId' })
      const bankPath = `/v1/default/banks/${encodeURIComponent(bankId)}/aliases`

      if (req.method === 'GET') {
        const result = await upstream(file.raw, bankPath)
        if (!result.ok) return json(res, 200, { ok: false, error: result })
        return json(res, 200, { ok: true, bankId, aliases: result.data?.aliases ?? [] })
      }
      if (req.method === 'POST') {
        const alias = String(body.alias || '').trim()
        if (!alias) return json(res, 400, { ok: false, error: '别名不能为空' })
        const result = await upstream(file.raw, bankPath, {
          method: 'POST',
          body: { alias, primary: Boolean(body.primary) },
        })
        if (!result.ok) return json(res, 200, { ok: false, error: result })
        return json(res, 200, { ok: true, bankId, alias })
      }
      if (req.method === 'PATCH') {
        const alias = String(body.alias || '').trim()
        if (!alias) return json(res, 400, { ok: false, error: '缺少 alias' })
        const result = await upstream(file.raw, `${bankPath}/${encodeURIComponent(alias)}`, {
          method: 'PATCH',
          body: { primary: Boolean(body.primary) },
        })
        if (!result.ok) return json(res, 200, { ok: false, error: result })
        return json(res, 200, { ok: true, bankId, alias, primary: Boolean(body.primary) })
      }
      if (req.method === 'DELETE') {
        const alias = url.searchParams.get('alias') || ''
        if (!alias) return json(res, 400, { ok: false, error: '缺少 alias' })
        const result = await upstream(file.raw, `${bankPath}/${encodeURIComponent(alias)}`, { method: 'DELETE' })
        if (!result.ok) return json(res, 200, { ok: false, error: result })
        return json(res, 200, { ok: true, bankId, alias, removed: true })
      }
      return json(res, 405, { ok: false, error: '仅支持 GET / POST / PATCH / DELETE' })
    })

    // Mental models = the server-side primitive behind knowledge pages. A page
    // has two ids (kp-… in the knowledge tree, mm-… here) over one record: a
    // PATCH through either surface is visible through the other, so edits made
    // here are what the engine's drift check sees.
    route('/mental-models', async (req, res) => {
      const file = await readConfigFile()
      const url = new URL(req.url || '/', 'http://localhost')
      const bankId = String(url.searchParams.get('bankId') || '')
      if (!bankId) return json(res, 400, { ok: false, error: '缺少 bankId' })
      const result = await upstream(file.raw, `/v1/default/banks/${encodeURIComponent(bankId)}/mental-models`)
      if (!result.ok) return json(res, 200, { ok: false, error: result })
      // Is a refresh running right now? The model row cannot tell on its own, and
      // without this the UI looks frozen for the minutes a synthesis takes.
      let refreshing = false
      const ops = await upstream(file.raw, `/v1/default/banks/${encodeURIComponent(bankId)}/operations?limit=20`)
      if (ops.ok) {
        const items = ops.data?.items ?? ops.data?.operations ?? []
        refreshing = items.some(
          (op) => op.operation_type === 'refresh_mental_model' && op.status !== 'completed' && op.status !== 'failed' && op.status !== 'cancelled',
        )
      }
      const taxonomy = taxonomyList()
      const items = (result.data?.items ?? []).map((model) => {
        // The server clears `last_refresh_failed_at` once a refresh succeeds
        // (verified: it was 16:23:41, then empty after a 17:36 success). Compare
        // the two instants anyway so a server that ever kept both cannot leave a
        // stale red badge on a healthy page.
        const failedAt = model.last_refresh_failed_at ? Date.parse(model.last_refresh_failed_at) : 0
        const refreshedAt = model.last_refreshed_at ? Date.parse(model.last_refreshed_at) : 0
        return {
          id: model.id,
          name: model.name,
          tags: model.tags,
          sourceQuery: model.source_query,
          maxTokens: model.max_tokens,
          trigger: model.trigger,
          lastRefreshedAt: model.last_refreshed_at,
          lastRefreshFailedAt: model.last_refresh_failed_at,
          failedRecently: failedAt > refreshedAt,
          isStale: model.is_stale,
          isTaxonomy: Boolean(taxonomyName(model.name)),
        }
      })
      json(res, 200, { ok: true, bankId, models: items, taxonomy, refreshing })
    })

    route('/mental-model', async (req, res) => {
      const file = await readConfigFile()
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req)
      const url = new URL(req.url || '/', 'http://localhost')
      const bankId = String(body.bankId || url.searchParams.get('bankId') || '')
      const id = String(body.id || url.searchParams.get('id') || '')
      if (!bankId || !id) return json(res, 400, { ok: false, error: '缺少 bankId 或 id' })
      const base = `/v1/default/banks/${encodeURIComponent(bankId)}/mental-models/${encodeURIComponent(id)}`

      if (req.method === 'GET') {
        const result = await upstream(file.raw, base)
        if (!result.ok) return json(res, 200, { ok: false, error: result })
        return json(res, 200, { ok: true, model: result.data })
      }
      if (req.method === 'DELETE') {
        const result = await upstream(file.raw, base, { method: 'DELETE' })
        if (!result.ok) return json(res, 200, { ok: false, error: result })
        return json(res, 200, { ok: true, removed: true })
      }
      if (req.method !== 'PATCH') return json(res, 405, { ok: false, error: '仅支持 GET / PATCH / DELETE' })

      // Per-mental-model config: five top-level fields plus a trigger object.
      // A partial `trigger` MERGES on the server (verified), so sending only the
      // keys the user touched leaves mode/fact_types/budget etc. alone.
      const TRIGGER_KEYS = [
        'budget', 'mode', 'refresh_after_consolidation', 'refresh_cron', 'min_refresh_interval_seconds',
        'fact_types', 'exclude_mental_models', 'exclude_mental_model_ids', 'tags_match', 'tag_groups',
        'include_chunks', 'recall_max_tokens', 'recall_chunks_max_tokens',
        'reflect_search_observations_max_tokens', 'reflect_search_observations_include_entities',
        'response_schema', 'keep_trace',
      ]
      const patch = {}
      // `raw` is the whole object from the advanced JSON editor; it goes through
      // the same whitelist, so a typo cannot smuggle an unknown field upstream.
      const source = body.raw && typeof body.raw === 'object' && !Array.isArray(body.raw) ? body.raw : body
      if (typeof source.source_query === 'string') patch.source_query = source.source_query
      else if (typeof source.sourceQuery === 'string') patch.source_query = source.sourceQuery
      const name = typeof source.name === 'string' ? source.name.trim() : ''
      if (name) patch.name = name
      const rawTokens = source.max_tokens ?? source.maxTokens
      if (rawTokens !== undefined && rawTokens !== null && rawTokens !== '') {
        const tokens = Number(rawTokens)
        if (!Number.isFinite(tokens) || tokens <= 0) return json(res, 400, { ok: false, error: 'max_tokens 必须是正整数' })
        patch.max_tokens = Math.trunc(tokens)
      }
      if (Array.isArray(source.tags)) patch.tags = source.tags.map((tag) => String(tag)).filter((tag) => tag.trim() !== '')

      const triggerIn = source.trigger && typeof source.trigger === 'object' && !Array.isArray(source.trigger) ? source.trigger : null
      const trigger = {}
      if (triggerIn) {
        for (const key of TRIGGER_KEYS) {
          if (triggerIn[key] !== undefined) trigger[key] = triggerIn[key]
        }
      }
      if (typeof body.refreshCron === 'string' && body.refreshCron.trim()) trigger.refresh_cron = body.refreshCron.trim()
      if (typeof trigger.refresh_cron === 'string' && /\bH\b/.test(trigger.refresh_cron)) {
        // The server rejects Jenkins' `H`; the engine resolves it client-side
        // before creating a page. Refuse it here instead of sending a 422.
        return json(res, 400, {
          ok: false,
          error: 'H 是引擎客户端侧写法，服务端不接受。这里请填具体 5 段 cron，例如 "17 * * * *"。',
        })
      }
      if (Object.keys(trigger).length) patch.trigger = trigger
      if (!Object.keys(patch).length) return json(res, 400, { ok: false, error: '没有要写入的变更' })

      const result = await upstream(file.raw, base, { method: 'PATCH', body: patch })
      if (!result.ok) return json(res, 200, { ok: false, error: result })

      // A seeded page's question lives in the client config too; write it there
      // so the engine's next-session re-sync does not undo the edit.
      let configWrite = { written: false, reason: 'no-source-query' }
      if (patch.source_query !== undefined) {
        const model = result.data ?? {}
        configWrite = await writePageSourceQuery(model.name ?? body.name ?? '', patch.source_query)
      }
      json(res, 200, { ok: true, patched: Object.keys(patch), configWrite })
    })

    route('/mental-model-action', async (req, res) => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: '仅支持 POST' })
      const body = await readBody(req)
      const file = await readConfigFile()
      const bankId = String(body.bankId || '')
      const id = String(body.id || '')
      const action = String(body.action || '')
      if (!bankId || !id) return json(res, 400, { ok: false, error: '缺少 bankId 或 id' })
      if (!['refresh', 'dry-run', 'clear'].includes(action)) return json(res, 400, { ok: false, error: '未知操作' })
      const suffix = action === 'refresh' ? 'refresh' : action === 'dry-run' ? 'dry-run-refresh' : 'clear'
      const result = await upstream(
        file.raw,
        `/v1/default/banks/${encodeURIComponent(bankId)}/mental-models/${encodeURIComponent(id)}/${suffix}`,
        // A dry run costs the same LLM tokens as a real refresh, so give it the
        // same generous budget; the engine's reflect call can take minutes.
        { method: 'POST', timeoutMs: action === 'refresh' || action === 'dry-run' ? 240000 : 60000 },
      )
      if (!result.ok) return json(res, 200, { ok: false, error: result })
      json(res, 200, { ok: true, action, result: result.data })
    })

    route('/logs', async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost')
      const file = url.searchParams.get('file') || 'plugin'
      const lines = Math.min(2000, Math.max(20, Number(url.searchParams.get('lines') || 200)))
      json(res, 200, { ok: true, ...(await tailLog(file, lines)) })
    })
  })
}
