/**
 * Decides WHICH id the panel must PATCH so an edit sticks.
 *
 * A knowledge page in /knowledge-base/tree has a `kp-…` id; /mental-models
 * lists the same page under an `mm-…` id. This probe creates a page the way the
 * engine does, then edits through both surfaces to see which one the other side
 * observes — that is what the engine's drift check reads.
 *
 * Throwaway bank, removed at the end. Run: node test/mental-model-probe.mjs
 */
const base = (process.argv[2] || 'http://127.0.0.1:8888').replace(/\/+$/, '')
const stamp = Date.now().toString(36)
const bank = `zz-mm-test-${stamp}`

const call = async (method, path, body) => {
  const response = await fetch(base + path, {
    method,
    headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { status: response.status, body: parsed }
}

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`)
}

const enc = encodeURIComponent
const flatTree = (roots, out = []) => {
  for (const node of roots || []) {
    out.push(node)
    if (node.children) flatTree(node.children, out)
  }
  return out
}

try {
  console.log(`临时 bank: ${bank}\n`)
  await call('PUT', `/v1/default/banks/${enc(bank)}`, {})

  console.log('1) 像引擎那样建一张知识页（POST /knowledge-base/pages）')
  const madePage = await call('POST', `/v1/default/banks/${enc(bank)}/knowledge-base/pages`, {
    name: 'probe-page',
    source_query: 'Original question.',
    tags: ['knowledge:decision'],
    trigger: { mode: 'delta', refresh_cron: '17 * * * *' },
  })
  console.log(`     POST 返回: ${JSON.stringify(madePage.body).slice(0, 300)}`)
  check(`POST 成功 (${madePage.status})`, madePage.status === 200 || madePage.status === 201, madePage.body)

  const tree1 = flatTree((await call('GET', `/v1/default/banks/${enc(bank)}/knowledge-base/tree`)).body?.roots)
  const page = tree1.find((node) => node.kind === 'page' && node.name === 'probe-page')
  check('tree 里有这张页', Boolean(page), tree1.filter((n) => n.kind === 'page').map((n) => n.id))
  const kpId = page?.id
  console.log(`     tree id (kp) = ${kpId}`)
  console.log(`     tree description = ${JSON.stringify(page?.description)}`)

  const mm1 = (await call('GET', `/v1/default/banks/${enc(bank)}/mental-models`)).body?.items ?? []
  console.log(`     mental-models 里: ${JSON.stringify(mm1.map((m) => ({ id: m.id, name: m.name })))}`)
  const mm = mm1.find((entry) => entry.name === 'probe-page')
  check('同一页也出现在 mental-models 里', Boolean(mm), mm1.map((m) => m.name))
  const mmId = mm?.id
  check('两个 id 不同（kp- vs mm-）', kpId && mmId && kpId !== mmId, { kpId, mmId })

  console.log('\n2) 通过 mental-models 改 source_query，看 tree 是否看到')
  const viaMm = await call('PATCH', `/v1/default/banks/${enc(bank)}/mental-models/${enc(mmId)}`, {
    source_query: 'EDITED-VIA-MM.',
  })
  check(`PATCH mental-models 成功 (${viaMm.status})`, viaMm.status === 200, viaMm.body)
  const tree2 = flatTree((await call('GET', `/v1/default/banks/${enc(bank)}/knowledge-base/tree`)).body?.roots)
  const page2 = tree2.find((node) => node.id === kpId)
  console.log(`     tree description 现在 = ${JSON.stringify(page2?.description)}`)
  check('tree 的 description 跟着变了', page2?.description === 'EDITED-VIA-MM.', page2?.description)

  console.log('\n3) 通过 knowledge-base/nodes 改，看 mental-models 是否看到')
  const viaNode = await call('PATCH', `/v1/default/banks/${enc(bank)}/knowledge-base/nodes/${enc(kpId)}`, {
    source_query: 'EDITED-VIA-NODE.',
  })
  check(`PATCH nodes 成功 (${viaNode.status})`, viaNode.status === 200, viaNode.body)
  const mmAfter = await call('GET', `/v1/default/banks/${enc(bank)}/mental-models/${enc(mmId)}`)
  console.log(`     mental-model source_query 现在 = ${JSON.stringify(mmAfter.body?.source_query)}`)
  check('mental-model 也跟着变了', mmAfter.body?.source_query === 'EDITED-VIA-NODE.', mmAfter.body?.source_query)

  console.log('\n4) 结论性断言：两边是同一份数据')
  check('kp 与 mm 视图始终一致', page2?.description === 'EDITED-VIA-MM.' && mmAfter.body?.source_query === 'EDITED-VIA-NODE.')
} finally {
  const cleanup = await call('DELETE', `/v1/default/banks/${enc(bank)}`)
  console.log(`\n清理：DELETE 临时 bank → ${cleanup.status}`)
}

console.log(failures === 0 ? '\nPROBE OK' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
