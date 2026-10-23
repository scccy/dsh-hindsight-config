/**
 * Reproduce the browser fiber lifecycle in Node with the REAL cordis.
 *
 * The web boot throws "web boot: 1 entry did not activate — dsh-hindsight-config:
 * loading", which means the entry's fiber exists but never settles. This harness
 * mounts the plugin's apply() on a real cordis Context with a fake `slots`
 * service, awaits the fiber, and reports the final state. If it stays loading
 * here too, the cause is in apply(); bisect below.
 *
 * Run: node test/fiber-harness.mjs
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

/**
 * Cordis ships inside the Harness installation, so this test needs one. Point
 * DSH_PACKAGES_DIR at `<dsh>/node_modules/@deepseek-ai` to override; the default
 * tries the usual global-install location.
 */
const CANDIDATES = [
  process.env.DSH_PACKAGES_DIR,
  process.env.DSH_INSTALL_DIR && join(process.env.DSH_INSTALL_DIR, 'node_modules', '@deepseek-ai'),
  join(import.meta.dirname, '..', '..', '..', 'node_modules', '@deepseek-ai'),
].filter(Boolean)
const DSH = CANDIDATES.find((path) => existsSync(join(path, 'cordis', 'lib', 'index.js')))
if (!DSH) {
  console.log('SKIP: no Harness installation found. Set DSH_PACKAGES_DIR to <dsh>/node_modules/@deepseek-ai')
  process.exitCode = 0
  process.exit(0)
}
const require = createRequire(join(DSH, 'cordis/'))
const { Context, Service } = await import(`file://${DSH.replace(/\\/g, '/')}/cordis/lib/index.js`)

const here = dirname(fileURLToPath(import.meta.url))
const source = await readFile(join(here, '..', 'client.js'), 'utf8')

let spec
globalThis.window = { __ModuleLoader__: { load(s) { spec = s } }, document: { documentElement: { lang: 'zh-CN' } } }
globalThis.document = globalThis.window.document
new Function('window', source)(globalThis.window)

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect() {},
  useMemo: (f) => f(),
  useCallback: (f) => f,
  useRef: () => ({ current: null }),
}

const plugin = spec.factory((id) => {
  if (id !== 'react') throw new Error(`unexpected require: ${id}`)
  return ReactStub
})

// Minimal stand-ins for the client services this plugin touches.
class Slots extends Service {
  constructor(ctx) {
    super(ctx, 'slots')
    this.registered = []
  }
  inject(key, callback) {
    return this.ctx.effect(() => callback(), 'slots.inject()')
  }
  register(meta, render) {
    this.registered.push({ meta, render })
    return this.ctx.effect(() => () => {}, 'slots.register()')
  }
}

class Locale extends Service {
  constructor(ctx) {
    super(ctx, 'locale')
    this.locales = []
  }
  register(ns, dicts) {
    this.locales.push({ ns, dicts })
    return () => {}
  }
  bind() {
    return (key) => key
  }
}

const STATE = { 0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 4: 'disposed', 5: 'unloading' }

async function run(label, shape) {
  const ctx = new Context()
  ctx.plugin(Slots)
  ctx.plugin(Locale)
  await new Promise((resolve) => setTimeout(resolve, 10))
  const fiber = ctx.plugin(shape)
  let timeout
  const result = await Promise.race([
    fiber.await().then(() => 'settled', (error) => `threw: ${error?.message || error}`),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve('TIMEOUT (still loading)'), 1500)
    }),
  ])
  clearTimeout(timeout)
  console.log(`  ${label}: state=${fiber.state} (${STATE[fiber.state]}) -> ${result}`)
  await ctx.dispose?.()
  return { state: fiber.state, result }
}

console.log('fiber lifecycle for the real apply():')
const full = await run('full plugin', plugin)

console.log('\nbisect:')
await run('apply without locale effect', {
  inject: ['slots'],
  apply(ctx) {
    const Noop = () => null
    ctx.slots.inject('plugins.bundle.config', () => [
      ctx.slots.register({ name: 'plugins.bundle.config', key: 'a' }, () => null),
      ctx.slots.register({ name: 'plugins.bundle.config', key: 'b' }, () => null),
    ])
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'x' }, () => null))
  },
})
await run('apply returning a disposer array', {
  inject: ['slots'],
  apply(ctx) {
    return [() => {}]
  },
})
await run('apply returning ctx.slots.inject result', {
  inject: ['slots'],
  apply(ctx) {
    return ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'c' }, () => null))
  },
})

console.log(`\n${full.state === 2 ? 'REPRODUCED NOTHING — apply settles fine in Node' : 'REPRODUCED: apply does not settle'}`)
process.exitCode = full.state === 2 ? 0 : 1
