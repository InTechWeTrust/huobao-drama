import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'

process.env.SQLITE_PATH = path.join('E:/Media/Huobao/Temp/tests/lifecycle', `lifecycle-${process.pid}.sqlite`)
process.env.HUOBAO_DATA_DIR = path.dirname(process.env.SQLITE_PATH)
process.env.STORAGE_PATH = 'E:/Media/Huobao/Project'

const { db, schema } = await import('../src/db/index.js')
const { submitRubyMedia, readRubyMedia, buildRubyShot, localRubyPresets } = await import('../src/services/ruby-media.js')
const { getActiveConfig } = await import('../src/services/ai.js')
const { default: settings } = await import('../src/routes/settings.js')
const { eq } = await import('drizzle-orm')
const { buildAgentRequestContext } = await import('../src/agents/context.js')
const { machineEffortFetch } = await import('../src/services/episode-brain.js')
const { default: aiConfigs } = await import('../src/routes/aiConfigs.js')

test('episode brains and efforts stay isolated across native agent flows and never rewrite the global brain', async () => {
  await settings.request('/machine-brain', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-6.1-sol', effort: 'low' }) })
  const choices = (await (await aiConfigs.request('/?service_type=text')).json()).data
  assert.deepEqual(new Set(choices[0].model), new Set(['gpt-6.1-sol', 'claude-opus-5-5', 'local:qwen3.8-27b@ninfer-ruby']))
  const drama = db.insert(schema.dramas).values({ title: 'Brain isolation fixture', createdAt: '2026-10-04', updatedAt: '2026-10-04' }).returning().get()
  const episodes = [1, 2].map(episodeNumber => db.insert(schema.episodes).values({ dramaId: drama.id, episodeNumber, title: 'Fixture', createdAt: '2026-10-04', updatedAt: '2026-10-04' }).returning().get())
  const brains = [{ model: 'gpt-6.1-sol', effort: 'ultra' }, { model: 'claude-opus-5-5', effort: 'max' }]
  for (let i = 0; i < episodes.length; i++) {
    const saved = await settings.request(`/machine-brain/episodes/${episodes[i].id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brains[i]) })
    assert.equal(saved.status, 200)
    const rc = buildAgentRequestContext({ episodeId: episodes[i].id, dramaId: drama.id })
    assert.equal(rc.get('modelOverride'), brains[i].model); assert.equal(rc.get('reasoningEffort'), brains[i].effort)
  }
  const invalid = await settings.request(`/machine-brain/episodes/${episodes[0].id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'local:qwen3.8-27b@ninfer-ruby', effort: 'max' }) })
  assert.equal(invalid.status, 400)
  const before = await getActiveConfig('text')
  assert.equal(before?.model, 'gpt-6.1-sol'); assert.equal(before?.reasoningEffort, 'low')
  const original = globalThis.fetch, received: any[] = []
  globalThis.fetch = async (_url, init) => { received.push(JSON.parse(String(init?.body))); return Response.json({ choices: [] }) }
  try {
    await Promise.all(brains.map(brain => machineEffortFetch(brain.model, brain.effort)('http://127.0.0.1:5679/api/v1/machine/v1/chat/completions', { body: JSON.stringify({ model: brain.model }) })))
    assert.deepEqual(received.map(item => item.reasoning_effort), ['ultra', 'max'])
    assert.deepEqual(await getActiveConfig('text'), before)
  } finally { globalThis.fetch = original }
})

test('brain settings are available through REST and reject unsupported per-model efforts', async () => {
  const unsupported = await settings.request('/machine-brain', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'local:qwen3.8-27b@ninfer-ruby', effort: 'max' }) })
  assert.equal(unsupported.status, 400)
  const saved = await settings.request('/machine-brain', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-6.1-sol', effort: 'xhigh' }) })
  assert.equal(saved.status, 200)
  const active = await getActiveConfig('text')
  assert.equal(active?.model, 'gpt-6.1-sol')
  assert.equal(active?.reasoningEffort, 'xhigh')
  assert.equal(active?.apiKey, 'local-only')
  const read = await settings.request('/machine-brain')
  const data = (await read.json()).data
  assert.equal(data.model, active?.model)
  assert.equal(data.efforts_by_model[data.model].includes('ultra'), true)
})

