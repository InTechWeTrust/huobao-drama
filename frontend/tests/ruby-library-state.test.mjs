import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { renderToString } from '@vue/server-renderer'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../app/components/LocalMachineSettings.vue', import.meta.url), 'utf8')
const descriptor = parse(source).descriptor
let code = compileScript(descriptor, { id: 'huobao-library-state', inlineTemplate: true }).content
code = code.replace(/import \{([^}]+)\} from ['"]vue['"];?/g, (_, names) => `const {${names.replace(/\bas\b/g, ':')}} = Vue`)
code = code.replace(/import \{ api, aiConfigAPI \} from ['"]~\/composables\/useApi['"];?/, '')
code = code.replace('export default', 'return')
const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
function nodes(vnode) {
  const result = []
  if (!vnode || typeof vnode !== 'object') return result
  result.push(vnode)
  if (Array.isArray(vnode.children)) for (const child of vnode.children) result.push(...nodes(child))
  return result
}
async function mount() {
  const requests = [], mounted = []
  const cards = ['active', 'lab', 'old'].map(state => ({ id: state, title: `Preset ${state}`, kind: 'video', state, group: state[0].toUpperCase() + state.slice(1), generationEligible: state === 'active', slots: [], bindings: {} }))
  const api = { get: async route => {
    requests.push(route)
    if (route === '/settings/machine-brain') return { model: 'gpt-6.1-sol', effort: 'low', models: ['gpt-6.1-sol'], efforts: ['low'], efforts_by_model: {} }
    if (route.startsWith('/settings/ruby-media/presets/')) return { card: cards.find(card => route.endsWith('/' + card.id)), values: {} }
    if (route.startsWith('/settings/ruby-media/presets')) return { presets: route.endsWith('?show_old=1') ? cards : cards.filter(card => card.state !== 'old') }
    throw new Error(route)
  } }
  const component = new Function('Vue', 'api', 'aiConfigAPI', 'ref', 'reactive', 'computed', 'watch', 'onMounted', compiled)(Vue, api, { list: async () => [] }, Vue.ref, Vue.reactive, Vue.computed, Vue.watch, callback => mounted.push(callback))
  const render = component.setup({}, { expose() {} })
  for (const callback of mounted) await callback()
  let tree
  const html = async () => renderToString(Vue.createSSRApp({ render() { tree = render({}, []); return tree } }))
  return { html, nodes: () => nodes(tree), requests }
}
test('compiled live settings picker renders Active/Lab groups and refuses Lab defaults', async () => {
  const app = await mount(); const html = await app.html()
  assert.match(html, /optgroup label="Active"/); assert.match(html, /optgroup label="Lab"/)
  assert.doesNotMatch(html, /optgroup label="Old"/)
  assert.match(html, /<option[^>]*value="lab"[^>]*disabled[^>]*>Preset lab · Lab<\/option>/)
})
test('Show Old event refreshes the API and renders the requested Old group', async () => {
  const app = await mount(); await app.html()
  const checkbox = app.nodes().find(node => node.type === 'input' && node.props.type === 'checkbox')
  checkbox.props['onUpdate:modelValue'](true)
  await checkbox.props.onChange()
  const html = await app.html()
  assert.equal(app.requests.at(-1), '/settings/ruby-media/presets?show_old=1')
  assert.match(html, /optgroup label="Old"/); assert.match(html, /Preset old/)
})
test('Lab inspection exposes its badge and disables its real save controls', async () => {
  const app = await mount(); await app.html()
  const picker = app.nodes().find(node => node.type === 'select' && node.props['aria-label'] === 'Preset controls')
  picker.props['onUpdate:modelValue']('lab'); await picker.props.onChange()
  const html = await app.html()
  assert.match(html, /class="library-badge">Lab<\/span>/)
  assert.match(html, /<fieldset disabled>/)
  assert.match(html, /<button[^>]*disabled[^>]*>Save preset controls<\/button>/)
})
