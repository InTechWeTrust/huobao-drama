import { readRubyPresetCatalogue } from './ruby-preset-catalogue.js'
import fs from 'node:fs'
import path from 'node:path'
import { STORAGE_ROOT } from '../utils/paths.js'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { getAbsolutePath } from '../utils/storage.js'
import { sharedMediaReference } from '../utils/shared-media-reference.js'
import { now } from '../utils/response.js'
import { parseRubyJob, rubyLoopbackBase, RUBY_HEADERS, type MediaKind } from './ruby-media-policy.js'

export async function rubyRequest(route: string, body?: unknown) {
  const response = await fetch(`${rubyLoopbackBase()}${route}`, {
    method: body === undefined ? 'GET' : 'POST', headers: RUBY_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Ruby ${response.status}: ${(await response.text()).slice(0, 2000)}`)
  return response.json() as Promise<any>
}

export function localRubyPresetCatalogue(showOld = false) {
  return readRubyPresetCatalogue(rubyRequest, { showOld, fresh: true })
}

export async function localRubyPresets(kind?: MediaKind, fresh = true) {
  return (await readRubyPresetCatalogue(rubyRequest, { kind, fresh })).filter(card => card.generationEligible)
}

export function getRubyValues(preset: string): Record<string, unknown> {
  const row = db.select().from(schema.appSettings).where(eq(schema.appSettings.key, `ruby_values:${preset}`)).get()
  try { return JSON.parse(row?.value || '{}') } catch { return {} }
}

export function setRubyValues(preset: string, values: Record<string, unknown>) {
  const key = `ruby_values:${preset}`
  const value = JSON.stringify(values)
  db.insert(schema.appSettings).values({ key, value, updatedAt: now() })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: now() } }).run()
}

export function getRubyShotControls(storyboardId: number | null): Record<string, any> {
  if (!storyboardId) return {}
  const row = db.select().from(schema.appSettings).where(eq(schema.appSettings.key, `ruby_shot:${storyboardId}`)).get()
  try { return JSON.parse(row?.value || '{}') } catch { return {} }
}

export function setRubyShotControls(storyboardId: number, controls: Record<string, unknown>) {
  const key = `ruby_shot:${storyboardId}`
  const value = JSON.stringify(controls)
  db.insert(schema.appSettings).values({ key, value, updatedAt: now() }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: now() } }).run()
}

/** Global defaults never override the native shot's prompt, timing or size. */
export function rubyPresetDefaults(card: any) {
  const automatic = new Set(['prompt', 'duration_s', 'seed', 'width', 'height'].flatMap(key => slotsOf(card.bindings?.[key])))
  return Object.fromEntries(Object.entries(getRubyValues(card.id)).filter(([key]) => !automatic.has(key) && !/filename_prefix|output_path/i.test(key)))
}

function slotsOf(binding: any): string[] {
  return binding?.slots || (binding?.slot ? [binding.slot] : [])
}

function localReference(value: string): string {
  const raw = String(value || '').trim()
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const target = getAbsolutePath(raw.replace(/^\//, ''))
    if (!fs.existsSync(target)) throw new Error(`Reference file does not exist: ${raw}`)
    return sharedMediaReference(target)
  }
  return sharedMediaReference(raw)
}

export function buildRubyShot(card: any, record: any, kind: MediaKind, configured: Record<string, unknown>) {
  if (record.audio_enabled != null && typeof record.audio_enabled !== 'boolean') throw new Error('Additional audio tracks must be true, false or null to use the existing policy')
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) throw new Error('Native preset controls must be an object')
  for (const [name, value] of Object.entries(configured)) {
    const slot = (card.slots || []).find((item: any) => item.name === name)
    if (!slot) throw new Error(`The live card no longer contains control ${name}; refresh it`)
    if (/filename_prefix|output_path/i.test(name)) throw new Error('Output locations are owned by the Huobao workspace')
    if (value == null || value === '') continue
    if (['int', 'float', 'seed'].includes(slot.type) && (typeof value !== 'number' || !Number.isFinite(value) || (slot.min != null && value < slot.min) || (slot.max != null && value > slot.max))) throw new Error(`Control ${name} is outside its current native range`)
    if (slot.options?.length && !slot.options.includes(value)) throw new Error(`Control ${name} is outside its current native choices`)
  }
  const decode = (raw: any): string[] => {
    const value = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw || []
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('References must be a list of local media paths')
    return value
  }
  const firstFrame = kind === 'video' && (record.firstFrameUrl || (record.referenceMode === 'first_last_frame' ? record.imageUrl : null))
  const lastFrame = kind === 'video' && record.lastFrameUrl
  const rawRefs = kind === 'image' ? decode(record.referenceImages) : [...(record.imageUrl && !firstFrame ? [record.imageUrl] : []), ...decode(record.referenceImageUrls), ...decode(record.referenceVideoUrls), ...decode(record.referenceAudioUrls)]
  const references = [...new Set(rawRefs)].map(localReference)
  if (references.length > slotsOf(card.bindings?.references).length) throw new Error(`Preset accepts ${slotsOf(card.bindings?.references).length} references; received ${references.length}`)
  if (firstFrame && !slotsOf(card.bindings?.first_frame).length) throw new Error('This preset has no first-frame input')
  if (lastFrame && !slotsOf(card.bindings?.last_frame).length) throw new Error('This preset has no last-frame input')
  if (record.referenceFileUrl || record.referenceLinkUrl) throw new Error('File/link references need an explicit Ruby preset control')
  const mediaSlots = new Set((card.slots || []).filter((slot: any) => slot.type.endsWith('_asset')).map((slot: any) => slot.name))
  const advanced = Object.fromEntries(Object.entries(configured).map(([key, value]) => [key, mediaSlots.has(key) && value ? localReference(String(value)) : value]))
  const extendFrom = record.extendFrom || record.extend_from
  const extendKind = record.extendKind || record.extend_kind || ''
  if (extendFrom && !extendKind) throw new Error('Select a live picture or motion continuation for the source clip')
  if (extendKind && !['picture', 'motion'].includes(extendKind)) throw new Error('Extend kind must be picture or motion')
  const continuations = card.shotCapability?.continuations || []
  if (extendFrom && extendKind && !continuations.some((choice: any) => choice.id === extendKind && choice.possible)) throw new Error(`This preset cannot continue ${extendKind}; inspect its live continuation controls`)
  const mode = extendFrom ? 'extend' : firstFrame && lastFrame ? 'first_last' : firstFrame ? 'image' : references.length ? 'reference' : 'text'
  // Default duration comes from this card's bound duration control, never a global 15s rule.
  const durationSlots = slotsOf(card.bindings?.duration_s)
  const durationSlot = (card.slots || []).find((slot: any) => durationSlots.includes(slot.name))
  const defaultDuration = card.bindings?.duration_s?.unit === 'frames' ? undefined : durationSlot?.default
  return {
    preset: card.id, project: 'huobao', prompt: String(record.prompt || ''), mode, references,
    ...(firstFrame ? { first_frame: localReference(firstFrame) } : {}),
    ...(lastFrame ? { last_frame: localReference(lastFrame) } : {}),
    ...(extendFrom ? { extend_from: localReference(extendFrom), extend_kind: extendKind } : {}),
    duration_s: Number(record.duration ?? defaultDuration ?? 5), aspect: record.aspectRatio || 'auto', resolution: String(record.resolution || '480p').toLowerCase(),
    seed: record.seed ?? null, audio_enabled: record.audio_enabled ?? (record.generateAudio !== false && record.generateAudio !== 0),
    advanced,
  }
}

export async function submitRubyMedia(kind: MediaKind, record: any) {
  const owned = db.select().from(schema.sysTask).where(and(eq(schema.sysTask.id, Number(record.id)), eq(schema.sysTask.provider, 'ruby'), eq(schema.sysTask.type, kind))).get()
  if (!owned || owned.status !== 'processing') throw new Error('Create a native Huobao media task before submitting to Ruby')
  const projects = await rubyRequest('/api/projects')
  const project = projects.projects?.find((item: any) => item.slug === 'huobao')
  if (!project || path.resolve(project.root).toLowerCase() !== path.resolve(STORAGE_ROOT).toLowerCase()) throw new Error(`Huobao media path mapping is pending. Ruby project huobao must use ${STORAGE_ROOT} before rendering; apply the native workspace mapping during controlled maintenance.`)
  const saved = getRubyShotControls(owned.storyboardId)
  const controls = saved.model === record.model ? saved : {}
  const currentRecord = { ...record, extendFrom: record.extendFrom || controls.extend_from, extendKind: record.extendKind || controls.extend_kind, resolution: controls.resolution || record.resolution, audio_enabled: controls.audio_enabled ?? record.audio_enabled }
  const card = (await localRubyPresets(kind, true)).find((item: any) => item.id === currentRecord.model)
  if (!card) throw new Error('Select an Active local Qwen-Image 2.1 image or MiniMax H3 video preset')
  const shot = buildRubyShot(card, currentRecord, kind, { ...rubyPresetDefaults(card), ...(controls.advanced || {}) })
  const preview = await rubyRequest('/api/shots/preview', shot)
  if (!preview.values || typeof preview.values !== 'object') throw new Error('Ruby preview did not return bound preset values')
  const blocked = (preview.notes || []).filter((note: any) => note.severity === 'blocked')
  if (blocked.length) throw new Error(`Ruby preset input is not ready: ${blocked.map((note: any) => note.message).join(' ')}`)
  if ((preview.notes || []).some((note: any) => note.field === 'resolution' && /needs an upscale pass|fixed dimensions/i.test(note.message))) throw new Error('Ruby cannot deliver this requested resolution through this preset. Inspect preview notes and choose native size or an explicit supported upscale workflow.')
  const consultation = await rubyRequest('/api/library-use/sessions', { project: 'huobao', proposed_card: card.id })
  const citations = (consultation.pushed || []).map((source: any) => ({ item_id: source.item_id, request: source.request, sha256: source.sha256, use: 'Preset guidance supplied to the Huobao local generation workflow' }))
  const job = await rubyRequest('/api/jobs', {
    project: 'huobao', preset: card.id, values: preview.values, speech: record.generateAudio === false ? 'silent' : 'spoken',
    override_reason: 'Huobao owns its script and storyboard; this local adapter renders that prepared shot through the shared Ruby production queue.',
    idempotency_key: `huobao:${kind}:${record.id}`, library_use_id: consultation.library_use_id, library_citations: citations,
  })
  if (!job.ref) throw new Error('Ruby did not return a render reference')
  return { taskId: String(job.ref), notes: preview.notes, library: job.library, consultation: { library_use_id: consultation.library_use_id, findings: consultation.findings } }
}

export async function readRubyMedia(ref: string, kind: MediaKind) {
  const owned = db.select().from(schema.sysTask).where(and(eq(schema.sysTask.taskId, ref), eq(schema.sysTask.provider, 'ruby'), eq(schema.sysTask.type, kind))).get()
  if (!owned) throw new Error('Ruby job does not belong to this Huobao media task')
  const job = await rubyRequest(`/api/jobs/${encodeURIComponent(ref)}`)
  return parseRubyJob(job, kind, rubyLoopbackBase())
}