test('native media task submits only local approved preset with same Library receipt and polls its own ref', async () => {
  const card = { id: 'qwen_image_2_1_t2i', kind: 'image', engine: 'comfyui', state: 'active', slots: [{ name: 'prompt', type: 'text', required: true }], bindings: { prompt: { slot: 'prompt' } } }
  const requests: { route: string; body: any; headers: HeadersInit | undefined }[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    const route = new URL(String(url)).pathname
    const body = options?.body ? JSON.parse(String(options.body)) : null
    requests.push({ route, body, headers: options?.headers })
    assert.equal((options?.headers as any)['X-Ruby-Origin'], 'huobao-drama')
    assert.equal((options?.headers as any)['X-Ruby-Session'], 'huobao-drama')
    if (route === '/api/projects') return Response.json({ projects: [{ slug: 'huobao', root: process.env.STORAGE_PATH }] })
    if (route === '/api/shots/capabilities') return Response.json({ capabilities: {} })
    if (route === '/api/presets') return Response.json({ presets: [card, { ...card, id: 'wan3' }] })
    if (route === `/api/presets/${card.id}/schema`) return Response.json({ model: { id: 'qwen_image_2_1', known: true }, standard: [{ patch: [{ class_type: 'TextEncodeQwenImage21' }] }] })
    if (route === '/api/presets/wan3/schema') return Response.json({ model: { id: 'wan3', known: true } })
    if (route === '/api/shots/preview') return Response.json({ values: { prompt: body.prompt, length: 124 }, notes: [{ field: 'duration', message: 'Bound by Ruby' }] })
    if (route === '/api/library-use/sessions') return Response.json({ library_use_id: 'ruby:library-call:test', pushed: [{ item_id: 'doc:guide', request: 'guide#qwen', sha256: 'abc', text: 'Frame advice' }], findings: [] })
    if (route === '/api/jobs') return Response.json({ ref: '17', lane: 'gpu', library: { library_use_id: body.library_use_id } })
    if (route === '/api/jobs/17') return Response.json({ status: 'succeeded', result: { storage_uri: 'E:/Media/Rubyapp/Project/huobao/02 Output/image/frame.png' } })
    throw new Error(`Unexpected route ${route}`)
  }
  try {
    const task = db.insert(schema.sysTask).values({ type: 'image', provider: 'ruby', model: card.id, prompt: 'A forest', status: 'processing', createdAt: '2026-10-04', updatedAt: '2026-10-04' }).returning().get()
    const submitted = await submitRubyMedia('image', { id: task.id, model: card.id, prompt: 'A forest' })
    assert.equal(submitted.taskId, '17')
    const post = requests.find(row => row.route === '/api/jobs')!
    assert.equal(post.body.project, 'huobao')
    assert.equal(post.body.preset, card.id)
    assert.equal(post.body.values.prompt, 'A forest')
    assert.equal(post.body.values.length, 124)
    assert.equal(post.body.library_use_id, 'ruby:library-call:test')
    assert.equal(post.body.library_citations[0].sha256, 'abc')
    assert.match(post.body.override_reason, /Huobao/)
    db.update(schema.sysTask).set({ taskId: '17' }).where(eq(schema.sysTask.id, task.id)).run()
    assert.equal((await readRubyMedia('17', 'image')).status, 'completed')
    await assert.rejects(readRubyMedia('18', 'image'), /does not belong/)
    await assert.rejects(submitRubyMedia('image', { id: 9999, model: card.id, prompt: 'No task' }), /native Huobao/)
    await assert.rejects(submitRubyMedia('image', { id: task.id, model: 'wan3', prompt: 'No cloud' }), /Active local/)
  } finally { globalThis.fetch = original }
})

test('pending native workspace mapping refuses jobs before any render request', async () => {
  const original = globalThis.fetch
  let called = 0
  globalThis.fetch = async (url) => {
    called++
    assert.equal(new URL(String(url)).pathname, '/api/projects')
    return Response.json({ projects: [{ slug: 'huobao', root: 'E:/Media/Rubyapp/Project/huobao' }] })
  }
  try {
    const task = db.insert(schema.sysTask).values({ type: 'video', provider: 'ruby', model: 'any', prompt: '', status: 'processing', createdAt: '2026-10-04', updatedAt: '2026-10-04' }).returning().get()
    await assert.rejects(submitRubyMedia('video', { id: task.id, model: 'any' }), /path mapping is pending/)
    assert.equal(called, 1)
  } finally { globalThis.fetch = original }
})

test('Extend binds the existing clip and preserves the card new-part duration; rejects unsupported continuation', () => {
  const file = `E:/Media/Huobao/Temp/tests/extend/extend-test-${process.pid}.mp4`
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'mock media, no GPU')
  const card = { id: 'any-h3-card', slots: [{ name: 'seconds', type: 'float', default: 9.9166666667 }], bindings: { duration_s: { slot: 'seconds', unit: 'seconds' }, extend_from: { slot: 'source' } }, shotCapability: { continuations: [{ id: 'motion', possible: true }, { id: 'picture', possible: false }] } }
  try {
    const shot = buildRubyShot(card, { prompt: 'Continue camera movement', extendFrom: file, extendKind: 'motion', duration: 5.2 }, 'video', {})
    assert.equal(shot.mode, 'extend'); assert.equal(shot.extend_from, fs.realpathSync(file)); assert.equal(shot.extend_kind, 'motion')
    assert.equal(shot.duration_s, 5.2) // Ruby alone adds/trims the context and snaps the frame grid.
    assert.equal(buildRubyShot(card, { extendFrom: file, extendKind: 'motion' }, 'video', {}).duration_s, 9.9166666667)
    assert.throws(() => buildRubyShot(card, { extendFrom: file, extendKind: 'picture' }, 'video', {}), /cannot continue picture/)
    assert.throws(() => buildRubyShot(card, { extendFrom: 'C:/Windows/win.ini', extendKind: 'motion' }, 'video', {}), /outside the approved/)
  } finally { fs.unlinkSync(file) }
})

