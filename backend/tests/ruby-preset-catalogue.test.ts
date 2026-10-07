import test from 'node:test'
import assert from 'node:assert/strict'
import { readRubyPresetCatalogue } from '../src/services/ruby-preset-catalogue.js'
import { allowedRubyPreset } from '../src/services/ruby-media-policy.js'

const card = { id: 'catalogue-h3', title: 'Seed Hunter Combo', engine: 'comfyui', kind: 'video', state: 'active', version: 1, job_key: 'combo', superseded_by: '' }
const evidence = { model: { id: 'minimax_h3', known: true, reason: "detected from the graph's nodes as MiniMax H3" } }
function source(rows: any[], schema: any = evidence) {
  const routes: string[] = []
  return { routes, request: async (route: string) => {
    routes.push(route)
    if (route === '/api/presets?state=all') return { presets: rows }
    if (route === '/api/shots/capabilities') return { capabilities: { [card.id]: { continuations: [] } } }
    if (route.endsWith('/schema')) { if (schema instanceof Error) throw schema; return schema }
    throw new Error(`Unexpected route ${route}`)
  } }
}
test('default catalogue groups Active before marked Lab and hides Old', async () => {
  const fake = source([{ ...card, id: 'lab', state: 'lab' }, { ...card, id: 'old', state: 'old' }, card])
  const rows = await readRubyPresetCatalogue(fake.request)
  assert.deepEqual(rows.map(row => [row.id, row.state, row.group, row.generationEligible]), [[card.id, 'active', 'Active', true], ['lab', 'lab', 'Lab', false]])
  assert.equal(fake.routes.includes('/api/presets?state=all'), true)
  assert.equal(fake.routes.some(route => route.includes('/old/')), false)
})
test('Old is opt-in with stable IDs and explicit job/supersession metadata', async () => {
  const old = { ...card, state: 'old', superseded_by: 'replacement' }
  const fake = source([old])
  const rows = await readRubyPresetCatalogue(fake.request, { showOld: true })
  assert.equal(rows[0].id, card.id); assert.equal(rows[0].job_key, 'combo'); assert.equal(rows[0].superseded_by, 'replacement')
  assert.equal(rows[0].group, 'Old'); assert.equal(rows[0].generationEligible, false)
})
test('state refresh keeps one identity while generation is revoked on Lab and Old', async () => {
  for (const state of ['active', 'lab', 'old']) {
    const fake = source([{ ...card, state }])
    const rows = await readRubyPresetCatalogue(fake.request, { showOld: true })
    assert.equal(rows[0].id, card.id); assert.equal(rows[0].generationEligible, state === 'active')
    assert.equal(allowedRubyPreset(rows[0], 'video'), state === 'active')
  }
})
test('failed current schema remains visible and cannot reuse cached authorization', async () => {
  await readRubyPresetCatalogue(source([card]).request)
  const rows = await readRubyPresetCatalogue(source([card], new Error('Unavailable')).request)
  assert.equal(rows.length, 1); assert.equal(rows[0].runtimeSchema, undefined); assert.equal(rows[0].generationEligible, false)
})
test('unknown states are refused; unsupported families remain visible without generation', async () => {
  const fake = source([{ ...card, state: 'inactive' }, { ...card, id: 'unknown-family' }], { model: { id: 'wan3', known: true } })
  const rows = await readRubyPresetCatalogue(fake.request)
  assert.deepEqual(rows.map(row => row.id), ['unknown-family']); assert.equal(rows[0].generationEligible, false)
})
test('kind filter and source immutability retain owner metadata without rewriting rows', async () => {
  const input = [{ ...card }, { ...card, id: 'image', produces: 'image' }]
  const original = structuredClone(input)
  const rows = await readRubyPresetCatalogue(source(input).request, { kind: 'video' })
  assert.deepEqual(rows.map(row => row.id), [card.id]); assert.deepEqual(input, original)
})
