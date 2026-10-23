/**
 * Client-half contract test without React or a browser.
 *
 * The browser module system evaluates client.js at boot and calls apply() on the
 * plugin context. A throw there blanks the page, so this test proves:
 *   1. the file evaluates and calls window.__ModuleLoader__.load({ id, factory })
 *   2. factory(require) returns { inject, apply }
 *   3. apply() registers on plugins.bundle.config, keyed by the Hindsight bundle
 *      package name, and the render function answers `summary` with null and
 *      `page` with an element.
 *
 * Run: node test/client-contract.mjs
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = await readFile(join(here, '..', 'client.js'), 'utf8')

let spec
globalThis.window = {
  __ModuleLoader__: {
    load(loadSpec) {
      spec = loadSpec
    },
  },
  document: { documentElement: { lang: 'zh-CN' } },
}
globalThis.document = globalThis.window.document

// eslint-disable-next-line no-new-func
new Function('window', source)(globalThis.window)

let failures = 0
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}

check('load() was called', Boolean(spec), spec)
check('module id', spec?.id === 'dsh-hindsight-config', spec?.id)

const ReactStub = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children }
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect() {},
  useMemo: (factory) => factory(),
  useCallback: (factory) => factory,
  useRef: () => ({ current: null }),
}

let registered = null
let injectedSlot = null
const locales = []
const registrations = []

const plugin = spec.factory((id) => {
  if (id !== 'react') throw new Error(`unexpected require: ${id}`)
  return ReactStub
})

check('factory returns inject', Array.isArray(plugin?.inject), plugin?.inject)
check('inject names slots', plugin?.inject?.includes('slots'), plugin?.inject)
check('inject names locale (cordis throws on an undeclared service read)', plugin?.inject?.includes('locale'), plugin?.inject)

const ctx = {
  effect(fn) {
    fn()
  },
  locale: {
    register(ns, dicts) {
      locales.push({ ns, dicts })
      return () => {}
    },
    bind: () => (key) => key,
  },
  slots: {
    inject(slot, callback) {
      injectedSlot = slot
      callback()
      return () => {}
    },
    register(meta, render) {
      registrations.push({ meta, render })
      registered = { meta, render }
      return () => {}
    },
  },
}

plugin.apply(ctx)

const bundleCells = registrations.filter((entry) => entry.meta.name === 'plugins.bundle.config')
const settingsSections = registrations.filter((entry) => entry.meta.name === 'settings.section')

check(
  'one bundle cell, keyed by our own package (never the engine package)',
  bundleCells.length === 1 && bundleCells[0].meta.key === 'dsh-hindsight-config',
  bundleCells.map((entry) => entry.meta.key),
)
check('the engine package page carries no cell of ours', !registrations.some((entry) => String(entry.meta.key || '').startsWith('@vectorize-io/')), registrations.map((entry) => entry.meta.key))
check('one settings page', settingsSections.length === 1 && settingsSections[0].meta.id === 'hindsight-memory', settingsSections.map((entry) => entry.meta.id))
check('locale registered', locales.length === 1 && locales[0].dicts.zh && locales[0].dicts.en, locales.map((entry) => entry.ns))
check(
  'dictionaries have the same keys',
  JSON.stringify(Object.keys(locales[0]?.dicts?.zh || {}).sort()) ===
    JSON.stringify(Object.keys(locales[0]?.dicts?.en || {}).sort()),
  {
    onlyZh: Object.keys(locales[0]?.dicts?.zh || {}).filter((key) => !(key in (locales[0]?.dicts?.en || {}))),
    onlyEn: Object.keys(locales[0]?.dicts?.en || {}).filter((key) => !(key in (locales[0]?.dicts?.zh || {}))),
  },
)

const summary = bundleCells[0].render({ view: 'summary' })
check('summary renders nothing', summary === null, summary)

const page = bundleCells[0].render({ view: 'page' })
check('page renders an element', Boolean(page) && typeof page.type === 'function', page && typeof page.type)

const settingsPage = settingsSections[0]?.render({})
check('settings page renders an element', Boolean(settingsPage) && typeof settingsPage.type === 'function', settingsPage && typeof settingsPage.type)

console.log(failures === 0 ? '\nCLIENT CONTRACT OK' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