test('catalogue and native schema are read fresh when cards change or disappear', async () => {
  const original = globalThis.fetch
  let revision = 1
  let schemaReads = 0
  globalThis.fetch = async (url) => {
    const route = new URL(String(url)).pathname
    if (route === '/api/presets') return Response.json({ presets: revision === 3 ? [] : [{ id: 'new-h3-card', kind: 'video', engine: 'comfyui', state: 'active', version: revision }] })
    if (route === '/api/shots/capabilities') return Response.json({ capabilities: { 'new-h3-card': { duration_s: { min: revision, max: 10 }, continuations: [] } } })
    if (route.endsWith('/schema')) { schemaReads++; return Response.json({ model: { id: 'minimax_h3', known: true, reason: "detected from the graph's nodes as MiniMax H3" }, standard: [{ key: `changed-${revision}` }] }) }
    throw new Error(route)
  }
  try {
    assert.equal((await localRubyPresets('video'))[0].version, 1)
    revision = 2
    const changed = (await localRubyPresets('video'))[0]
    assert.equal(changed.version, 2); assert.equal(changed.runtimeSchema.standard[0].key, 'changed-2'); assert.equal(changed.shotCapability.duration_s.min, 2)
    revision = 3; assert.deepEqual(await localRubyPresets('video'), []); assert.equal(schemaReads, 2)
  } finally { globalThis.fetch = original }
})

test('explicit additional-track opt-out persists per shot and survives native generation audio=true', async () => {
  const drama = db.insert(schema.dramas).values({ title: 'Audio controls fixture', createdAt: '2026-10-04', updatedAt: '2026-10-04' }).returning().get()
  const episode = db.insert(schema.episodes).values({ dramaId: drama.id, title: 'Audio fixture', episodeNumber: 1, createdAt: '2026-10-04', updatedAt: '2026-10-04' }).returning().get()
  const storyboard = db.insert(schema.storyboards).values({ episodeId: episode.id, storyboardNumber: 1, createdAt: '2026-10-04', updatedAt: '2026-10-04' }).returning().get()
  const card = { id: 'native-h3-audio', kind: 'video', engine: 'comfyui', state: 'active', slots: [], bindings: {} }
  const original = globalThis.fetch
  const submitted: any[] = [], previews: any[] = []
  globalThis.fetch = async (url, options) => {
    const route = new URL(String(url)).pathname, body = options?.body ? JSON.parse(String(options.body)) : null
    if (route === '/api/projects') return Response.json({ projects: [{ slug: 'huobao', root: process.env.STORAGE_PATH }] })
    if (route === '/api/presets') return Response.json({ presets: [card] })
    if (route === '/api/shots/capabilities') return Response.json({ capabilities: {} })
    if (route.endsWith('/schema')) return Response.json({ model: { id: 'minimax_h3', known: true, reason: "detected from the graph's nodes as MiniMax H3" } })
    if (route === '/api/shots/preview') {
      previews.push(body)
      return Response.json({ values: { native_h3_audio: 'keep', source_audio: 'keep' }, notes: body.audio_enabled ? [{ field: 'speech', severity: 'blocked', message: 'Additional speech provider 7040 is offline' }] : [] })
    }
    if (route === '/api/library-use/sessions') return Response.json({ library_use_id: 'audio-test', pushed: [] })
    if (route === '/api/jobs') { submitted.push(body); return Response.json({ ref: 'audio-job' }) }
    throw new Error(route)
  }
  try {
    const save = async (audio_enabled: unknown) => settings.request(`/ruby-media/shot-controls/${storyboard.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: card.id, audio_enabled, advanced: {} }) })
    assert.equal((await save(false)).status, 200)
    const persisted = (await (await settings.request(`/ruby-media/shot-controls/${storyboard.id}`)).json()).data
    assert.equal(persisted.audio_enabled, false)
    const preview = await settings.request('/ruby-media/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: card.id, ...persisted, prompt: 'Native soundtrack remains owner-governed' }) })
    assert.equal(preview.status, 200); assert.equal(previews.at(-1).audio_enabled, false)
    const task = db.insert(schema.sysTask).values({ type: 'video', provider: 'ruby', model: card.id, storyboardId: storyboard.id, prompt: '', status: 'processing', createdAt: '2026-10-04', updatedAt: '2026-10-04' }).returning().get()
    await submitRubyMedia('video', { id: task.id, model: card.id, generateAudio: true })
    assert.equal(previews.at(-1).audio_enabled, false)
    assert.deepEqual(submitted[0].values, { native_h3_audio: 'keep', source_audio: 'keep' })
    assert.equal((await save(null)).status, 200)
    await assert.rejects(submitRubyMedia('video', { id: task.id, model: card.id, generateAudio: true }), /Additional speech provider 7040 is offline/)
    assert.equal(previews.at(-1).audio_enabled, true); assert.equal(submitted.length, 1)
    assert.equal((await save('false')).status, 400)
  } finally { globalThis.fetch = original }
})
