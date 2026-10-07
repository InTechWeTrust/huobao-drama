import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

const scratch = process.env.HUOBAO_TEST_ROOT
if (!scratch || !path.isAbsolute(scratch) || (os.platform() === 'win32' && !path.resolve(scratch).toLowerCase().startsWith(path.resolve('E:/rubyapp/scratch').toLowerCase() + path.sep))) throw new Error('Supply HUOBAO_TEST_ROOT as an isolated absolute scratch directory (Windows: E:/rubyapp/scratch)')
process.env.SQLITE_PATH = path.join(scratch, 'huobao.sqlite')
process.env.HUOBAO_DATA_DIR = scratch
process.env.STORAGE_PATH = path.join(scratch, 'project')
process.env.HUOBAO_TEMP_DIR = path.join(scratch, 'temp')
process.env.WORKSPACE_PATH = path.join(scratch, 'workspace')
process.env.MYSQL_AUTO_IMPORT = 'false'
const { default: settings } = await import('../src/routes/settings.js')
const { db, schema } = await import('../src/db/index.js')
const { submitRubyMedia } = await import('../src/services/ruby-media.js')
const cards = ['active', 'lab', 'old'].map(state => ({ id: `fixture-${state}`, title: `Fixture ${state}`, kind: 'video', state, engine: 'comfyui', slots: [], bindings: {} }))
const evidence = { model: { id: 'minimax_h3', known: true, reason: "detected from the graph's nodes as MiniMax H3" } }
async function withRuby(work: (requests: string[]) => Promise<void>) {
  const original = globalThis.fetch, requests: string[] = []
  globalThis.fetch = async (url) => {
    const value = new URL(String(url)); requests.push(value.pathname)
    if (value.pathname === '/api/presets') { assert.equal(value.searchParams.get('state'), 'all'); return Response.json({ presets: cards }) }
    if (value.pathname.endsWith('/schema')) return Response.json(evidence)
    if (value.pathname === '/api/shots/capabilities') return Response.json({ capabilities: {} })
    if (value.pathname === '/api/shots/vocabulary') return Response.json({ resolutions: [] })
    if (value.pathname === '/api/shots/preview') return Response.json({ values: { seed: 42 }, notes: [] })
    if (value.pathname === '/api/library-use/sessions') return Response.json({ library_use_id: 'fixture-use', pushed: [] })
    if (value.pathname === '/api/jobs') return Response.json({ ref: 'fixture-render' })
    if (value.pathname === '/api/projects') return Response.json({ projects: [{ slug: 'huobao', root: process.env.STORAGE_PATH }] })
    throw new Error(`Unexpected service route ${value.pathname}`)
  }
  try { await work(requests) } finally { globalThis.fetch = original }
}
test('real settings route hides Old by default and groups catalogue on explicit refresh', async () => withRuby(async () => {
  const result = await settings.request('/ruby-media/presets')
  assert.equal(result.status, 200)
  assert.deepEqual((await result.json()).data.presets.map((card: any) => card.group), ['Active', 'Lab'])
  const requested = await settings.request('/ruby-media/presets?show_old=1')
  assert.deepEqual((await requested.json()).data.presets.map((card: any) => card.group), ['Active', 'Lab', 'Old'])
}))
test('Lab and Old details remain inspectable but default and control mutation is refused', async () => withRuby(async () => {
  for (const state of ['lab', 'old']) {
    const detail = await settings.request(`/ruby-media/presets/fixture-${state}`)
    assert.equal(detail.status, 200); assert.equal((await detail.json()).data.card.generationEligible, false)
    const save = await settings.request(`/ruby-media/presets/fixture-${state}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: {} }) })
    assert.equal(save.status, 400)
    const defaults = await settings.request('/ruby-media/defaults', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: `fixture-${state}`, video: `fixture-${state}` }) })
    assert.equal(defaults.status, 400)
  }
}))
test('Lab and Old native tasks refuse before preview, consultation, or render submission', async () => withRuby(async requests => {
  for (const state of ['lab', 'old']) {
    const task = db.insert(schema.sysTask).values({ type: 'video', provider: 'ruby', model: `fixture-${state}`, status: 'processing', createdAt: '2026-10-07', updatedAt: '2026-10-07' }).returning().get()
    await assert.rejects(submitRubyMedia('video', { id: task.id, model: `fixture-${state}` }), /Active local/)
  }
  assert.equal(requests.some(route => ['/api/jobs', '/api/shots/preview', '/api/library-use/sessions'].includes(route)), false)
}))
test('state changes after a saved selection revoke preview without overwriting saved controls', async () => withRuby(async requests => {
  const active = cards[0]
  const saved = JSON.stringify({ model: active.id, advanced: { retained: true } })
  db.insert(schema.appSettings).values({ key: 'ruby_shot:fixture-state-change', value: saved, updatedAt: '2026-10-07' }).run()
  active.state = 'lab'
  try {
    const response = await settings.request('/ruby-media/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: active.id, advanced: {} }) })
    assert.equal(response.status, 400)
    assert.equal(requests.includes('/api/shots/preview'), false)
    assert.equal(db.select().from(schema.appSettings).all().find(row => row.key === 'ruby_shot:fixture-state-change')?.value, saved)
  } finally { active.state = 'active' }
}))

 test('verified Active native task retains the existing preview/receipt/job submission path', async () => withRuby(async requests => {
  const task = db.insert(schema.sysTask).values({ type: 'video', provider: 'ruby', model: cards[0].id, status: 'processing', createdAt: '2026-10-07', updatedAt: '2026-10-07' }).returning().get()
  const result = await submitRubyMedia('video', { id: task.id, model: cards[0].id, prompt: 'Synthetic CPU fixture' })
  assert.equal(result.taskId, 'fixture-render'); assert.equal(result.consultation.library_use_id, 'fixture-use')
  assert.equal(requests.includes('/api/shots/preview'), true); assert.equal(requests.includes('/api/library-use/sessions'), true); assert.equal(requests.includes('/api/jobs'), true)
}))
