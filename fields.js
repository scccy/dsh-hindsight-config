/**
 * Field descriptors for ~/.hindsight/coding-agent.json.
 *
 * ONE source of truth shared by the Host half (validation, env layering,
 * "which fields need a restart") and the Client half (which fetches the list
 * from the Host and renders controls generically). Adding a field means
 * editing this file only.
 *
 * The `default`/`env`/`restart` values mirror @vectorize-io/hindsight-coding-agents
 * 0.8.2 (README "Reference" + dist/dsh.js resolveConfig). A field the plugin
 * adds later shows up in the raw JSON editor before it shows up here.
 */

/** @typedef {'string'|'secret'|'number'|'boolean'|'select'|'stringList'|'json'|'text'} FieldType */

export const GROUPS = [
  {
    id: 'connection',
    title: { zh: '连接', en: 'Connection' },
    hint: {
      zh: 'Hindsight 服务端地址与凭据。真实部署中服务端在另一台机器上——这里填的是可达地址，不是本机路径。',
      en: 'The Hindsight server address and credentials. In a real deployment the server runs on another machine: put a reachable URL here, not a local path.',
    },
  },
  {
    id: 'inject',
    title: { zh: '注入与召回', en: 'Injection & recall' },
    hint: {
      zh: '每个会话第一条提示注入什么、超时多少。',
      en: 'What gets injected on a session\'s first prompt, and its time budget.',
    },
  },
  {
    id: 'retain',
    title: { zh: '写入与成本', en: 'Retain & cost' },
    hint: {
      zh: '会话写回、抽取强度、并发。每轮对话的成本主要在这里。',
      en: 'Session write-back, extraction depth, and concurrency. This is where per-turn cost lives.',
    },
  },
  {
    id: 'ingest',
    title: { zh: '仓库摄取', en: 'Repository ingestion' },
    hint: {
      zh: 'git 历史与代码库勘察的深度。',
      en: 'Depth of git-history seeding and the codebase survey.',
    },
  },
  {
    id: 'pages',
    title: { zh: '知识页', en: 'Knowledge pages' },
    hint: {
      zh: '知识页何时刷新，以及每页要问什么。',
      en: 'When knowledge pages refresh, and what each one asks.',
    },
  },
  {
    id: 'scope',
    title: { zh: '作用范围与银行', en: 'Scope & banks' },
    hint: {
      zh: '哪些项目可以使用记忆、记忆写进哪个 bank。',
      en: 'Which projects may use memory, and which bank they write to.',
    },
  },
  {
    id: 'diag',
    title: { zh: '诊断', en: 'Diagnostics' },
    hint: { zh: '日志与自更新。', en: 'Logging and self-update.' },
  },
  {
    id: 'objects',
    title: { zh: '高级对象', en: 'Advanced objects' },
    hint: {
      zh: '这些字段是嵌套对象：按 Hindsight 的原始格式编辑，UI 只做语法校验。',
      en: 'Nested objects: edited in Hindsight\'s own shape. The UI only checks syntax.',
    },
  },
]

/** Fields that are objects/maps: no generic control, edited as JSON. */
const f = (key, group, type, extra) => ({ key, group, type, restart: true, ...extra })

