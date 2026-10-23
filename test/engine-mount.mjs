/**
 * Can the official engine be mounted FROM our package instead of copied?
 *
 * Mounts @vectorize-io/hindsight-coding-agents/dsh on a fake Host context —
 * once, and then twice — to answer two questions:
 *   1. does its apply() work when called by another plugin (no Loader row)?
 *   2. what happens if both bundles are installed and it is mounted twice?
 *
 * Run: node test/engine-mount.mjs
 */
import { readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Candidate engine copies: the package itself (when this repo is installed in a
 * profile), every installed profile, and an explicit override.
 */
function candidates() {
  const out = []
  if (process.env.DSH_ENGINE_PATH) out.push(process.env.DSH_ENGINE_PATH)
  out.push(join(import.meta.dirname, '..', 'node_modules', '@vectorize-io', 'hindsight-coding-agents', 'dist', 'dsh.js'))
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  try {
    for (const profile of readdirSync(join(home, 'profiles'))) {
      out.push(join(home, 'profiles', profile, 'node_modules', '@vectorize-io', 'hindsight-coding-agents', 'dist', 'dsh.js'))
    }
  } catch {
    /* no profiles directory */
  }
  return out.map((path) => path.replace(/\\/g, '/')).filter((path) => existsSync(path))
}

const CANDIDATES = candidates()

let engine
let from
for (const candidate of CANDIDATES) {
  try {
    engine = await import(`file://${candidate}`)
    from = candidate
    break
  } catch (error) {
    console.log(`  (cannot load ${candidate}: ${error.message})`)
  }
}
if (!engine) {
  console.log('engine not found; skipping')
  process.exitCode = 0
} else {
  console.log(`engine loaded from ${from}`)
  console.log(`  exports: ${Object.keys(engine).join(', ')}`)
  console.log(`  declared inject: ${JSON.stringify(engine.inject)}`)

  function fakeCtx() {
    const listeners = []
    const tools = []
    return {
      ctx: {
        on(event) {
          listeners.push(event)
        },
        inject(services, callback) {
          callback({ tools: { register: (definition) => tools.push(definition.name), schemas: () => [] } })
        },
        get() {
          return undefined
        },
        effect(fn) {
          fn()
        },
      },
      listeners,
      tools,
    }
  }

  const first = fakeCtx()
  await engine.apply(first.ctx)
  console.log(`\n1) mounted once by a foreign plugin`)
  console.log(`   hooks listened: ${first.listeners.join(', ')}`)
  console.log(`   tools registered (${first.tools.length}): ${first.tools.join(', ')}`)

  const second = fakeCtx()
  await engine.apply(second.ctx)
  const overlap = second.tools.filter((name) => first.tools.includes(name))
  console.log(`\n2) mounted twice (both bundles selected)`)
  console.log(`   second mount tools: ${second.tools.length}, overlapping names: ${overlap.length}`)
  console.log(`   overlap: ${overlap.join(', ')}`)
  console.log(
    overlap.length
      ? '\n   => 同一进程挂两次会重复注册同名工具；不能既让我们的包挂它、又让官方 bundle 自己再挂一次。'
      : '\n   => no overlap',
  )
}
