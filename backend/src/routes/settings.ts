/**
 * 应用设置路由 — 全局配置的读写入口（当前：AI 内容语言）
 */
import { Hono } from 'hono'
import { getContentLanguage, setContentLanguage, getToursSeen, setToursSeen, CONTENT_LANGUAGES, type ContentLanguage } from '../services/app-settings.js'
import { success, badRequest } from '../utils/response.js'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { MACHINE_MODELS, MACHINE_EFFORTS, MACHINE_EFFORTS_BY_MODEL, parseConfigEffort } from '../services/ai.js'
import { getEpisodeBrain, setEpisodeBrain } from '../services/episode-brain.js'
import { localRubyPresetCatalogue, localRubyPresets, getRubyValues, setRubyValues, submitRubyMedia, readRubyMedia, rubyRequest, getRubyShotControls, setRubyShotControls, buildRubyShot, rubyPresetDefaults } from '../services/ruby-media.js'

const app = new Hono()

app.get('/machine-brain/episodes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!db.select().from(schema.episodes).where(eq(schema.episodes.id, id)).get()) return badRequest(c, 'Episode does not exist')
  const saved = getEpisodeBrain(id)
  const configs = db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.serviceType, 'text')).all().filter(row => row.isActive).sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const model = saved?.model || JSON.parse(configs[0]?.model || '["gpt-6.1-sol"]')[0]
  const effort = saved?.effort || parseConfigEffort(configs[0]?.settings)
  return success(c, { model, effort: MACHINE_EFFORTS_BY_MODEL[model]?.includes(effort) ? effort : 'low', scoped: Boolean(saved), models: MACHINE_MODELS, efforts_by_model: MACHINE_EFFORTS_BY_MODEL })
})

app.put('/machine-brain/episodes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!db.select().from(schema.episodes).where(eq(schema.episodes.id, id)).get()) return badRequest(c, 'Episode does not exist')
  const body = await c.req.json().catch(() => null)
  try { return success(c, setEpisodeBrain(id, body?.model, body?.effort)) } catch (err) { return badRequest(c, (err as Error).message) }
})

app.get('/machine-brain', async (c) => {
  const rows = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.serviceType, 'text'))
  const active = rows.filter(row => row.isActive).sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
  return success(c, { model: active ? JSON.parse(active.model || '[]')[0] : 'gpt-6.1-sol', effort: parseConfigEffort(active?.settings), models: MACHINE_MODELS, efforts: MACHINE_EFFORTS, efforts_by_model: MACHINE_EFFORTS_BY_MODEL })
})

app.put('/machine-brain', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!(MACHINE_MODELS as readonly string[]).includes(body.model) || !MACHINE_EFFORTS_BY_MODEL[body.model]?.includes(body.effort)) return badRequest(c, 'Select an effort supported by this machine model')
  const rows = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.serviceType, 'text'))
  const existing = rows.find(row => row.name === 'Machine Brain')
  const port = process.env.PORT || '5679'
  const fields = { provider: 'openai', baseUrl: `http://127.0.0.1:${port}/api/v1/machine`, apiKey: 'local-only', model: JSON.stringify([body.model, ...MACHINE_MODELS.filter(model => model !== body.model)]), priority: 1000, isActive: true, settings: JSON.stringify({ reasoning_effort: body.effort }), updatedAt: now() }
  db.transaction(tx => {
    tx.update(schema.aiServiceConfigs).set({ isActive: false }).where(eq(schema.aiServiceConfigs.serviceType, 'text')).run()
    if (existing) tx.update(schema.aiServiceConfigs).set(fields).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
    else tx.insert(schema.aiServiceConfigs).values({ ...fields, serviceType: 'text', name: 'Machine Brain', createdAt: now() }).run()
  })
  return success(c, { model: body.model, effort: body.effort })
})

app.get('/ruby-media/presets', async (c) => {
  try { return success(c, { presets: await localRubyPresetCatalogue(c.req.query('show_old') === '1') }) } catch (err) { return badRequest(c, (err as Error).message) }
})

app.get('/ruby-media', async (c) => {
  try {
    const configs = await db.select().from(schema.aiServiceConfigs)
    return success(c, { presets: await localRubyPresets(), defaults: Object.fromEntries(['image', 'video'].map(kind => [kind, configs.find(row => row.serviceType === kind && row.provider === 'ruby' && row.isActive)?.model])) })
  } catch (err) { return badRequest(c, (err as Error).message) }
})

app.get('/ruby-media/presets/:preset', async (c) => {
  const preset = c.req.param('preset')
  const card = (await localRubyPresetCatalogue(true)).find((item: any) => item.id === preset)
  if (!card) return badRequest(c, 'Preset is outside the local Library catalogue')
  return success(c, { card, values: getRubyValues(preset), vocabulary: await rubyRequest('/api/shots/vocabulary') })
})

app.get('/ruby-media/shot-controls/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).get()) return badRequest(c, 'Storyboard does not exist')
  return success(c, getRubyShotControls(id))
})

app.put('/ruby-media/shot-controls/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id)).get()) return badRequest(c, 'Storyboard does not exist')
  const body = await c.req.json().catch(() => null)
  const card = (await localRubyPresets()).find((item: any) => item.id === body?.model)
  if (!card) return badRequest(c, 'Choose a currently Active H3/Qwen preset')
  const advanced = body.advanced || {}
  if (!advanced || typeof advanced !== 'object' || Array.isArray(advanced)) return badRequest(c, 'Preset controls must be an object')
  const names = new Set(card.slots.map((slot: any) => slot.name))
  if (Object.keys(advanced).some(key => !names.has(key))) return badRequest(c, 'Unknown live preset control')
  try {
    buildRubyShot(card, { ...body, prompt: 'Validate local inputs', extendFrom: body.extend_from, extendKind: body.extend_kind }, card.kind, advanced)
    const controls = { model: card.id, extend_from: body.extend_from || '', extend_kind: body.extend_kind || '', resolution: body.resolution || '', audio_enabled: body.audio_enabled ?? null, advanced }
    setRubyShotControls(id, controls)
    return success(c, controls)
  } catch (err) { return badRequest(c, (err as Error).message) }
})

