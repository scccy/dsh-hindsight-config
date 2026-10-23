/**
 * Client half of dsh-hindsight-config.
 *
 * Registers one configuration cell on the Hindsight bundle's own page in the
 * Plugins section (`plugins.bundle.config`, keyed by that bundle's package
 * name). Everything is rendered from the field descriptors the Host serves, so
 * adding a setting needs no change here.
 *
 * No Harness Client package is imported at runtime: React comes from the module
 * table, and the controls below are this plugin's own, styled with the host's
 * theme tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-hindsight-config',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'dsh-hindsight-config'
    const API = '/hindsight-config/api'

    /* ------------------------------------------------------------- dictionary */

    const zh = {
      title: 'Hindsight 记忆配置',
      navLabel: 'Hindsight 记忆',
      subtitle: '客户端配置写入本机文件；服务端数据通过 HTTP + token 修改，服务端可以运行在另一台机器上。',
      provider: '官方插件包本身没有配置项，它只读那份 JSON 文件；配置入口是本页与「设置 → Hindsight 记忆」。',
      restartNote: '除 apiToken 外，改动要重启 DSH 才生效（插件按 workspace 缓存配置，运行中的会话不会重读）。',
      tabStatus: '状态',
      tabClient: '客户端配置',
      tabServer: '服务端',
      tabRaw: '原始 JSON',
      tabDiag: '诊断',
      test: '测试连接',
      testing: '连接中…',
      reload: '重新读取',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      discard: '撤销改动',
      unsaved: '有未保存的改动',
      noChanges: '没有改动',
      defaults: '默认值',
      unset: '未设置',
      unknown: '未知',
      on: '开',
      off: '关',
      follow: '跟随默认',
      sourceDefault: '默认',
      sourceEnv: '环境变量',
      sourceFile: '配置文件',
      sourceHarness: 'harness 覆盖',
      sourceInvalid: '取值无效',
      tokenSaved: '已保存（不回显）',
      tokenNone: '未设置',
      tokenUnset: '清除 token',
      tokenKeep: '保持不变',
      tokenSet: '设置新 token',
      tokenPlaceholder: '粘贴 bearer token（保存后不回显）',
      configPath: '配置文件',
      fileState: '文件状态',
      missingFile: '文件不存在：保存时会创建',
      parseError: '这个文件当前无法解析，Hindsight 会静默丢弃全部配置',
      invalidTitle: '配置文件内容（只读，token 已隐藏）',
      overwriteEmpty: '覆盖为空对象（危险）',
      overwriteConfirm: '这会把现有文件整体替换为空对象 {}。确定？',
      envPresent: '生效中的环境变量',
      envAbsent: '没有相关环境变量',
      effective: '生效值',
      key: '字段',
      value: '值',
      origin: '来源',
      serverCard: '服务端连通性',
      engineCard: '记忆引擎',
      engineMounted: '已挂载',
      engineNotInstalled: '未安装',
      engineInactive: '已安装，但未激活',
      engineState: '状态',
      engineRow: 'Loader 行',
      engineVersionLabel: '引擎版本',
      engineBaselineLabel: '表单字段基准',
      engineMissingHint: '面板仍能连接服务端、读 bank 统计、改 bank 配置 —— 但 DSH 里不会产生记忆（没有注入、没有 hindsight_* 工具）。装本包会一并插入 id: hindsight 的引擎行，若被手工去掉，加回该行即可。',
      engineInactiveHint: '引擎行存在但没有 active：可能在等依赖，或启动失败。看「诊断」页签的插件日志，或宿主的启动输出。',
      engineDriftHint: '引擎版本与表单字段基准不一致：新字段可能还没出现在表单里，用「原始 JSON」改，或更新本面板。',
      engineUnknown: '未上报',
      engineUnknownHint: '宿主还是在旧代码上运行，没有提供引擎自检。重启宿主后再看这一项。',
      serverUnreachable: '无法连接服务端',
      serverOk: '服务端可达',
      latency: '响应',
      health: '健康检查',
      version: '服务端版本',
      features: '服务端特性',
      serverHint: '服务端地址取自「客户端配置 → 连接」，未保存的输入也能用来测试。',
      bankTitle: 'Bank',
      bankPick: '选择 bank',
      bankNone: '还没有 bank',
      bankLoad: '加载中…',
      bankDocuments: '文档',
      bankNodes: '记忆节点',
      bankObservations: '观测',
      bankPending: '待处理操作',
      bankFailed: '失败操作',
      bankLastConsolidation: '上次整合',
      bankConfig: 'Bank 配置（服务端）',
      bankConfigHint: '这些值写在服务端该 bank 的配置里，立即对后续写入/召回生效。只提交你改动的字段。',
      bankApply: '写入服务端',
      aliasTitle: 'Bank 别名',
      aliasHint: '别名是"另一个也能到达这个 bank 的 id"。改目录名时最有用：先给旧 bank 加新目录名作别名，再改目录，新会话就还是写进同一个 bank（记忆不丢、不冷启动）。别名不能已经是某个 bank 或另一个别名。',
      aliasNone: '还没有别名',
      aliasPlaceholder: 'coding-agent::新目录名',
      aliasAdd: '添加别名',
      aliasPrimary: '显示名',
      aliasMakePrimary: '设为显示名',
      aliasRemove: '删除',
      mmTitle: '心智模型（知识页）',
      mmHint: '心智模型就是知识页。编辑会立刻 PATCH 到服务端；内置五页的问法与刷新节奏由客户端配置托管，下次会话会被重推，所以改它们的 source_query 时面板会同时写入客户端配置。',
      mmNone: '还没有心智模型（这个 bank 还没播种知识页）',
      mmTaxonomy: '内置页',
      mmStale: '待刷新',
      mmFailed: '刷新失败',
      mmRefreshing: '刷新中…',
      mmLastRefreshed: '上次刷新',
      mmLastFailed: '上次失败',
      mmRefresh: '刷新',
      mmDryRun: '预览',
      mmEdit: '编辑',
      mmDelete: '删除',
      mmCancel: '取消',
      mmCronPlaceholder: '刷新 cron，如 17 * * * *（服务端不接受 H）',
      mmTaxonomyWarn: '这是内置页：source_query 会同时写入客户端配置（pages），否则下次会话被覆盖；刷新 cron 只改服务端，会被配置里的全局节奏重推。',
      mmOwnWarn: '这一页不归内置分类托管：source_query 可以直接改，引擎不会覆盖。',
      mmConfigAlso: '同时已写入客户端配置',
      mmConfigWriteFailed: '服务端已改，但写客户端配置失败',
      mmName: '名称',
      mmTagsPlaceholder: 'tags，逗号分隔（如 knowledge:decision）',
      mmMode: '刷新模式',
      mmBudget: '预算',
      mmMinInterval: '最小刷新间隔（秒）',
      mmAfterConsolidation: '整合后刷新',
      mmFactTypesPlaceholder: 'fact_types，如 world, experience, observation',
      mmAdvanced: '高级 JSON',
      mmBackToForm: '返回表单',
      mmJsonHint: '整份心智模型配置（name / source_query / max_tokens / tags / trigger）。trigger 里还有 mode、budget、fact_types、tags_match、exclude_mental_models、keep_trace、response_schema 等 17 个字段，表单只放了常用的，其余在这里改。',
      mmCronExclusive: '服务端把「整合后刷新」和「刷新 cron」视为互斥：开启前者会清掉 cron。',
      bankApplied: '已写入服务端',
      bankOverride: '已有覆盖',
      advanced: '高级对象',
      advancedHint: '按 Hindsight 原始 JSON 格式编辑；语法错误会阻止保存。',
      rawHint: '整份 ~/.hindsight/coding-agent.json。未知字段会原样保留。',
      validate: '校验',
      validOk: '校验通过',
      logs: '日志',
      logPlugin: '插件日志',
      logDiag: '结构化诊断',
      logUsage: '工具用量',
      refresh: '刷新',
      warnings: '警告',
      errors: '错误',
      empty: '暂无数据',
      errorPrefix: '出错：',
      unreachableHint: '跨机器部署时先确认：地址与端口可达、防火墙放行、apiToken 正确、TLS 证书可信。',
      resetHint: '「撤销改动」恢复到文件里当前的值。',
      closeDetail: '收起',
    }

    const en = {
      title: 'Hindsight memory configuration',
      navLabel: 'Hindsight memory',
      subtitle: 'Client settings go to this machine\'s config file; server-side data is changed over HTTP with a token, and the server may run on another machine.',
      provider: 'The official plugin has no configuration of its own — it only reads that JSON file. This page and Settings → Hindsight memory are the entry points.',
      restartNote: 'Everything except apiToken applies only after DSH restarts (the plugin caches config per workspace; live sessions do not re-read it).',
      tabStatus: 'Status',
      tabClient: 'Client settings',
      tabServer: 'Server',
      tabRaw: 'Raw JSON',
      tabDiag: 'Diagnostics',
      test: 'Test connection',
      testing: 'Connecting…',
      reload: 'Reload',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      discard: 'Revert',
      unsaved: 'Unsaved changes',
      noChanges: 'No changes',
      defaults: 'default',
      unset: 'unset',
      unknown: 'unknown',
      on: 'On',
      off: 'Off',
      follow: 'Inherit',
      sourceDefault: 'default',
      sourceEnv: 'env',
      sourceFile: 'file',
      sourceHarness: 'harness override',
      sourceInvalid: 'invalid',
      tokenSaved: 'saved (never echoed)',
      tokenNone: 'not set',
      tokenUnset: 'Clear token',
      tokenKeep: 'Keep current',
      tokenSet: 'Set a new token',
      tokenPlaceholder: 'Paste a bearer token (not echoed after saving)',
      configPath: 'Config file',
      fileState: 'File state',
      missingFile: 'File does not exist yet: saving creates it',
      parseError: 'This file cannot be parsed right now, so Hindsight silently drops every setting',
      invalidTitle: 'File contents (read-only, token hidden)',
      overwriteEmpty: 'Overwrite with an empty object (destructive)',
      overwriteConfirm: 'This replaces the whole file with {}. Continue?',
      envPresent: 'Environment variables in effect',
      envAbsent: 'No related environment variables',
      effective: 'Effective values',
      key: 'Field',
      value: 'Value',
      origin: 'Source',
      serverCard: 'Server reachability',
      engineCard: 'Memory engine',
      engineMounted: 'mounted',
      engineNotInstalled: 'not installed',
      engineInactive: 'installed, not active',
      engineState: 'state',
      engineRow: 'Loader row',
      engineVersionLabel: 'engine version',
      engineBaselineLabel: 'form field baseline',
      engineMissingHint: 'The panel can still reach the server, read bank stats and change bank configuration — but nothing provides memory inside DSH (no injection, no hindsight_* tools). Installing this bundle inserts the `id: hindsight` engine row; add it back if it was removed.',
      engineInactiveHint: 'The engine row exists but is not active: it may be waiting for a dependency, or it failed to start. Check the plugin log on the Diagnostics tab.',
      engineDriftHint: 'Engine version differs from the form field baseline: new fields may not be in the form yet. Use the Raw JSON tab, or update this panel.',
      engineUnknown: 'not reported',
      engineUnknownHint: 'The Host is still running older code and does not report the engine self-check. Restart the Host and look again.',
      serverUnreachable: 'Cannot reach the server',
      serverOk: 'Server reachable',
      latency: 'Response',
      health: 'Health',
      version: 'Server version',
      features: 'Server features',
      serverHint: 'The address comes from Client settings → Connection; unsaved input can be tested too.',
      bankTitle: 'Bank',
      bankPick: 'Pick a bank',
      bankNone: 'No banks yet',
      bankLoad: 'Loading…',
      bankDocuments: 'Documents',
      bankNodes: 'Memory nodes',
      bankObservations: 'Observations',
      bankPending: 'Pending operations',
      bankFailed: 'Failed operations',
      bankLastConsolidation: 'Last consolidation',
      bankConfig: 'Bank configuration (server side)',
      bankConfigHint: 'These live in the bank config on the server and affect the next writes and recalls. Only changed fields are submitted.',
      bankApply: 'Write to server',
      aliasTitle: 'Bank aliases',
      aliasHint: 'An alias is another id that also reaches this bank. Most useful when renaming a directory: add the new directory name as an alias first, then rename the folder — new sessions still write to this bank (no lost memory, no cold start). An alias must not already name a bank or another alias.',
      aliasNone: 'No aliases yet',
      aliasPlaceholder: 'coding-agent::new-directory-name',
      aliasAdd: 'Add alias',
      aliasPrimary: 'shown as',
      aliasMakePrimary: 'Show as this name',
      aliasRemove: 'Remove',
      mmTitle: 'Mental models (knowledge pages)',
      mmHint: 'A mental model is a knowledge page. Edits PATCH the server immediately. The five seeded pages take their question and refresh policy from the client config and are re-pushed next session, so editing their source_query also writes the config.',
      mmNone: 'No mental models yet (this bank has not seeded its pages)',
      mmTaxonomy: 'seeded',
      mmStale: 'stale',
      mmFailed: 'refresh failed',
      mmRefreshing: 'refreshing…',
      mmLastRefreshed: 'last refreshed',
      mmLastFailed: 'last failed',
      mmRefresh: 'Refresh',
      mmDryRun: 'Preview',
      mmEdit: 'Edit',
      mmDelete: 'Delete',
      mmCancel: 'Cancel',
      mmCronPlaceholder: 'refresh cron, e.g. 17 * * * * (the server rejects H)',
      mmTaxonomyWarn: 'Seeded page: source_query is also written to the client config (pages), otherwise the next session overwrites it. A cron change here only touches the server and is re-pushed from the global policy.',
      mmOwnWarn: 'This page is not part of the seeded taxonomy: source_query is safe to edit, the engine will not overwrite it.',
      mmConfigAlso: 'Also written to the client config',
      mmConfigWriteFailed: 'Server updated, but writing the client config failed',
      mmName: 'name',
      mmTagsPlaceholder: 'tags, comma separated (e.g. knowledge:decision)',
      mmMode: 'refresh mode',
      mmBudget: 'budget',
      mmMinInterval: 'min refresh interval (s)',
      mmAfterConsolidation: 'refresh after consolidation',
      mmFactTypesPlaceholder: 'fact_types, e.g. world, experience, observation',
      mmAdvanced: 'Advanced JSON',
      mmBackToForm: 'Back to form',
      mmJsonHint: 'The whole mental-model config (name / source_query / max_tokens / tags / trigger). trigger carries 17 fields — mode, budget, fact_types, tags_match, exclude_mental_models, keep_trace, response_schema and more; the form shows the common ones, edit the rest here.',
      mmCronExclusive: 'The server treats "refresh after consolidation" and "refresh cron" as mutually exclusive: turning the former on clears the cron.',
      bankApplied: 'Written to server',
      bankOverride: 'overridden',
      advanced: 'Advanced objects',
      advancedHint: 'Edited as Hindsight\'s own JSON; a syntax error blocks saving.',
      rawHint: 'The whole ~/.hindsight/coding-agent.json. Unknown fields are preserved.',
      validate: 'Validate',
      validOk: 'Valid',
      logs: 'Logs',
      logPlugin: 'Plugin log',
      logDiag: 'Structured diagnostics',
      logUsage: 'Tool usage',
      refresh: 'Refresh',
      warnings: 'Warnings',
      errors: 'Errors',
      empty: 'Nothing yet',
      errorPrefix: 'Error: ',
      unreachableHint: 'Cross-machine setups: check address and port reachability, firewall, apiToken, and TLS trust.',
      resetHint: '"Revert" restores what the file currently holds.',
      closeDetail: 'Collapse',
    }

    function isZhNow() {
      try {
        const lang = window.document.documentElement.lang || navigator.language || ''
        return /^zh/i.test(lang)
      } catch {
        return true
      }
    }

    /* ----------------------------------------------------------------- styles */

    const CSS = `
.dhc-root { display: flex; flex-direction: column; gap: 14px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.dhc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dhc-title { font-size: 15px; font-weight: 600; }
.dhc-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; margin-top: 2px; }
.dhc-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex-wrap: wrap; }
.dhc-tab { appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--dsw-alias-label-secondary); padding: 7px 10px; font: inherit; cursor: pointer; }
.dhc-tab[data-active="true"] { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); font-weight: 600; }
.dhc-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 12px 14px; }
.dhc-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.dhc-card-title { font-weight: 600; }
.dhc-group { margin-top: 12px; }
.dhc-group-title { font-weight: 600; margin-bottom: 2px; }
.dhc-group-hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; margin-bottom: 8px; }
.dhc-row { display: grid; grid-template-columns: minmax(180px, 240px) 1fr; gap: 10px 14px; padding: 7px 0; border-top: 1px solid var(--dsw-alias-border-l1); align-items: start; }
.dhc-row:first-of-type { border-top: 0; }
.dhc-label { display: flex; flex-direction: column; gap: 2px; padding-top: 5px; }
.dhc-label code { font-size: 11px; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dhc-help { color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.45; }
.dhc-control { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dhc-input, .dhc-select, .dhc-area { width: 100%; box-sizing: border-box; font: inherit; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; padding: 6px 8px; }
.dhc-area { min-height: 62px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.dhc-input:focus, .dhc-select:focus, .dhc-area:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.dhc-btns { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dhc-btn { appearance: none; font: inherit; cursor: pointer; border-radius: 7px; padding: 6px 12px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dhc-btn:hover { border-color: var(--dsw-alias-brand-primary); }
.dhc-btn[data-kind="primary"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.dhc-btn[data-kind="danger"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dhc-btn:disabled { opacity: 0.5; cursor: default; }
.dhc-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 2px 8px; font-size: 11px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.dhc-badge[data-tone="ok"] { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.dhc-badge[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.dhc-badge[data-tone="bad"] { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dhc-banner { border-radius: 9px; padding: 9px 12px; line-height: 1.5; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
.dhc-banner[data-tone="warn"] { border-color: var(--dsw-alias-state-warn-primary); }
.dhc-banner[data-tone="bad"] { border-color: var(--dsw-alias-state-error-primary); }
.dhc-banner[data-tone="ok"] { border-color: var(--dsw-alias-state-success-primary); }
.dhc-kv { display: grid; grid-template-columns: minmax(140px, 200px) 1fr; gap: 6px 12px; }
.dhc-kv > dt { color: var(--dsw-alias-label-secondary); }
.dhc-kv > dd { margin: 0; word-break: break-all; }
.dhc-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
.dhc-pre { margin: 0; padding: 10px; border-radius: 8px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; line-height: 1.55; }
.dhc-muted { color: var(--dsw-alias-label-secondary); }
.dhc-err { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.dhc-warn { color: var(--dsw-alias-state-warn-primary); font-size: 12px; }
.dhc-ok { color: var(--dsw-alias-state-success-primary); font-size: 12px; }
.dhc-foot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding-top: 4px; }
.dhc-spin { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-brand-primary); animation: dhc-spin 0.8s linear infinite; }
@keyframes dhc-spin { to { transform: rotate(360deg); } }
.dhc-list { display: flex; flex-direction: column; gap: 6px; }
.dhc-bankrow { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; cursor: pointer; background: none; color: inherit; font: inherit; text-align: left; }
.dhc-bankrow[data-active="true"] { border-color: var(--dsw-alias-brand-primary); }
`

    function Styles() {
      return h('style', { 'data-dhc': 'styles' }, CSS)
    }

    /* --------------------------------------------------------------- primitives */

    function Tabs({ t, value, onChange, items }) {
      return h(
        'div',
        { className: 'dhc-tabs', role: 'tablist' },
        items.map((item) =>
          h(
            'button',
            {
              key: item.id,
              type: 'button',
              role: 'tab',
              className: 'dhc-tab',
              'data-active': String(value === item.id),
              'aria-selected': value === item.id,
              onClick: () => onChange(item.id),
            },
            t(item.label),
          ),
        ),
      )
    }

    function Banner({ tone, children }) {
      return h('div', { className: 'dhc-banner', 'data-tone': tone || 'neutral' }, children)
    }

    function Badge({ tone, children }) {
      return h('span', { className: 'dhc-badge', 'data-tone': tone || 'neutral' }, children)
    }

    function Spinner() {
      return h('span', { className: 'dhc-spin', 'aria-hidden': 'true' })
    }

    function api(path, options = {}) {
      const { method = 'GET', body } = options
      return fetch(API + path, {
        method,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }).then(async (response) => {
        const text = await response.text()
        let parsed
        try {
          parsed = text ? JSON.parse(text) : null
        } catch {
          parsed = { ok: false, error: text.slice(0, 500) }
        }
        if (!response.ok) {
          const error = new Error(parsed?.error || `HTTP ${response.status}`)
          error.payload = parsed
          throw error
        }
        return parsed
      })
    }

    /* ------------------------------------------------------------ field controls */

    function valueToString(field, value) {
      if (value === undefined) return ''
      if (field.type === 'boolean') return String(value)
      if (field.type === 'stringList') return Array.isArray(value) ? value.join(', ') : String(value)
      if (field.type === 'json') return JSON.stringify(value, null, 2)
      return String(value)
    }

    function FieldControl({ t, field, text, onChange, disabled }) {
      if (field.type === 'boolean') {
        return h(
          'select',
          { className: 'dhc-select', value: text, disabled, onChange: (event) => onChange(event.target.value) },
          h('option', { value: '' }, t('follow')),
          h('option', { value: 'true' }, t('on')),
          h('option', { value: 'false' }, t('off')),
        )
      }
      if (field.type === 'select') {
        return h(
          'select',
          { className: 'dhc-select', value: text, disabled, onChange: (event) => onChange(event.target.value) },
          h('option', { value: '' }, t('follow')),
          field.options.map((option) => h('option', { key: option, value: option }, option)),
        )
      }
      if (field.type === 'secret') {
        return h('input', {
          className: 'dhc-input',
          type: 'password',
          autocomplete: 'off',
          placeholder: t('tokenPlaceholder'),
          value: text,
          disabled,
          onChange: (event) => onChange(event.target.value),
        })
      }
      if (field.type === 'number') {
        return h('input', {
          className: 'dhc-input',
          type: 'number',
          inputMode: 'numeric',
          min: field.min,
          max: field.max,
          placeholder: t('unset'),
          value: text,
          disabled,
          onChange: (event) => onChange(event.target.value),
        })
      }
      if (field.type === 'json' || field.type === 'text') {
        return h('textarea', {
          className: 'dhc-area',
          rows: field.type === 'json' ? 6 : 3,
          spellcheck: false,
          placeholder: t('unset'),
          value: text,
          disabled,
          onChange: (event) => onChange(event.target.value),
        })
      }
      return h('input', {
        className: 'dhc-input',
        type: 'text',
        spellcheck: false,
        placeholder: field.placeholder || t('unset'),
        value: text,
        disabled,
        onChange: (event) => onChange(event.target.value),
      })
    }

    function sourceLabel(t, source) {
      if (!source) return ''
      if (source.startsWith('harnesses.')) return t('sourceHarness')
      if (source === 'default') return t('sourceDefault')
      if (source === 'env') return t('sourceEnv')
      if (source === 'file') return t('sourceFile')
      if (source === 'invalid') return t('sourceInvalid')
      return source
    }

    function FieldRow({ t, field, text, onChange, source, disabled }) {
      const loc = isZhNow() ? 'zh' : 'en'
      const help = field.help ? field.help[loc] || field.help.zh : ''
      return h(
        'div',
        { className: 'dhc-row' },
        h(
          'div',
          { className: 'dhc-label' },
          h('span', null, help || field.key),
          h('code', null, field.key),
          source
            ? h(
                'span',
                { className: 'dhc-help' },
                `${t('origin')}: ${sourceLabel(t, source)}`,
              )
            : null,
        ),
        h('div', { className: 'dhc-control' }, h(FieldControl, { t, field, text, onChange, disabled })),
      )
    }

    /* ---------------------------------------------------------------- the panel */

    function Panel({ t }) {
      const loc = isZhNow() ? 'zh' : 'en'
      const [tab, setTab] = useState('status')
      const [state, setState] = useState(null)
      const [loadError, setLoadError] = useState(null)
      const [loading, setLoading] = useState(false)

      // editable drafts
      const [draft, setDraft] = useState({})          // key -> display string
      const [tokenAction, setTokenAction] = useState('keep')
      const [tokenValue, setTokenValue] = useState('')
      const [saveState, setSaveState] = useState({ status: 'idle' })
      const [clientErrors, setClientErrors] = useState([])
      const [clientWarnings, setClientWarnings] = useState([])

      const [rawText, setRawText] = useState('')
      const [rawMsg, setRawMsg] = useState(null)

      const [probe, setProbe] = useState({ status: 'idle' })
      const [banks, setBanks] = useState({ status: 'idle', items: [] })
      const [bankId, setBankId] = useState(null)
      const [bankDetail, setBankDetail] = useState({ status: 'idle' })
      const [bankDraft, setBankDraft] = useState({})
      const [bankSave, setBankSave] = useState({ status: 'idle' })
      const [aliases, setAliases] = useState({ status: 'idle', items: [] })
      const [aliasDraft, setAliasDraft] = useState('')
      const [aliasBusy, setAliasBusy] = useState(false)
      const [aliasMsg, setAliasMsg] = useState(null)
      const [models, setModels] = useState({ status: 'idle', items: [], taxonomy: [] })
      const [modelEdit, setModelEdit] = useState(null)
      const [modelBusy, setModelBusy] = useState(false)
      const [modelMsg, setModelMsg] = useState(null)
      const [logFile, setLogFile] = useState('plugin')
      const [logState, setLogState] = useState({ status: 'idle' })

      const load = useCallback(() => {
        setLoading(true)
        setLoadError(null)
        api('/state')
          .then((data) => {
            setState(data)
            const nextDraft = {}
            for (const field of data.fields) {
              if (field.type === 'secret') continue
              nextDraft[field.key] = valueToString(field, data.raw[field.key])
            }
            setDraft(nextDraft)
            setTokenAction('keep')
            setTokenValue('')
            setRawText(JSON.stringify(data.raw, null, 2))
            setSaveState({ status: 'idle' })
            setClientErrors(data.errors || [])
            setClientWarnings(data.warnings || [])
          })
          .catch((error) => setLoadError(String(error.message || error)))
          .finally(() => setLoading(false))
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const fields = state?.fields || []
      const groups = state?.groups || []

      const unknownKeys = useMemo(() => {
        if (!state) return []
        const known = new Set(fields.map((field) => field.key))
        return Object.keys(state.raw).filter((key) => !known.has(key) && key !== 'apiToken')
      }, [state, fields])

      const dirty = useMemo(() => {
        if (!state) return false
        for (const field of fields) {
          if (field.type === 'secret') continue
          const before = valueToString(field, state.raw[field.key])
          if ((draft[field.key] ?? '') !== before) return true
        }
        return tokenAction !== 'keep' && !(tokenAction === 'set' && tokenValue === '')
      }, [state, fields, draft, tokenAction, tokenValue])

      const compose = useCallback(() => {
        const errors = []
        const raw = {}
        for (const key of unknownKeys) raw[key] = state.raw[key]
        for (const field of fields) {
          if (field.type === 'secret') continue
          const text = draft[field.key] ?? ''
          if (text.trim() === '') continue
          if (field.type === 'boolean') raw[field.key] = text === 'true'
          else if (field.type === 'number') {
            const number = Number(text)
            if (!Number.isFinite(number)) errors.push({ key: field.key, message: '必须是数字' })
            else raw[field.key] = number
          } else if (field.type === 'stringList') {
            raw[field.key] = text
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean)
          } else if (field.type === 'json') {
            try {
              const parsed = JSON.parse(text)
              if (parsed && typeof parsed === 'object') raw[field.key] = parsed
              else errors.push({ key: field.key, message: '必须是 JSON 对象' })
            } catch (error) {
              errors.push({ key: field.key, message: `JSON 语法错误：${error.message}` })
            }
          } else raw[field.key] = text
        }
        return { raw, errors }
      }, [draft, fields, unknownKeys, state])

      const save = useCallback(() => {
        const { raw, errors } = compose()
        if (errors.length) {
          setClientErrors(errors)
          setClientWarnings([])
          return
        }
        setSaveState({ status: 'saving' })
        api('/save', { method: 'POST', body: { raw, token: { action: tokenAction, value: tokenValue } } })
          .then((data) => {
            setSaveState({ status: 'saved', data })
            setClientErrors(data.errors || [])
            setClientWarnings(data.warnings || [])
            load()
          })
          .catch((error) => {
            setSaveState({ status: 'error', message: String(error.message || error) })
            const payload = error.payload || {}
            setClientErrors(payload.errors || [])
            setClientWarnings(payload.warnings || [])
          })
      }, [compose, tokenAction, tokenValue, load])

      const reload = useCallback(() => {
        setProbe({ status: 'idle' })
        setBanks({ status: 'idle', items: [] })
        setBankDetail({ status: 'idle' })
        setLogState({ status: 'idle' })
        setRawMsg(null)
        load()
      }, [load])

      const runProbe = useCallback(() => {
        setProbe({ status: 'loading' })
        const endpoint = {}
        if (draft.apiUrl && draft.apiUrl.trim()) endpoint.apiUrl = draft.apiUrl.trim()
        if (draft.serverMode) endpoint.serverMode = draft.serverMode
        if (tokenAction === 'set' && tokenValue) endpoint.apiToken = tokenValue
        const started = Date.now()
        api('/probe', { method: 'POST', body: { endpoint } })
          .then((data) => setProbe({ status: 'done', data, elapsed: Date.now() - started }))
          .catch((error) => setProbe({ status: 'done', data: { ok: false, health: { ok: false, message: String(error.message || error) } }, elapsed: Date.now() - started }))
      }, [draft, tokenAction, tokenValue])

      const loadBanks = useCallback(() => {
        setBanks((previous) => ({ ...previous, status: 'loading' }))
        api('/banks')
          .then((data) => {
            if (!data.ok) {
              setBanks({ status: 'done', items: [], error: data.error })
              return
            }
            setBanks({ status: 'done', items: data.banks, apiUrl: data.apiUrl })
            setBankId((current) => current || (data.banks[0] ? data.banks[0].id : null))
          })
          .catch((error) => setBanks({ status: 'done', items: [], error: { message: String(error.message || error) } }))
      }, [])

      useEffect(() => {
        if (tab === 'server' && banks.status === 'idle') loadBanks()
      }, [tab, banks.status, loadBanks])

      const loadBank = useCallback((id) => {
        if (!id) return
        setBankDetail({ status: 'loading' })
        setBankSave({ status: 'idle' })
        api(`/bank?bankId=${encodeURIComponent(id)}`)
          .then((data) => {
            setBankDetail({ status: 'done', data })
            const nextDraft = {}
            for (const entry of data.curated || []) {
              nextDraft[entry.key] =
                entry.value === null || entry.value === undefined ? '' : String(entry.value)
            }
            setBankDraft(nextDraft)
          })
          .catch((error) => setBankDetail({ status: 'done', data: { ok: false, error: { message: String(error.message || error) } } }))
      }, [])

      const loadModels = useCallback((id) => {
        if (!id) return
        setModels((previous) => ({ ...previous, status: 'loading' }))
        api(`/mental-models?bankId=${encodeURIComponent(id)}`)
          .then((data) => {
            if (!data.ok) {
              setModels({ status: 'done', items: [], taxonomy: [], error: data.error })
              return
            }
            setModels({ status: 'done', items: data.models || [], taxonomy: data.taxonomy || [], refreshing: Boolean(data.refreshing) })
          })
          .catch((error) => setModels({ status: 'done', items: [], taxonomy: [], error: { message: String(error.message || error) } }))
      }, [])

      const modelAction = useCallback(
        (method, payload, done) => {
          setModelBusy(true)
          setModelMsg(null)
          const path = method === 'PATCH' || method === 'DELETE' ? '/mental-model' : '/mental-model-action'
          const query = method === 'DELETE' ? `?bankId=${encodeURIComponent(bankId)}&id=${encodeURIComponent(payload.id)}` : ''
          api(`${path}${query}`, { method, body: method === 'DELETE' ? undefined : { bankId, ...payload } })
            .then((data) => {
              if (!data.ok) {
                setModelMsg({ tone: 'bad', text: (data.error && (data.error.detail || data.error.message || data.error.error)) || '服务端拒绝了这次操作' })
                return
              }
              if (data.configWrite && data.configWrite.written) {
                setModelMsg({ tone: 'ok', text: `${t('mmConfigAlso')} (pages[${data.configWrite.key}])` })
              } else if (data.configWrite && data.configWrite.reason === 'config-unreadable') {
                setModelMsg({ tone: 'bad', text: `${t('mmConfigWriteFailed')} — ${data.configWrite.detail}` })
              }
              if (done) done()
              loadModels(bankId)
            })
            .catch((error) => setModelMsg({ tone: 'bad', text: String(error.message || error) }))
            .finally(() => setModelBusy(false))
        },
        [bankId, loadModels, t],
      )

      // The list endpoint blanks source_query/trigger/content to stay small, so
      // the editor reads the detail record before it can show real values.
      const openModelEditor = useCallback(
        (model) => {
          if (modelEdit && modelEdit.id === model.id) {
            setModelEdit(null)
            return
          }
          setModelMsg(null)
          setModelEdit({ id: model.id, name: model.name, isTaxonomy: model.isTaxonomy, loading: true, mode: 'form', sourceQuery: '', maxTokens: '', tags: '' })
          api(`/mental-model?bankId=${encodeURIComponent(bankId)}&id=${encodeURIComponent(model.id)}`)
            .then((data) => {
              if (!data.ok) {
                setModelMsg({ tone: 'bad', text: (data.error && (data.error.detail || data.error.message)) || '读取详情失败' })
                setModelEdit(null)
                return
              }
              const detail = data.model || {}
              const trigger = detail.trigger || {}
              const asText = (value) => (value === undefined || value === null ? '' : String(value))
              setModelEdit({
                id: model.id,
                name: detail.name || model.name,
                isTaxonomy: model.isTaxonomy,
                loading: false,
                mode: 'form',
                sourceQuery: detail.source_query || '',
                maxTokens: detail.max_tokens ?? '',
                tags: Array.isArray(detail.tags) ? detail.tags.join(', ') : '',
                refreshMode: trigger.mode || '',
                budget: trigger.budget || '',
                refreshCron: trigger.refresh_cron || '',
                minInterval: asText(trigger.min_refresh_interval_seconds),
                afterConsolidation: trigger.refresh_after_consolidation === undefined || trigger.refresh_after_consolidation === null ? '' : String(trigger.refresh_after_consolidation),
                factTypes: Array.isArray(trigger.fact_types) ? trigger.fact_types.join(', ') : '',
                json: JSON.stringify(detail, null, 2),
              })
            })
            .catch((error) => {
              setModelMsg({ tone: 'bad', text: String(error.message || error) })
              setModelEdit(null)
            })
        },
        [bankId, modelEdit],
      )

      const loadAliases = useCallback((id) => {
        if (!id) return
        setAliases({ status: 'loading', items: [] })
        api(`/aliases?bankId=${encodeURIComponent(id)}`)
          .then((data) => {
            if (!data.ok) {
              setAliases({ status: 'done', items: [], error: data.error })
              return
            }
            setAliases({ status: 'done', items: data.aliases || [] })
          })
          .catch((error) => setAliases({ status: 'done', items: [], error: { message: String(error.message || error) } }))
      }, [])

      useEffect(() => {
        if (tab === 'server' && bankId) loadBank(bankId)
      }, [tab, bankId, loadBank])

      useEffect(() => {
        if (tab === 'server' && bankId) loadAliases(bankId)
      }, [tab, bankId, loadAliases])

      useEffect(() => {
        if (tab === 'server' && bankId) loadModels(bankId)
      }, [tab, bankId, loadModels])

      const aliasAction = useCallback(
        (method, payload, done) => {
          setAliasBusy(true)
          setAliasMsg(null)
          const query = method === 'DELETE' ? `?bankId=${encodeURIComponent(bankId)}&alias=${encodeURIComponent(payload.alias)}` : ''
          api(`/aliases${query}`, { method, body: method === 'DELETE' ? undefined : { bankId, ...payload } })
            .then((data) => {
              if (!data.ok) {
                setAliasMsg({ tone: 'bad', text: (data.error && (data.error.detail || data.error.message)) || '服务端拒绝了这次操作' })
                return
              }
              if (done) done()
              loadAliases(bankId)
            })
            .catch((error) => setAliasMsg({ tone: 'bad', text: String(error.message || error) }))
            .finally(() => setAliasBusy(false))
        },
        [bankId, loadAliases],
      )

      const loadLogs = useCallback(() => {
        setLogState({ status: 'loading' })
        api(`/logs?file=${encodeURIComponent(logFile)}&lines=200`)
          .then((data) => setLogState({ status: 'done', data }))
          .catch((error) => setLogState({ status: 'done', data: { error: String(error.message || error), lines: [] } }))
      }, [logFile])

      useEffect(() => {
        if (tab === 'diag' && logState.status === 'idle') loadLogs()
      }, [tab, logState.status, loadLogs])

      const applyBank = useCallback(() => {
        const detail = bankDetail.status === 'done' ? bankDetail.data : null
        if (!detail) return
        const updates = {}
        for (const entry of detail.curated || []) {
          const before = entry.value === null || entry.value === undefined ? '' : String(entry.value)
          const now = bankDraft[entry.key] ?? ''
          if (now === before) continue
          if (now === '') updates[entry.key] = null
          else if (entry.type === 'number') updates[entry.key] = Number(now)
          else if (entry.type === 'boolean') updates[entry.key] = now === 'true'
          else updates[entry.key] = now
        }
        if (!Object.keys(updates).length) {
          setBankSave({ status: 'empty' })
          return
        }
        setBankSave({ status: 'saving' })
        api('/bank-config', { method: 'POST', body: { bankId, updates } })
          .then((data) => {
            if (!data.ok) {
              setBankSave({ status: 'error', message: (data.error && (data.error.message || data.error.detail)) || '服务端拒绝了这次写入' })
              return
            }
            setBankSave({ status: 'saved', keys: data.updated })
            loadBank(bankId)
          })
          .catch((error) => setBankSave({ status: 'error', message: String(error.message || error) }))
      }, [bankDetail, bankDraft, bankId, loadBank])

      /* --------------------------------------------------------------- rendering */

      if (loadError) {
        return h(
          'div',
          { className: 'dhc-root' },
          h(Styles),
          h(Banner, { tone: 'bad' }, `${t('errorPrefix')}${loadError}`),
          h('div', { className: 'dhc-btns' }, h('button', { className: 'dhc-btn', type: 'button', onClick: load }, t('reload'))),
        )
      }

      if (!state) {
        return h('div', { className: 'dhc-root' }, h(Styles), h('div', { className: 'dhc-muted' }, h(Spinner), ' ', t('bankLoad')))
      }

      const header = h(
        'div',
        { className: 'dhc-head' },
        h(
          'div',
          null,
          h('div', { className: 'dhc-title' }, t('title')),
          h('div', { className: 'dhc-sub' }, t('subtitle')),
          h('div', { className: 'dhc-sub', style: { opacity: 0.75 } }, t('provider')),
        ),
        h(
          'div',
          { className: 'dhc-btns' },
          loading ? h(Spinner) : null,
          h('button', { className: 'dhc-btn', type: 'button', onClick: reload, disabled: loading }, t('reload')),
        ),
      )

      const restartBanner =
        saveState.status === 'saved'
          ? h(Banner, { tone: 'warn' }, t('saved'), ' — ', t('restartNote'))
          : h('div', { className: 'dhc-muted', style: { fontSize: '12px' } }, t('restartNote'))

      const parseBanner = state.parseError
        ? h(
            'div',
            { className: 'dhc-card', style: { borderColor: 'var(--dsw-alias-state-error-primary)' } },
            h('div', { className: 'dhc-err' }, `${t('parseError')} — ${state.parseError}`),
            h('div', { className: 'dhc-muted', style: { margin: '6px 0' } }, state.path),
            state.invalidText
              ? h('pre', { className: 'dhc-pre', style: { maxHeight: '160px' } }, state.invalidText)
              : null,
            h(
              'div',
              { className: 'dhc-btns', style: { marginTop: '8px' } },
              h(
                'button',
                {
                  className: 'dhc-btn',
                  type: 'button',
                  'data-kind': 'danger',
                  onClick: () => {
                    if (!window.confirm(t('overwriteConfirm'))) return
                    api('/save', { method: 'POST', body: { raw: {}, token: { action: 'keep' }, allowOverwriteInvalid: true } })
                      .then(() => load())
                      .catch((error) => setSaveState({ status: 'error', message: String(error.message || error) }))
                  },
                },
                t('overwriteEmpty'),
              ),
            ),
          )
        : null

      const tabs = h(Tabs, {
        t,
        value: tab,
        onChange: setTab,
        items: [
          { id: 'status', label: 'tabStatus' },
          { id: 'client', label: 'tabClient' },
          { id: 'server', label: 'tabServer' },
          { id: 'raw', label: 'tabRaw' },
          { id: 'diag', label: 'tabDiag' },
        ],
      })

      const tokenRow = h(
        'div',
        { className: 'dhc-row' },
        h(
          'div',
          { className: 'dhc-label' },
          h('span', null, state.hasToken ? `${t('tokenSaved')} (${t(state.tokenFrom === 'env' ? 'sourceEnv' : 'sourceFile')})` : t('tokenNone')),
          h('code', null, 'apiToken'),
        ),
        h(
          'div',
          { className: 'dhc-control' },
          h(
            'div',
            { className: 'dhc-btns' },
            ['keep', 'set', 'clear'].map((action) =>
              h(
                'button',
                {
                  key: action,
                  type: 'button',
                  className: 'dhc-btn',
                  'data-kind': tokenAction === action ? 'primary' : undefined,
                  onClick: () => setTokenAction(action),
                },
                t(action === 'keep' ? 'tokenKeep' : action === 'set' ? 'tokenSet' : 'tokenUnset'),
              ),
            ),
          ),
          tokenAction === 'set'
            ? h('input', {
                className: 'dhc-input',
                type: 'password',
                autocomplete: 'off',
                placeholder: t('tokenPlaceholder'),
                value: tokenValue,
                onChange: (event) => setTokenValue(event.target.value),
              })
            : null,
        ),
      )

      let body = null

      if (tab === 'status') {
        const health = probe.status === 'done' ? probe.data : null
        // A Host half older than this bundle reports no `engine` field. Say
        // "not reported" instead of claiming "not installed" — the difference
        // is a restart, not a missing engine.
        const engineKnown = Boolean(state.engine)
        const engine = state.engine || {}
        const drift = Boolean(state.engineVersion && state.fieldsBaseline && state.engineVersion !== state.fieldsBaseline)
        const engineTone = !engineKnown ? undefined : drift ? 'warn' : engine.mounted ? 'ok' : 'bad'
        const engineLabel = !engineKnown
          ? t('engineUnknown')
          : !engine.installed
            ? t('engineNotInstalled')
            : engine.mounted
              ? t('engineMounted')
              : t('engineInactive')
        const engineCard = h(
          'div',
          { className: 'dhc-card' },
          h(
            'div',
            { className: 'dhc-card-head' },
            h('div', { className: 'dhc-card-title' }, t('engineCard')),
            h(
              'div',
              { className: 'dhc-btns' },
              h(Badge, { tone: engineTone }, engineLabel),
              engine.state && !engine.mounted ? h(Badge, null, `${t('engineState')}: ${engine.state}`) : null,
            ),
          ),
          h(
            'dl',
            { className: 'dhc-kv' },
            h('dt', null, t('engineVersionLabel')),
            h('dd', { className: 'dhc-mono' }, state.engineVersion || t('unknown')),
            h('dt', null, t('engineBaselineLabel')),
            h('dd', { className: 'dhc-mono' }, state.fieldsBaseline || t('unset')),
            engine.rowId ? h('dt', null, t('engineRow')) : null,
            engine.rowId ? h('dd', { className: 'dhc-mono' }, engine.rowId) : null,
          ),
          drift
            ? h('div', { className: 'dhc-warn', style: { marginTop: '8px' } }, `${t('engineDriftHint')} (${state.engineVersion} ≠ ${state.fieldsBaseline})`)
            : null,
          !engineKnown
            ? h('div', { className: 'dhc-muted', style: { marginTop: '8px' } }, t('engineUnknownHint'))
            : !engine.installed
              ? h('div', { className: 'dhc-err', style: { marginTop: '8px' } }, t('engineMissingHint'))
              : !engine.mounted
                ? h('div', { className: 'dhc-warn', style: { marginTop: '8px' } }, t('engineInactiveHint'))
                : null,
        )
        body = h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          engineCard,
          h(
            'div',
            { className: 'dhc-card' },
            h(
              'div',
              { className: 'dhc-card-head' },
              h('div', { className: 'dhc-card-title' }, t('serverCard')),
              h(
                'div',
                { className: 'dhc-btns' },
                probe.status === 'loading' ? h(Spinner) : null,
                h('button', { className: 'dhc-btn', type: 'button', onClick: runProbe, disabled: probe.status === 'loading' }, t(probe.status === 'loading' ? 'testing' : 'test')),
              ),
            ),
            h('div', { className: 'dhc-muted', style: { fontSize: '12px', marginBottom: '8px' } }, t('serverHint')),
            health
              ? health.ok
                ? h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                    h(
                      'div',
                      { className: 'dhc-btns' },
                      h(Badge, { tone: 'ok' }, t('serverOk')),
                      h('span', { className: 'dhc-mono dhc-muted' }, health.apiUrl),
                      h('span', { className: 'dhc-muted' }, `${t('latency')} ${probe.elapsed}ms`),
                    ),
                    h(
                      'dl',
                      { className: 'dhc-kv' },
                      h('dt', null, t('health')),
                      h('dd', { className: 'dhc-mono' }, JSON.stringify(health.health)),
                      h('dt', null, t('version')),
                      h('dd', { className: 'dhc-mono' }, health.version ? `${health.version.api_version || '?'}` : t('empty')),
                      h(
                        'dt',
                        null,
                        t('features'),
                        ),
                      h(
                        'dd',
                        { className: 'dhc-mono' },
                        health.version?.features
                          ? Object.entries(health.version.features)
                              .filter(([, enabled]) => enabled)
                              .map(([name]) => name)
                              .join(', ')
                          : t('empty'),
                      ),
                    ),
                  )
                : h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                    h(
                      'div',
                      { className: 'dhc-btns' },
                      h(Badge, { tone: 'bad' }, t('serverUnreachable')),
                      health.health?.apiUrl ? h('span', { className: 'dhc-mono dhc-muted' }, health.health.apiUrl) : null,
                    ),
                    h('div', { className: 'dhc-err' }, health.health?.message || ''),
                    health.health?.hint ? h('div', { className: 'dhc-warn' }, health.health.hint) : null,
                    h('div', { className: 'dhc-muted', style: { fontSize: '12px' } }, t('unreachableHint')),
                  )
              : h('div', { className: 'dhc-muted' }, t('empty')),
          ),
          h(
            'div',
            { className: 'dhc-card' },
            h('div', { className: 'dhc-card-head' }, h('div', { className: 'dhc-card-title' }, t('configPath'))),
            h(
              'dl',
              { className: 'dhc-kv' },
              h('dt', null, t('configPath')),
              h('dd', { className: 'dhc-mono' }, state.path),
              h('dt', null, t('fileState')),
              h('dd', null, state.exists ? h(Badge, { tone: 'ok' }, 'ok') : h(Badge, { tone: 'warn' }, t('missingFile'))),
              h('dt', null, 'apiUrl'),
              h('dd', { className: 'dhc-mono' }, String(state.effective.apiUrl || '')),
              h('dt', null, 'serverMode'),
              h('dd', { className: 'dhc-mono' }, String(state.effective.serverMode || '')),
              h('dt', null, 'apiToken'),
              h('dd', null, state.hasToken ? h(Badge, { tone: 'ok' }, t('tokenSaved')) : h(Badge, null, t('tokenNone'))),
            ),
          ),
          restartBanner,
        )
      }

      if (tab === 'client') {
        body = h(
          'div',
          null,
          groups
            .filter((group) => group.id !== 'objects')
            .map((group) =>
              h(
                'div',
                { className: 'dhc-card dhc-group', key: group.id },
                h('div', { className: 'dhc-group-title' }, group.title[loc] || group.title.zh),
                h('div', { className: 'dhc-group-hint' }, group.hint[loc] || group.hint.zh),
                group.id === 'connection' ? tokenRow : null,
                fields
                  .filter((field) => field.group === group.id)
                  .map((field) =>
                    h(FieldRow, {
                      key: field.key,
                      t,
                      field,
                      text: draft[field.key] ?? '',
                      source: state.effectiveSource[field.key],
                      disabled: false,
                      onChange: (value) => setDraft((previous) => ({ ...previous, [field.key]: value })),
                    }),
                  ),
              ),
            ),
          h(
            'div',
            { className: 'dhc-card dhc-group' },
            h('div', { className: 'dhc-group-title' }, t('advanced')),
            h('div', { className: 'dhc-group-hint' }, t('advancedHint')),
            fields
              .filter((field) => field.group === 'objects')
              .map((field) =>
                h(FieldRow, {
                  key: field.key,
                  t,
                  field,
                  text: draft[field.key] ?? '',
                  source: state.effectiveSource[field.key],
                  disabled: false,
                  onChange: (value) => setDraft((previous) => ({ ...previous, [field.key]: value })),
                }),
              ),
          ),
          unknownKeys.length
            ? h(
                'div',
                { className: 'dhc-card' },
                h('div', { className: 'dhc-group-title' }, t('warnings')),
                h(
                  'ul',
                  { className: 'dhc-warn', style: { margin: '6px 0 0 18px' } },
                  unknownKeys.map((key) => h('li', { key }, h('code', null, key), ' — 不在已知字段里，保存时原样保留')),
                ),
              )
            : null,
        )
      }

      if (tab === 'server') {
        const detail = bankDetail.status === 'done' ? bankDetail.data : null
        const stats = detail?.stats
        const bankGroups = {}
        for (const entry of detail?.curated || []) {
          bankGroups[entry.group] = bankGroups[entry.group] || []
          bankGroups[entry.group].push(entry)
        }
        body = h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          h(
            'div',
            { className: 'dhc-card' },
            h(
              'div',
              { className: 'dhc-card-head' },
              h('div', { className: 'dhc-card-title' }, t('bankTitle')),
              h(
                'div',
                { className: 'dhc-btns' },
                banks.status === 'loading' ? h(Spinner) : null,
                h('button', { className: 'dhc-btn', type: 'button', onClick: loadBanks }, t('refresh')),
              ),
            ),
            banks.status === 'done' && banks.error
              ? h(
                  'div',
                  null,
                  h('div', { className: 'dhc-err' }, `${t('errorPrefix')}${banks.error.message || (banks.error.detail || '')}`),
                  banks.error.hint ? h('div', { className: 'dhc-warn' }, banks.error.hint) : null,
                )
              : null,
            banks.status === 'done' && !banks.error && !banks.items.length
              ? h('div', { className: 'dhc-muted' }, t('bankNone'))
              : null,
            h(
              'div',
              { className: 'dhc-list' },
              (banks.items || []).map((bank) =>
                h(
                  'button',
                  {
                    key: bank.id,
                    type: 'button',
                    className: 'dhc-bankrow',
                    'data-active': String(bank.id === bankId),
                    onClick: () => setBankId(bank.id),
                  },
                  h('span', { className: 'dhc-mono' }, bank.id),
                  bank.id === bankId ? h(Badge, { tone: 'ok' }, 'selected') : null,
                ),
              ),
            ),
          ),
          detail
            ? detail.ok
              ? h(
                  'div',
                  { className: 'dhc-card' },
                  h(
                    'dl',
                    { className: 'dhc-kv' },
                    h('dt', null, t('bankDocuments')),
                    h('dd', null, String(stats?.total_documents ?? 0)),
                    h('dt', null, t('bankNodes')),
                    h('dd', null, String(stats?.total_nodes ?? 0)),
                    h('dt', null, t('bankObservations')),
                    h('dd', null, String(stats?.total_observations ?? 0)),
                    h('dt', null, t('bankPending')),
                    h('dd', null, String(stats?.pending_operations ?? 0)),
                    h('dt', null, t('bankFailed')),
                    h('dd', null, String(stats?.failed_operations ?? 0)),
                    h('dt', null, t('bankLastConsolidation')),
                    h('dd', { className: 'dhc-mono' }, stats?.last_consolidated_at || '—'),
                  ),
                )
              : h(
                  'div',
                  { className: 'dhc-card' },
                  h('div', { className: 'dhc-err' }, `${t('errorPrefix')}${detail.error?.message || detail.error?.detail || ''}`),
                  detail.error?.hint ? h('div', { className: 'dhc-warn' }, detail.error.hint) : null,
                )
            : bankDetail.status === 'loading'
              ? h('div', { className: 'dhc-card dhc-muted' }, h(Spinner), ' ', t('bankLoad'))
              : null,
          detail?.ok
            ? h(
                'div',
                { className: 'dhc-card' },
                h(
                  'div',
                  { className: 'dhc-card-head' },
                  h('div', { className: 'dhc-card-title' }, t('mmTitle')),
                  h(
                    'div',
                    { className: 'dhc-btns' },
                    models.refreshing ? h(Badge, { tone: 'warn' }, t('mmRefreshing')) : null,
                    models.status === 'loading' ? h(Spinner) : null,
                    h('button', { className: 'dhc-btn', type: 'button', onClick: () => loadModels(bankId) }, t('refresh')),
                  ),
                ),
                h('div', { className: 'dhc-group-hint' }, t('mmHint')),
                models.status === 'done' && models.error
                  ? h('div', { className: 'dhc-err' }, `${t('errorPrefix')}${models.error.detail || models.error.message || ''}`)
                  : null,
                models.status === 'done' && !models.error && !(models.items || []).length
                  ? h('div', { className: 'dhc-muted' }, t('mmNone'))
                  : null,
                h(
                  'div',
                  { className: 'dhc-list' },
                  (models.items || []).map((model) =>
                    h(
                      'div',
                      { key: model.id, style: { borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: '8px' } },
                      h(
                        'div',
                        { className: 'dhc-btns', style: { justifyContent: 'space-between' } },
                        h(
                          'span',
                          { className: 'dhc-btns' },
                          h('span', { className: 'dhc-mono' }, model.name),
                          model.isTaxonomy ? h(Badge, null, t('mmTaxonomy')) : null,
                          model.isStale ? h(Badge, { tone: 'warn' }, t('mmStale')) : null,
                          model.failedRecently ? h(Badge, { tone: 'bad' }, t('mmFailed')) : null,
                        ),
                        h(
                          'span',
                          { className: 'dhc-btns' },
                          h(
                            'button',
                            { className: 'dhc-btn', type: 'button', disabled: modelBusy, onClick: () => modelAction('POST', { id: model.id, action: 'refresh' }) },
                            t('mmRefresh'),
                          ),
                          h(
                            'button',
                            { className: 'dhc-btn', type: 'button', disabled: modelBusy, onClick: () => modelAction('POST', { id: model.id, action: 'dry-run' }) },
                            t('mmDryRun'),
                          ),
                          h(
                            'button',
                            {
                              className: 'dhc-btn',
                              type: 'button',
                              onClick: () => openModelEditor(model),
                            },
                            t('mmEdit'),
                          ),
                          h(
                            'button',
                            {
                              className: 'dhc-btn',
                              type: 'button',
                              'data-kind': 'danger',
                              disabled: modelBusy,
                              onClick: () => modelAction('DELETE', { id: model.id }),
                            },
                            t('mmDelete'),
                          ),
                        ),
                      ),
                      h(
                        'div',
                        { className: 'dhc-muted', style: { fontSize: '11.5px', marginTop: '2px' } },
                        `${t('mmLastRefreshed')}: ${model.lastRefreshedAt || '—'}`,
                      ),
                      model.lastRefreshFailedAt
                        ? h('div', { className: 'dhc-warn', style: { fontSize: '11.5px' } }, `${t('mmLastFailed')}: ${model.lastRefreshFailedAt}`)
                        : null,
                      modelEdit && modelEdit.id === model.id
                        ? h(
                            'div',
                            { style: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' } },
                            modelEdit.loading
                              ? h('div', { className: 'dhc-muted' }, h(Spinner), ' ', t('bankLoad'))
                              : modelEdit.mode === 'json'
                                ? h(
                                    'div',
                                    null,
                                    h('div', { className: 'dhc-muted', style: { fontSize: '11.5px' } }, t('mmJsonHint')),
                                    h('textarea', {
                                      className: 'dhc-area',
                                      rows: 12,
                                      spellcheck: false,
                                      value: modelEdit.json,
                                      onChange: (event) => setModelEdit((current) => ({ ...current, json: event.target.value })),
                                    }),
                                    h(
                                      'div',
                                      { className: 'dhc-btns', style: { marginTop: '6px' } },
                                      h(
                                        'button',
                                        {
                                          className: 'dhc-btn',
                                          type: 'button',
                                          'data-kind': 'primary',
                                          disabled: modelBusy,
                                          onClick: () => {
                                            let parsed
                                            try {
                                              parsed = JSON.parse(modelEdit.json)
                                            } catch (error) {
                                              setModelMsg({ tone: 'bad', text: `JSON 语法错误：${error.message}` })
                                              return
                                            }
                                            modelAction('PATCH', { id: modelEdit.id, raw: parsed }, () => setModelEdit(null))
                                          },
                                        },
                                        t('save'),
                                      ),
                                      h('button', { className: 'dhc-btn', type: 'button', onClick: () => setModelEdit((current) => ({ ...current, mode: 'form' })) }, t('mmBackToForm')),
                                      h('button', { className: 'dhc-btn', type: 'button', onClick: () => setModelEdit(null) }, t('mmCancel')),
                                    ),
                                  )
                                : h(
                                    'div',
                                    null,
                                    modelEdit.isTaxonomy
                                      ? h('div', { className: 'dhc-warn', style: { fontSize: '11.5px' } }, t('mmTaxonomyWarn'))
                                      : h('div', { className: 'dhc-muted', style: { fontSize: '11.5px' } }, t('mmOwnWarn')),
                                    h('input', {
                                      className: 'dhc-input',
                                      type: 'text',
                                      placeholder: t('mmName'),
                                      style: { marginTop: '6px' },
                                      value: modelEdit.name,
                                      onChange: (event) => setModelEdit((current) => ({ ...current, name: event.target.value })),
                                    }),
                                    h('textarea', {
                                      className: 'dhc-area',
                                      rows: 3,
                                      spellcheck: false,
                                      placeholder: 'source_query',
                                      style: { marginTop: '6px' },
                                      value: modelEdit.sourceQuery,
                                      onChange: (event) => setModelEdit((current) => ({ ...current, sourceQuery: event.target.value })),
                                    }),
                                    h(
                                      'div',
                                      { className: 'dhc-btns', style: { marginTop: '6px' } },
                                      h('input', {
                                        className: 'dhc-input',
                                        type: 'number',
                                        placeholder: 'max_tokens',
                                        style: { flex: '0 0 120px' },
                                        value: modelEdit.maxTokens,
                                        onChange: (event) => setModelEdit((current) => ({ ...current, maxTokens: event.target.value })),
                                      }),
                                      h('input', {
                                        className: 'dhc-input',
                                        type: 'text',
                                        spellcheck: false,
                                        placeholder: t('mmTagsPlaceholder'),
                                        style: { flex: '1 1 200px' },
                                        value: modelEdit.tags,
                                        onChange: (event) => setModelEdit((current) => ({ ...current, tags: event.target.value })),
                                      }),
                                    ),
                                    h(
                                      'div',
                                      { className: 'dhc-btns', style: { marginTop: '6px' } },
                                      h(
                                        'select',
                                        {
                                          className: 'dhc-select',
                                          style: { flex: '0 0 120px' },
                                          value: modelEdit.refreshMode,
                                          onChange: (event) => setModelEdit((current) => ({ ...current, refreshMode: event.target.value })),
                                        },
                                        h('option', { value: '' }, `${t('mmMode')}: —`),
                                        h('option', { value: 'full' }, 'full'),
                                        h('option', { value: 'delta' }, 'delta'),
                                      ),
                                      h(
                                        'select',
                                        {
                                          className: 'dhc-select',
                                          style: { flex: '0 0 120px' },
                                          value: modelEdit.budget,
                                          onChange: (event) => setModelEdit((current) => ({ ...current, budget: event.target.value })),
                                        },
                                        h('option', { value: '' }, `${t('mmBudget')}: —`),
                                        h('option', { value: 'low' }, 'low'),
                                        h('option', { value: 'mid' }, 'mid'),
                                        h('option', { value: 'high' }, 'high'),
                                      ),
                                      h('input', {
                                        className: 'dhc-input',
                                        type: 'number',
                                        placeholder: t('mmMinInterval'),
                                        style: { flex: '0 0 150px' },
                                        value: modelEdit.minInterval,
                                        onChange: (event) => setModelEdit((current) => ({ ...current, minInterval: event.target.value })),
                                      }),
                                      h(
                                        'select',
                                        {
                                          className: 'dhc-select',
                                          style: { flex: '0 0 150px' },
                                          value: modelEdit.afterConsolidation,
                                          onChange: (event) => setModelEdit((current) => ({ ...current, afterConsolidation: event.target.value })),
                                        },
                                        h('option', { value: '' }, `${t('mmAfterConsolidation')}: —`),
                                        h('option', { value: 'true' }, t('on')),
                                        h('option', { value: 'false' }, t('off')),
                                      ),
                                    ),
                                    h(
                                      'div',
                                      { className: 'dhc-btns', style: { marginTop: '6px' } },
                                      h('input', {
                                        className: 'dhc-input',
                                        type: 'text',
                                        spellcheck: false,
                                        placeholder: t('mmCronPlaceholder'),
                                        style: { flex: '1 1 180px' },
                                        value: modelEdit.refreshCron,
                                        onChange: (event) => setModelEdit((current) => ({ ...current, refreshCron: event.target.value })),
                                      }),
                                      h('input', {
                                        className: 'dhc-input',
                                        type: 'text',
                                        spellcheck: false,
                                        placeholder: t('mmFactTypesPlaceholder'),
                                        style: { flex: '1 1 180px' },
                                        value: modelEdit.factTypes,
                                        onChange: (event) => setModelEdit((current) => ({ ...current, factTypes: event.target.value })),
                                      }),
                                    ),
                                    modelEdit.afterConsolidation === 'true' && modelEdit.refreshCron.trim()
                                      ? h('div', { className: 'dhc-warn', style: { fontSize: '11.5px' } }, t('mmCronExclusive'))
                                      : null,
                                    h(
                                      'div',
                                      { className: 'dhc-btns', style: { marginTop: '6px' } },
                                      h(
                                        'button',
                                        {
                                          className: 'dhc-btn',
                                          type: 'button',
                                          'data-kind': 'primary',
                                          disabled: modelBusy,
                                          onClick: () => {
                                            const trigger = {}
                                            if (modelEdit.refreshMode) trigger.mode = modelEdit.refreshMode
                                            if (modelEdit.budget) trigger.budget = modelEdit.budget
                                            if (modelEdit.refreshCron) trigger.refresh_cron = modelEdit.refreshCron
                                            if (modelEdit.minInterval !== '') trigger.min_refresh_interval_seconds = Number(modelEdit.minInterval)
                                            if (modelEdit.afterConsolidation !== '') trigger.refresh_after_consolidation = modelEdit.afterConsolidation === 'true'
                                            if (modelEdit.factTypes.trim()) {
                                              trigger.fact_types = modelEdit.factTypes.split(',').map((part) => part.trim()).filter(Boolean)
                                            }
                                            modelAction(
                                              'PATCH',
                                              {
                                                id: modelEdit.id,
                                                name: modelEdit.name,
                                                sourceQuery: modelEdit.sourceQuery,
                                                maxTokens: modelEdit.maxTokens === '' ? undefined : modelEdit.maxTokens,
                                                tags: modelEdit.tags
                                                  .split(',')
                                                  .map((part) => part.trim())
                                                  .filter(Boolean),
                                                trigger: Object.keys(trigger).length ? trigger : undefined,
                                              },
                                              () => setModelEdit(null),
                                            )
                                          },
                                        },
                                        t('save'),
                                      ),
                                      h(
                                        'button',
                                        {
                                          className: 'dhc-btn',
                                          type: 'button',
                                          onClick: () =>
                                            setModelEdit((current) => ({
                                              ...current,
                                              mode: 'json',
                                              json: JSON.stringify(
                                                {
                                                  name: current.name,
                                                  source_query: current.sourceQuery,
                                                  max_tokens: current.maxTokens === '' ? null : Number(current.maxTokens),
                                                  tags: current.tags.split(',').map((part) => part.trim()).filter(Boolean),
                                                  trigger: {
                                                    mode: current.refreshMode || undefined,
                                                    budget: current.budget || undefined,
                                                    refresh_cron: current.refreshCron || undefined,
                                                    min_refresh_interval_seconds: current.minInterval === '' ? undefined : Number(current.minInterval),
                                                    refresh_after_consolidation: current.afterConsolidation === '' ? undefined : current.afterConsolidation === 'true',
                                                    fact_types: current.factTypes.trim() ? current.factTypes.split(',').map((p) => p.trim()).filter(Boolean) : undefined,
                                                  },
                                                },
                                                null,
                                                2,
                                              ),
                                            })),
                                        },
                                        t('mmAdvanced'),
                                      ),
                                      h('button', { className: 'dhc-btn', type: 'button', onClick: () => setModelEdit(null) }, t('mmCancel')),
                                    ),
                                  ),
                          )
                        : null,
                    ),
                  ),
                ),
                modelMsg ? h('div', { className: modelMsg.tone === 'ok' ? 'dhc-ok' : 'dhc-err', style: { marginTop: '8px' } }, modelMsg.text) : null,
              )
            : null,
          detail?.ok
            ? h(
                'div',
                { className: 'dhc-card' },
                h(
                  'div',
                  { className: 'dhc-card-head' },
                  h('div', { className: 'dhc-card-title' }, t('aliasTitle')),
                  aliases.status === 'loading' ? h(Spinner) : null,
                ),
                h('div', { className: 'dhc-group-hint' }, t('aliasHint')),
                aliases.status === 'done' && aliases.error
                  ? h('div', { className: 'dhc-err' }, `${t('errorPrefix')}${aliases.error.detail || aliases.error.message || ''}`)
                  : null,
                aliases.status === 'done' && !aliases.error && !(aliases.items || []).length
                  ? h('div', { className: 'dhc-muted', style: { marginBottom: '8px' } }, t('aliasNone'))
                  : null,
                h(
                  'div',
                  { className: 'dhc-list', style: { marginBottom: '8px' } },
                  (aliases.items || []).map((entry) =>
                    h(
                      'div',
                      { className: 'dhc-bankrow', key: entry.alias, style: { cursor: 'default' } },
                      h('span', { className: 'dhc-mono' }, entry.alias),
                      h(
                        'span',
                        { className: 'dhc-btns' },
                        entry.primary ? h(Badge, { tone: 'ok' }, t('aliasPrimary')) : null,
                        entry.primary
                          ? null
                          : h(
                              'button',
                              {
                                className: 'dhc-btn',
                                type: 'button',
                                disabled: aliasBusy,
                                onClick: () => aliasAction('PATCH', { alias: entry.alias, primary: true }),
                              },
                              t('aliasMakePrimary'),
                            ),
                        h(
                          'button',
                          {
                            className: 'dhc-btn',
                            type: 'button',
                            'data-kind': 'danger',
                            disabled: aliasBusy,
                            onClick: () => aliasAction('DELETE', { alias: entry.alias }),
                          },
                          t('aliasRemove'),
                        ),
                      ),
                    ),
                  ),
                ),
                h(
                  'div',
                  { className: 'dhc-btns' },
                  h('input', {
                    className: 'dhc-input',
                    type: 'text',
                    spellcheck: false,
                    placeholder: t('aliasPlaceholder'),
                    value: aliasDraft,
                    style: { flex: '1 1 240px' },
                    onChange: (event) => setAliasDraft(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' && aliasDraft.trim() && !aliasBusy) {
                        aliasAction('POST', { alias: aliasDraft.trim(), primary: false }, () => setAliasDraft(''))
                      }
                    },
                  }),
                  h(
                    'button',
                    {
                      className: 'dhc-btn',
                      type: 'button',
                      'data-kind': 'primary',
                      disabled: aliasBusy || !aliasDraft.trim(),
                      onClick: () => aliasAction('POST', { alias: aliasDraft.trim(), primary: false }, () => setAliasDraft('')),
                    },
                    t('aliasAdd'),
                  ),
                ),
                aliasMsg ? h('div', { className: aliasMsg.tone === 'ok' ? 'dhc-ok' : 'dhc-err', style: { marginTop: '6px' } }, aliasMsg.text) : null,
              )
            : null,
          detail?.ok
            ? h(
                'div',
                { className: 'dhc-card' },
                h('div', { className: 'dhc-card-head' }, h('div', { className: 'dhc-card-title' }, t('bankConfig'))),
                h('div', { className: 'dhc-group-hint' }, t('bankConfigHint')),
                Object.keys(bankGroups).map((group) =>
                  h(
                    'div',
                    { key: group, style: { marginTop: '6px' } },
                    (detail.curated || [])
                      .filter((entry) => entry.group === group)
                      .map((entry) =>
                        h(
                          'div',
                          { className: 'dhc-row', key: entry.key },
                          h(
                            'div',
                            { className: 'dhc-label' },
                            h('code', null, entry.key),
                            detail.overrides && Object.prototype.hasOwnProperty.call(detail.overrides, entry.key)
                              ? h(Badge, { tone: 'warn' }, t('bankOverride'))
                              : null,
                          ),
                          h(
                            'div',
                            { className: 'dhc-control' },
                            entry.type === 'boolean'
                              ? h(
                                  'select',
                                  {
                                    className: 'dhc-select',
                                    value: bankDraft[entry.key] ?? '',
                                    onChange: (event) =>
                                      setBankDraft((previous) => ({ ...previous, [entry.key]: event.target.value })),
                                  },
                                  h('option', { value: '' }, '—'),
                                  h('option', { value: 'true' }, t('on')),
                                  h('option', { value: 'false' }, t('off')),
                                )
                              : entry.type === 'select'
                                ? h(
                                    'select',
                                    {
                                      className: 'dhc-select',
                                      value: bankDraft[entry.key] ?? '',
                                      onChange: (event) =>
                                        setBankDraft((previous) => ({ ...previous, [entry.key]: event.target.value })),
                                    },
                                    h('option', { value: '' }, '—'),
                                    entry.options.map((option) => h('option', { key: option, value: option }, option)),
                                  )
                                : entry.type === 'number'
                                  ? h('input', {
                                      className: 'dhc-input',
                                      type: 'number',
                                      value: bankDraft[entry.key] ?? '',
                                      onChange: (event) =>
                                        setBankDraft((previous) => ({ ...previous, [entry.key]: event.target.value })),
                                    })
                                  : h('textarea', {
                                      className: 'dhc-area',
                                      rows: 2,
                                      value: bankDraft[entry.key] ?? '',
                                      onChange: (event) =>
                                        setBankDraft((previous) => ({ ...previous, [entry.key]: event.target.value })),
                                    }),
                          ),
                        ),
                      ),
                  ),
                ),
                h(
                  'div',
                  { className: 'dhc-foot' },
                  h(
                    'button',
                    { className: 'dhc-btn', type: 'button', 'data-kind': 'primary', onClick: applyBank, disabled: bankSave.status === 'saving' },
                    t(bankSave.status === 'saving' ? 'saving' : 'bankApply'),
                  ),
                  bankSave.status === 'saved' ? h('span', { className: 'dhc-ok' }, t('bankApplied'), ' · ', (bankSave.keys || []).join(', ')) : null,
                  bankSave.status === 'empty' ? h('span', { className: 'dhc-muted' }, t('noChanges')) : null,
                  bankSave.status === 'error' ? h('span', { className: 'dhc-err' }, bankSave.message) : null,
                ),
              )
            : null,
        )
      }

      if (tab === 'raw') {
        body = h(
          'div',
          { className: 'dhc-card' },
          h('div', { className: 'dhc-group-hint' }, t('rawHint')),
          h('textarea', {
            className: 'dhc-area',
            rows: 18,
            spellcheck: false,
            value: rawText,
            onChange: (event) => {
              setRawText(event.target.value)
              setRawMsg(null)
            },
          }),
          h(
            'div',
            { className: 'dhc-foot' },
            h(
              'button',
              {
                className: 'dhc-btn',
                type: 'button',
                onClick: () => {
                  let parsed
                  try {
                    parsed = JSON.parse(rawText)
                  } catch (error) {
                    setRawMsg({ tone: 'bad', text: `JSON 语法错误：${error.message}` })
                    return
                  }
                  api('/validate', { method: 'POST', body: { raw: parsed } })
                    .then((data) =>
                      setRawMsg({
                        tone: data.errors && data.errors.length ? 'bad' : 'ok',
                        text:
                          data.errors && data.errors.length
                            ? data.errors.map((entry) => `${entry.key || '·'} ${entry.message}`).join('；')
                            : t('validOk'),
                      }),
                    )
                    .catch((error) => setRawMsg({ tone: 'bad', text: String(error.message || error) }))
                },
              },
              t('validate'),
            ),
            h(
              'button',
              {
                className: 'dhc-btn',
                type: 'button',
                'data-kind': 'primary',
                onClick: () => {
                  let parsed
                  try {
                    parsed = JSON.parse(rawText)
                  } catch (error) {
                    setRawMsg({ tone: 'bad', text: `JSON 语法错误：${error.message}` })
                    return
                  }
                  api('/save', { method: 'POST', body: { raw: parsed, token: { action: 'keep' }, allowOverwriteInvalid: true } })
                    .then((data) => {
                      setRawMsg({ tone: 'ok', text: `${t('saved')} — ${t('restartNote')}` })
                      load()
                      return data
                    })
                    .catch((error) => setRawMsg({ tone: 'bad', text: String(error.message || error) }))
                },
              },
              t('save'),
            ),
            rawMsg
              ? h('span', { className: rawMsg.tone === 'ok' ? 'dhc-ok' : 'dhc-err' }, rawMsg.text)
              : null,
          ),
        )
      }

      if (tab === 'diag') {
        body = h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          h(
            'div',
            { className: 'dhc-card' },
            h('div', { className: 'dhc-card-head' }, h('div', { className: 'dhc-card-title' }, t('effective'))),
            h(
              'div',
              { style: { maxHeight: '320px', overflow: 'auto' } },
              h(
                'div',
                { className: 'dhc-row', style: { fontWeight: 600 } },
                h('div', { className: 'dhc-label' }, h('span', null, t('key'))),
                h('div', null, t('value'), ' / ', t('origin')),
              ),
              fields
                .filter((field) => field.type !== 'secret')
                .map((field) => {
                  const value = state.effective[field.key]
                  const source = state.effectiveSource[field.key]
                  return h(
                    'div',
                    { className: 'dhc-row', key: field.key },
                    h('div', { className: 'dhc-label' }, h('code', null, field.key)),
                    h(
                      'div',
                      { className: 'dhc-mono' },
                      value === undefined ? h('span', { className: 'dhc-muted' }, t('unset')) : JSON.stringify(value),
                      source ? h('span', { className: 'dhc-muted' }, `  ·  ${sourceLabel(t, source)}`) : null,
                    ),
                  )
                }),
            ),
          ),
          h(
            'div',
            { className: 'dhc-card' },
            h('div', { className: 'dhc-card-head' }, h('div', { className: 'dhc-card-title' }, t('envPresent'))),
            Object.keys(state.envPresent || {}).length
              ? h(
                  'ul',
                  { className: 'dhc-mono', style: { margin: '0 0 0 18px' } },
                  Object.entries(state.envPresent).map(([key, value]) =>
                    h('li', { key }, `${key} = ${/TOKEN/i.test(key) ? '••••' : value}`),
                  ),
                )
              : h('div', { className: 'dhc-muted' }, t('envAbsent')),
          ),
          h(
            'div',
            { className: 'dhc-card' },
            h(
              'div',
              { className: 'dhc-card-head' },
              h('div', { className: 'dhc-card-title' }, t('logs')),
              h(
                'div',
                { className: 'dhc-btns' },
                h(
                  'select',
                  { className: 'dhc-select', style: { width: 'auto' }, value: logFile, onChange: (event) => {
                    setLogFile(event.target.value)
                    setLogState({ status: 'idle' })
                  } },
                  h('option', { value: 'plugin' }, t('logPlugin')),
                  h('option', { value: 'diag' }, t('logDiag')),
                  h('option', { value: 'usage' }, t('logUsage')),
                ),
                logState.status === 'loading' ? h(Spinner) : null,
                h('button', { className: 'dhc-btn', type: 'button', onClick: loadLogs }, t('refresh')),
              ),
            ),
            logState.status === 'done'
              ? h(
                  'div',
                  null,
                  logState.data.path ? h('div', { className: 'dhc-mono dhc-muted', style: { marginBottom: '6px' } }, logState.data.path) : null,
                  logState.data.error ? h('div', { className: 'dhc-err' }, logState.data.error) : null,
                  h('pre', { className: 'dhc-pre' }, (logState.data.lines || []).join('\n') || t('empty')),
                )
              : h('div', { className: 'dhc-muted' }, logState.status === 'loading' ? t('bankLoad') : t('empty')),
          ),
          h(
            'div',
            { className: 'dhc-card' },
            h('div', { className: 'dhc-card-head' }, h('div', { className: 'dhc-card-title' }, t('warnings'))),
            clientWarnings.length
              ? h('ul', { className: 'dhc-warn', style: { margin: '0 0 0 18px' } }, clientWarnings.map((entry, index) => h('li', { key: index }, `${entry.key ? entry.key + ': ' : ''}${entry.message}`)))
              : h('div', { className: 'dhc-muted' }, t('empty')),
            clientErrors.length
              ? h(
                  'div',
                  null,
                  h('div', { className: 'dhc-err', style: { marginTop: '8px' } }, t('errors')),
                  h('ul', { className: 'dhc-err', style: { margin: '0 0 0 18px' } }, clientErrors.map((entry, index) => h('li', { key: index }, `${entry.key ? entry.key + ': ' : ''}${entry.message}`))),
                )
              : null,
          ),
        )
      }

      const footer = h(
        'div',
        { className: 'dhc-foot' },
        h('button', { className: 'dhc-btn', type: 'button', 'data-kind': 'primary', onClick: save, disabled: saveState.status === 'saving' || !dirty }, t(saveState.status === 'saving' ? 'saving' : 'save')),
        h('button', { className: 'dhc-btn', type: 'button', onClick: reload, disabled: !dirty }, t('discard')),
        dirty ? h(Badge, { tone: 'warn' }, t('unsaved')) : h(Badge, null, t('noChanges')),
        saveState.status === 'saved' ? h('span', { className: 'dhc-ok' }, t('saved')) : null,
        saveState.status === 'error' ? h('span', { className: 'dhc-err' }, saveState.message) : null,
        clientErrors.length ? h('span', { className: 'dhc-err' }, clientErrors.map((entry) => `${entry.key || ''} ${entry.message}`).join('；')) : null,
      )

      return h(
        'div',
        { className: 'dhc-root' },
        h(Styles),
        header,
        parseBanner,
        tabs,
        body,
        tab === 'client' || tab === 'raw' ? footer : null,
      )
    }

    /* ------------------------------------------------------------------ apply */

    return {
      // `locale` MUST be declared here. Cordis throws on reading a service the
      // plugin did not inject — `if (ctx.locale && ...)` does not guard that:
      // the property access itself throws, the fiber fails, and the web boot
      // reports the entry as never activated.
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }))
        const t = ctx.locale.bind(NS)

        // Two seats, one panel, both owned by THIS bundle:
        //   plugins.bundle.config keyed by our own package name → our bundle page
        //   settings.section                                    → Settings sidebar
        // Deliberately NOT keyed by the engine's package name: the official
        // plugin page shows no configuration of ours, so nobody reads it as
        // "the official plugin grew settings".
        const PANEL_WRAP = (ownerProps = {}) => (ownerProps.view === 'summary' ? null : h(Panel, { t }))

        ctx.slots.inject('plugins.bundle.config', () =>
          ctx.slots.register(
            { name: 'plugins.bundle.config', key: 'dsh-hindsight-config', locale: NS, inject: () => ({ t }) },
            PANEL_WRAP,
          ),
        )

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'hindsight-memory', order: 60, label: () => t('navLabel'), locale: NS, inject: () => ({ t }) },
            () => h(Panel, { t }),
          ),
        )
      },
    }
  },
})
