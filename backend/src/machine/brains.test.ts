import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completionFromDecision, validateDecision, localModelForEffort, validateLocalCompletion } from './brains.js'

test('model decisions become real tool calls, never an executed shell command', () => {
  const request = { model: 'gpt-6.1-sol', tools: [{ type: 'function', function: { name: 'save_script' } }] }
  const decision = validateDecision({ content: '', tool_calls: [{ name: 'save_script', arguments: '{"script":"hello"}' }] }, request)
  const result = completionFromDecision(decision, request.model)
  assert.equal(result.choices[0].finish_reason, 'tool_calls')
  assert.equal(result.choices[0].message.tool_calls?.[0].function.name, 'save_script')
})
test('unknown tools and malformed tool arguments fail closed', () => {
  assert.throws(() => validateDecision({content: '', tool_calls: [{name: 'shell', arguments: '{}'}]}, {tools: []}))
  assert.throws(() => validateDecision({content: '', tool_calls: [{name: 'save', arguments: 'oops'}]}, {tools: [{function: {name:'save'}}]}))
})
test('effort is selected only when the local backend advertises that alias', () => {
  assert.equal(localModelForEffort('qwen', 'high', ['qwen', 'qwen:high']), 'qwen:high')
  assert.throws(() => localModelForEffort('qwen', 'high', ['qwen']))
  assert.equal(localModelForEffort('qwen3.8-27b@ninfer-ruby','low',['qwen3.8-27b@ninfer-ruby']), 'qwen3.8-27b@ninfer-ruby')
  assert.throws(() => localModelForEffort('qwen3.8-27b@ninfer-ruby','max',['qwen3.8-27b@ninfer-ruby']))
})
test('local completion rejects unavailable or disabled tools before forwarding', () => {
  const result = {choices:[{message:{content:null,tool_calls:[{type:'function',function:{name:'shell',arguments:'{}'}}]}}]}
  assert.throws(() => validateLocalCompletion(result,{tools:[]}))
  assert.throws(() => validateLocalCompletion(result,{tools:[{function:{name:'shell'}}],tool_choice:'none'}))
  assert.equal(validateLocalCompletion(result,{tools:[{function:{name:'shell'}}]}),result)
})