export const FIELDS = [
  // ---------------------------------------------------------------- connection
  f('serverMode', 'connection', 'select', {
    default: 'cloud',
    options: ['cloud', 'self-hosted', 'daemon'],
    env: 'HINDSIGHT_SERVER_MODE',
    help: {
      zh: 'cloud = 官方云；self-hosted = 你自己部署的 HTTP 服务（跨机器就选这个）；daemon = 本机托管进程。',
      en: 'cloud = hosted service; self-hosted = your own HTTP server (this is the cross-machine case); daemon = a local managed process.',
    },
  }),
  f('apiUrl', 'connection', 'string', {
    default: 'https://api.hindsight.vectorize.io',
    env: 'HINDSIGHT_API_URL',
    placeholder: 'https://hindsight.example.internal',
    help: {
      zh: 'Hindsight API 根地址。跨机器时填对端可访问的 URL（含端口），例如 http://10.0.0.12:8888。',
      en: 'Hindsight API base URL. Cross-machine: a URL (with port) reachable from this machine, e.g. http://10.0.0.12:8888.',
    },
  }),
  f('apiPort', 'connection', 'number', {
    default: 9077,
    env: 'HINDSIGHT_API_PORT',
    min: 1,
    max: 65535,
    help: { zh: '仅 daemon 模式使用。', en: 'Only used in daemon mode.' },
  }),
  f('apiToken', 'connection', 'secret', {
    restart: false,
    env: 'HINDSIGHT_API_TOKEN',
    help: {
      zh: 'Bearer token。唯一改完立刻生效的字段（每次请求前重读）。出于安全，已保存的 token 不会回显。',
      en: 'Bearer token. The only field that applies immediately (re-read before every request). A saved token is never echoed back.',
    },
  }),
  f('disabled', 'connection', 'boolean', {
    default: false,
    help: { zh: '硬开关：整个插件进入无记忆状态。', en: 'Hard off-switch: the plugin becomes inert.' },
  }),
  f('embedVersion', 'connection', 'string', {
    default: 'latest',
    env: 'HINDSIGHT_EMBED_VERSION',
    help: { zh: 'daemon 模式运行的 hindsight-embed 版本。', en: 'hindsight-embed release used in daemon mode.' },
  }),
  f('embedPackagePath', 'connection', 'string', {
    env: 'HINDSIGHT_EMBED_PACKAGE_PATH',
    help: { zh: '指向本地 checkout 以运行自建 daemon（开发用）。', en: 'Run a local checkout instead of a release (development).' },
  }),

  // -------------------------------------------------------------------- inject
  f('autoInject', 'inject', 'select', {
    default: 'reflect',
    options: ['reflect', 'pages', 'recall', 'none'],
    help: {
      zh: '会话第一条提示注入什么：reflect（低预算综合，失败降级）/ pages（知识页检索）/ recall（记忆召回）/ none（不注入）。',
      en: 'What the first prompt injects: reflect (low-budget synthesis with fallbacks) / pages / recall / none.',
    },
  }),
  f('injectTimeoutMs', 'inject', 'number', {
    default: 7000,
    env: 'HINDSIGHT_INJECT_TIMEOUT_MS',
    min: 200,
    max: 120000,
    help: { zh: 'pages/recall 检索的时间预算。', en: 'Time budget for pages/recall retrieval.' },
  }),
  f('reflectTimeoutMs', 'inject', 'number', {
    default: 20000,
    min: 1000,
    max: 600000,
    help: { zh: '自动 session-reflect 的超时。', en: 'Timeout for the automatic session reflect.' },
  }),
  f('reflectToolTimeoutMs', 'inject', 'number', {
    default: 330000,
    min: 1000,
    max: 3600000,
    help: { zh: 'agent 主动调用的 hindsight_reflect 超时。', en: 'Timeout for the agent-invoked hindsight_reflect tool.' },
  }),
  f('reflectBudget', 'inject', 'select', {
    default: 'high',
    options: ['low', 'mid', 'high'],
    help: { zh: 'hindsight_reflect 工具的预算。', en: 'Budget for the hindsight_reflect tool.' },
  }),
  f('pageSearchLimit', 'inject', 'number', {
    default: 3,
    min: 1,
    max: 50,
    help: { zh: '一次知识页搜索返回几页。', en: 'Knowledge pages returned by one search.' },
  }),
  f('pageRefreshEveryTurns', 'inject', 'number', {
    default: 1,
    min: 0,
    max: 100,
    help: { zh: '每 N 轮重新取一次知识页列表（0 视作 1）。', en: 'Refetch the page roster every N turns (0 means 1).' },
  }),
  f('toolGuideExtra', 'inject', 'text', {
    help: { zh: '追加给模型的记忆使用守则（只追加，不替换内置文案）。', en: 'Extra memory guidance appended to the built-in text.' },
  }),

  // -------------------------------------------------------------------- retain
  f('retainSessions', 'retain', 'boolean', {
    default: true,
    help: { zh: '把会话写回 bank。关掉后召回与 git 摄取仍然工作。', en: 'Write sessions back to the bank. Recall and git ingest keep working when off.' },
  }),
  f('retainExtractionMode', 'retain', 'select', {
    default: 'concise',
    options: ['concise', 'verbose', 'verbatim', 'chunks'],
    help: {
      zh: '服务端如何抽取记忆。verbose 细节多但 token 成本数倍；chunks 只存原文不抽取。',
      en: 'How the server extracts memories. verbose is several times the tokens; chunks stores text only.',
    },
  }),
  f('maxParallelRetains', 'retain', 'number', {
    default: 10,
    min: 1,
    max: 64,
    env: 'HINDSIGHT_MAX_PARALLEL_RETAINS',
    help: { zh: '写入并发上限。出现 429 时调小它。', en: 'Concurrency cap for retains. Lower it on 429s.' },
  }),
  f('observationScopes', 'retain', 'select', {
    default: 'shared',
    options: ['shared', 'combined', 'per_tag', 'all_combinations', 'per_source'],
    help: {
      zh: '观测（observations）如何分组。shared = 每个 bank 一组信念，多个 agent 共用。',
      en: 'How observations are grouped. shared = one belief set per bank, shared by every agent.',
    },
  }),
  f('retainTags', 'retain', 'stringList', {
    help: { zh: '给每份写入文档加标签，支持 {gitProject} 等占位符。', en: 'Extra tags on every retained document; supports {gitProject} placeholders.' },
  }),
  f('retainContext', 'retain', 'text', {
    help: { zh: '每次写回携带的 context（抽取据此判断"这是谁的说法"）。', en: 'Context sent with every write-back; extraction uses it to attribute claims.' },
  }),

  // -------------------------------------------------------------------- ingest
  f('gitIngest', 'ingest', 'select', {
    default: 'message',
    options: ['message', 'full', 'none'],
    help: { zh: 'git 摄取深度：commit message / 含完整 diff / 关。', en: 'Git depth: commit messages / with full diffs / off.' },
  }),
  f('autoSeed', 'ingest', 'boolean', {
    default: true,
    help: { zh: '冷仓库首次开会话时用 git 历史自动播种。', en: 'Auto-seed a cold repo from git history on session start.' },
  }),
  f('seedLimit', 'ingest', 'number', {
    default: 300,
    min: 1,
    max: 100000,
    help: { zh: '播种最多取最近多少个 commit。', en: 'Most-recent-N commits to seed.' },
  }),
  f('codebaseSurvey', 'ingest', 'boolean', {
    default: true,
    help: { zh: '冷仓库自动做一次代码库结构勘察。', en: 'Run a structural survey of a cold repo.' },
  }),
  f('surveyModel', 'ingest', 'string', {
    default: 'haiku',
    help: { zh: '勘察使用的模型（仅 Claude 配方生效）。', en: 'Survey model (Claude recipe only).' },
  }),
  f('surveyBudgetUsd', 'ingest', 'number', {
    default: 2,
    min: 0,
    max: 1000,
    help: { zh: '勘察花费上限（美元，仅 Claude 配方生效）。', en: 'Survey spend cap in USD (Claude recipe only).' },
  }),
  f('surveyRefreshCommits', 'ingest', 'number', {
    default: 20,
    min: 0,
    max: 100000,
    help: { zh: '累计多少个新 commit 后重跑勘察（0 = 只做一次）。', en: 'Re-survey after this many new commits (0 = never again).' },
  }),
  f('manageBankConfig', 'ingest', 'boolean', {
    default: true,
    help: {
      zh: '允许插件塑造 bank 自身配置（retain 策略、entity 标签、missions）。只补缺，不覆盖你手改的值。',
      en: 'Let the plugin shape the bank config (strategies, entity labels, missions). Additive only.',
    },
  }),

  // --------------------------------------------------------------------- pages
  f('pageTriggerType', 'pages', 'select', {
    default: 'cron',
    options: ['cron', 'auto-refresh', 'manual'],
    help: {
      zh: '知识页何时刷新：cron（默认，每小时错峰）/ 每次整合后 / 手动。',
      en: 'When pages refresh: cron (hourly, staggered) / after every consolidation / manual.',
    },
  }),
  f('pageTriggerCron', 'pages', 'string', {
    default: 'H * * * *',
    placeholder: 'H * * * *',
    help: {
      zh: 'UTC 五段 cron；把某段写成 H 让每页错峰。',
      en: 'Five-field UTC cron; write H in a field to stagger each page.',
    },
  }),

  // --------------------------------------------------------------------- scope
  f('optInOnly', 'scope', 'boolean', {
    default: false,
    help: { zh: '只在 optInPaths 列出的项目里使用记忆，其余完全惰性。', en: 'Run memory only in optInPaths; everything else is inert.' },
  }),
  f('optInPaths', 'scope', 'stringList', {
    help: { zh: '允许使用记忆的目录前缀（~ 会展开）。', en: 'Directory prefixes allowed to use memory (~ is expanded).' },
  }),
  f('bankId', 'scope', 'string', {
    help: { zh: '固定 bank（设置后关闭按仓库动态解析）。', en: 'Static bank id; setting it disables per-repo resolution.' },
  }),
  f('dynamicBankId', 'scope', 'boolean', {
    help: { zh: '强制开/关动态解析（默认由是否设置 bankId 决定）。', en: 'Force dynamic (true) or static (false) resolution.' },
  }),
  f('bankIdTemplate', 'scope', 'string', {
    default: 'coding-agent::{gitProject}',
    help: { zh: '动态 bank 命名模板，占位符：{gitProject} {project} {harness} {channel} {user}。', en: 'Dynamic bank id template; placeholders: {gitProject} {project} {harness} {channel} {user}.' },
  }),
  f('resolveWorktrees', 'scope', 'boolean', {
    default: true,
    help: { zh: 'linked worktree 是否继承主仓库的 bank 身份与映射。', en: 'Linked worktrees inherit the main checkout\'s bank identity and mapping.' },
  }),

  // ---------------------------------------------------------------------- diag
  f('logLevel', 'diag', 'select', {
    default: 'info',
    options: ['debug', 'info', 'warn', 'error'],
    env: 'HINDSIGHT_LOG_LEVEL',
    help: { zh: '插件日志级别。', en: 'Plugin log level.' },
  }),
  f('autoUpdate', 'diag', 'boolean', {
    default: true,
    help: { zh: '每天检查一次 npm 并后台更新已安装的运行时。', en: 'Check npm daily and re-stage the runtime in the background.' },
  }),

  // ------------------------------------------------------------------- objects
  f('recallOptions', 'objects', 'json', {
    help: { zh: '合并进每次 recall 请求体的覆盖项，例如 {"max_tokens": 4000}。', en: 'Overrides merged into every recall body, e.g. {"max_tokens": 4000}.' },
  }),
  f('retainMetadata', 'objects', 'json', {
    help: { zh: '每份写入文档的额外 metadata，例如 {"repo": "{gitProject}"}。', en: 'Extra metadata on every retained document, e.g. {"repo": "{gitProject}"}.' },
  }),
  f('defaultBankConfig', 'objects', 'json', {
    help: { zh: '新 bank 的默认 bank-config 字段，例如 {"enable_observations": false}。', en: 'Bank-config fields for banks the plugin creates.' },
  }),
  f('mapPathToBank', 'objects', 'json', {
    help: { zh: '路径前缀 → bank，最长前缀优先。', en: 'Path prefix → bank; longest prefix wins.' },
  }),
  f('banks', 'objects', 'json', {
    help: { zh: '按解析后的 bank id 覆盖任意行为字段（含 bank 改名）。', en: 'Per-resolved-bank overrides of any behavioural field.' },
  }),
  f('paths', 'objects', 'json', {
    help: { zh: '按目录前缀覆盖连接类设置（例如客户项目用另一个服务端）。', en: 'Per-directory overrides, e.g. a client project on another server.' },
  }),
  f('pages', 'objects', 'json', {
    help: { zh: '内置五张知识页的开关与提问（false = 不播种，{"source_query": "..."} = 换问法）。', en: 'The five built-in pages: false skips, {"source_query": "..."} rewords.' },
  }),
  f('customPages', 'objects', 'json', {
    help: { zh: '自定义知识页，例如 {"Security posture": {"source_query": "...", "tags": ["knowledge:decision"]}}。', en: 'Your own knowledge pages.' },
  }),
  f('harnesses', 'objects', 'json', {
    help: { zh: '按 harness 覆盖（本机是 dsh），例如 {"dsh": {"retainSessions": false}}。', en: 'Per-harness overrides; this host is "dsh".' },
  }),
]