app.post('/ruby-media/preview', async (c) => {
  const body = await c.req.json().catch(() => null)
  const card = (await localRubyPresets(undefined, true)).find((item: any) => item.id === body?.model)
  if (!card) return badRequest(c, 'Preset was removed, disabled or changed to an unsupported model family; refresh the picker')
  try {
    const shot = buildRubyShot(card, { ...body, extendFrom: body.extend_from, extendKind: body.extend_kind }, card.kind, { ...rubyPresetDefaults(card), ...(body.advanced || {}) })
    const preview = await rubyRequest('/api/shots/preview', shot)
    return success(c, { ...preview, card_version: card.version, delivery_requires_enhancement: (preview.notes || []).some((note: any) => note.field === 'resolution' && /needs an upscale pass|fixed dimensions/i.test(note.message)) })
  } catch (err) { return badRequest(c, (err as Error).message) }
})

app.put('/ruby-media/presets/:preset', async (c) => {
  const preset = c.req.param('preset')
  const card = (await localRubyPresets()).find((item: any) => item.id === preset)
  if (!card) return badRequest(c, 'Preset is outside the enabled local model set')
  const body = await c.req.json().catch(() => null)
  if (!body?.values || typeof body.values !== 'object' || Array.isArray(body.values)) return badRequest(c, 'values must contain preset inputs')
  const names = new Set(card.slots.map((slot: any) => slot.name))
  if (Object.keys(body.values).some(key => !names.has(key))) return badRequest(c, 'Unknown preset input')
  setRubyValues(preset, body.values)
  return success(c, { preset, values: body.values })
})

app.put('/ruby-media/defaults', async (c) => {
  const body = await c.req.json().catch(() => null)
  const cards = await localRubyPresets()
  for (const kind of ['image', 'video']) {
    if (!cards.some((card: any) => card.id === body?.[kind] && card.kind === kind)) return badRequest(c, `Select an Active ${kind} preset`)
  }
  for (const kind of ['image', 'video']) {
    const rows = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.serviceType, kind))
    const existing = rows.find(row => row.name === `Ruby ${kind}`)
    const fields = { provider: 'ruby', model: JSON.stringify([body[kind], ...cards.filter((card: any) => card.kind === kind && card.id !== body[kind]).map((card: any) => card.id)]), apiKey: '', baseUrl: `http://127.0.0.1:${process.env.PORT || '5679'}/api/v1/settings/ruby-media`, priority: 1000, isActive: true, updatedAt: now() }
    db.transaction(tx => {
      tx.update(schema.aiServiceConfigs).set({ isActive: false }).where(eq(schema.aiServiceConfigs.serviceType, kind)).run()
      if (existing) tx.update(schema.aiServiceConfigs).set(fields).where(eq(schema.aiServiceConfigs.id, existing.id)).run()
      else tx.insert(schema.aiServiceConfigs).values({ ...fields, serviceType: kind, name: `Ruby ${kind}`, createdAt: now() }).run()
    })
  }
  return success(c, body)
})

for (const kind of ['image', 'video'] as const) {
  app.post(`/ruby-media/${kind}`, async (c) => {
    try { return c.json(await submitRubyMedia(kind, await c.req.json())) } catch (err) { return badRequest(c, (err as Error).message) }
  })
}

app.get('/ruby-media/jobs/:ref', async (c) => {
  const kind = c.req.query('kind')
  if (kind !== 'image' && kind !== 'video') return badRequest(c, 'Unknown media type')
  try { return c.json(await readRubyMedia(c.req.param('ref'), kind)) } catch (err) { return badRequest(c, (err as Error).message) }
})

app.get('/ruby-media/key-assets', async (c) => {
  try { return success(c, await rubyRequest(`/api/media/browse?path=${encodeURIComponent(process.env.RUBY_KEY_ASSET_ROOT || 'E:\\Media\\Rubyapp\\KeyAsset')}`)) } catch (err) { return badRequest(c, (err as Error).message) }
})

// GET /content-language — 当前 AI 内容语言
app.get('/content-language', async (c) => {
  return success(c, { language: await getContentLanguage() })
})

// PUT /content-language — 设置 AI 内容语言（body: { language: 'zh'|'en'|'ja'|'ko' }）
app.put('/content-language', async (c) => {
  const body = await c.req.json().catch(() => null)
  const language = body?.language
  if (!(CONTENT_LANGUAGES as readonly string[]).includes(language)) {
    return badRequest(c, `language 必须是 ${CONTENT_LANGUAGES.join(' / ')} 之一`)
  }
  const saved = await setContentLanguage(language as ContentLanguage)
  return success(c, { language: saved })
})

// GET /tours-seen — 已看过的引导漫游 id 列表
app.get('/tours-seen', async (c) => {
  return success(c, { seen: await getToursSeen() })
})

// PUT /tours-seen — 写入已看过的引导漫游 id 列表（body: { seen: string[] }）
app.put('/tours-seen', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!Array.isArray(body?.seen) || !body.seen.every((v: unknown) => typeof v === 'string')) {
    return badRequest(c, 'seen 必须是字符串数组')
  }
  return success(c, { seen: await setToursSeen(body.seen) })
})

export default app
