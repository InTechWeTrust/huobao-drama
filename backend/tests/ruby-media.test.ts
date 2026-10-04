import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedRubyPreset, parseRubyJob } from '../src/services/ruby-media-policy.js'
import { RubyImageAdapter, RubyVideoAdapter } from '../src/services/adapters/ruby-media.js'

test('only active local Qwen2.1 and H3 are eligible', () => {
  const card = { id: 'qwen_image_2_1_edit', engine: 'comfyui', state: 'active', kind: 'image', runtimeSchema: { model: { id: 'qwen_image_2_1', known: true }, standard: [{ patch: [{ class_type: 'TextEncodeQwenImage21' }] }] } }
  assert.equal(allowedRubyPreset(card, 'image'), true)
  assert.equal(allowedRubyPreset({ ...card, state: 'inactive' }), false)
  assert.equal(allowedRubyPreset({ ...card, engine: 'cloud' }), false)
  assert.equal(allowedRubyPreset({ ...card, runtimeSchema: { model: { id: 'qwen_image_2_0', known: true } } }), false)
  const h3 = { model: { id: 'minimax_h3', known: true, reason: "detected from the graph's nodes as MiniMax H3" } }
  assert.equal(allowedRubyPreset({ ...card, id: 'multiref_new_av_extension_v4', kind: 'video', runtimeSchema: h3 }, 'video'), true)
  assert.equal(allowedRubyPreset({ ...card, id: 'highspeedcombat_normal_v2', kind: 'video', runtimeSchema: h3 }, 'video'), true)
  assert.equal(allowedRubyPreset({ ...card, id: 'h3_name_only', kind: 'video', runtimeSchema: undefined }), false)
  assert.equal(allowedRubyPreset({ ...card, id: 'h3_false_name', kind: 'video', runtimeSchema: { model: { id: 'wan3', known: true } } }), false)
})

test('native asynchronous adapter lifecycle preserves job identity and failure', () => {
  const config = { provider: 'ruby', baseUrl: 'http://127.0.0.1:5679/api/v1/settings/ruby-media', model: 'qwen_image_2_1_edit', apiKey: '' }
  const adapter = new RubyImageAdapter()
  assert.equal(adapter.buildGenerateRequest(config, { id: 1, prompt: 'A frame' }).body.model, config.model)
  assert.deepEqual(adapter.parseGenerateResponse({ taskId: 'x12' }), { isAsync: true, taskId: 'x12' })
  assert.match(adapter.buildPollRequest(config, 'x12').url, /jobs\/x12\?kind=image$/)
  assert.equal(parseRubyJob({ status: 'queued' }, 'image', 'http://127.0.0.1:7010').status, 'pending')
  assert.equal(parseRubyJob({ status: 'failed', error: 'Missing reference' }, 'image', '').error, 'Missing reference')
  const completed = parseRubyJob({ status: 'succeeded', result: { storage_uri: 'E:\\Media\\Rubyapp\\Project\\huobao\\frame.png' } }, 'image', 'http://127.0.0.1:7010')
  assert.match(completed.imageUrl!, /^http:\/\/127.0.0.1:7010\/api\/media\?path=/)
  assert.throws(() => parseRubyJob({ status: 'succeeded', result: {} }, 'video', ''))
  assert.throws(() => new RubyVideoAdapter().buildGenerateRequest({ ...config, baseUrl: 'https://example.com' }, { id: 1 }))
})