/** Top-level keys the plugin accepts but that are not settings (so not "unknown"). */
export const KNOWN_EXTRA_KEYS = ['harnesses', 'paths', 'banks', 'autoReflect', 'daemonIdleTimeout']

/** Harness id this profile is, used for the harnesses.<id> layer. */
export const HARNESS = 'dsh'

/**
 * The engine release these descriptors were transcribed from (README
 * "Reference" + dist/dsh.js resolveConfig). The panel reports drift instead of
 * pretending: a newer engine may add fields the form cannot show yet.
 */
export const ENGINE_BASELINE = '0.8.2'

/** Package whose Host row is the memory engine this panel configures. */
export const ENGINE_PACKAGE = '@vectorize-io/hindsight-coding-agents'

/**
 * The five pages the engine seeds from its taxonomy (dist/deepen.js PAGE_TAXONOMY).
 * Their `source_query`/`tags`/`trigger` are re-pushed from the client config on
 * every session, so an edit must land in BOTH places to survive: the config
 * (`pages.<name>.source_query`) and the server.
 */
export const TAXONOMY_PAGES = [
  'Component map',
  'Core concepts',
  'Conventions and patterns',
  'Key decisions and rationale',
  'Initiatives and enhancements',
]

/** Case-insensitive taxonomy lookup, matching how the engine matches page names. */
export function taxonomyName(name) {
  const wanted = String(name || '').trim().toLowerCase()
  return TAXONOMY_PAGES.find((page) => page.toLowerCase() === wanted) ?? null
}

/** Fields whose saved value applies without a host restart. */
export function immediateKeys() {
  return FIELDS.filter((field) => field.restart === false).map((field) => field.key)
}

/** Coerce one raw file value to a displayable/`effective` value, or report why not. */
export function coerce(field, value) {
  if (value === undefined || value === null || value === '') return undefined
  switch (field.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return null
      if (field.min !== undefined && n < field.min) return null
      if (field.max !== undefined && n > field.max) return null
      return n
    }
    case 'boolean':
      if (typeof value === 'boolean') return value
      if (value === 'true') return true
      if (value === 'false') return false
      return null
    case 'select':
      return field.options?.includes(String(value)) ? String(value) : null
    case 'stringList':
      if (Array.isArray(value)) return value.map((v) => String(v)).filter((v) => v.trim() !== '')
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      }
      return null
    case 'json':
      return typeof value === 'object' ? value : null
    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : null
  }
}
