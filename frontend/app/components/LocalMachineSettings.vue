<template>
  <div class="machine-settings">
    <h2>Local production settings</h2>
    <p>Uses this computer's Ruby Library, Qwen-Image 2.1 and MiniMax H3 through ComfyUI.</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section>
      <h3>Main brain</h3>
      <label>Model
        <select v-model="brain.model" aria-label="Main brain model">
          <option v-for="model in models" :key="model" :value="model">{{ modelLabels[model] || model }}</option>
        </select>
      </label>
      <label>Effort
        <select v-model="brain.effort" aria-label="Reasoning effort">
          <option v-for="effort in availableEfforts" :key="effort" :value="effort">{{ effort }}</option>
        </select>
      </label>
      <button class="btn" :disabled="busy" @click="saveBrain">Save brain</button>
      <p>Opus and Sol use your signed-in Claude Code / Codex subscription. Local uses the existing machine backend.</p>
    </section>
    <section>
      <h3>Local generation</h3>
      <label><input v-model="showOld" type="checkbox" :disabled="busy" @change="refreshPresets"> Show Old</label>
      <button class="btn" :disabled="busy" @click="refreshPresets">Refresh Library presets</button>
      <label>Qwen-Image 2.1 preset
        <select v-model="defaults.image" aria-label="Image preset">
          <option value="">Select a local preset</option>
          <optgroup v-for="group in presetGroups" :key="group.label" :label="group.label">
            <option v-for="card in group.cards.filter((p: any) => p.kind === 'image')" :key="card.id" :value="card.id" :disabled="!card.generationEligible">{{ card.title }}{{ card.state === 'lab' ? ' · Lab' : '' }}</option>
          </optgroup>
        </select>
      </label>
      <label>MiniMax H3 preset
        <select v-model="defaults.video" aria-label="Video preset">
          <option value="">Select a local preset</option>
          <optgroup v-for="group in presetGroups" :key="group.label" :label="group.label">
            <option v-for="card in group.cards.filter((p: any) => p.kind === 'video')" :key="card.id" :value="card.id" :disabled="!card.generationEligible">{{ card.title }}{{ card.state === 'lab' ? ' · Lab' : '' }}</option>
          </optgroup>
        </select>
      </label>
      <button class="btn" :disabled="busy || !defaultsReady" @click="saveDefaults">Save generation presets</button>
      <p>These are defaults. The project model pickers list all currently Active H3/Qwen presets; each shot has its own live controls. Qwen's edit preset needs a reference picture.</p>
      <label>Preset controls
        <select v-model="editPreset" @change="loadPreset" aria-label="Preset controls">
          <option value="">Choose a preset to inspect</option>
          <optgroup v-for="group in presetGroups" :key="group.label" :label="group.label">
            <option v-for="card in group.cards" :key="card.id" :value="card.id">{{ card.title }}{{ card.state === 'lab' ? ' · Lab' : '' }}</option>
          </optgroup>
        </select>
      </label>
      <div v-if="selectedCard">
        <p>{{ selectedCard.description }}</p>
        <p>{{ selectedCard.group }}<span v-if="selectedCard.state === 'lab'" class="library-badge">Lab</span></p>
        <p v-if="!selectedCard.generationEligible">Library entry is available for inspection. Generation requires an Active preset with verified local model support.</p>
        <fieldset :disabled="!selectedCard.generationEligible || busy">
        <label v-for="slot in editableSlots" :key="slot.name">
          {{ slot.label || slot.name }}{{ slot.required ? ' *' : '' }}
          <select v-if="slot.options?.length" v-model="slotValues[slot.name]">
            <option v-for="option in slot.options" :key="String(option)" :value="option">{{ option }}</option>
          </select>
          <input v-else-if="['int', 'float', 'seed'].includes(slot.type)" v-model.number="slotValues[slot.name]" type="number" :min="slot.min" :max="slot.max" :step="slot.step || 'any'" :placeholder="String(slot.default ?? '')">
          <input v-else v-model="slotValues[slot.name]" :placeholder="slot.type.endsWith('_asset') ? 'Local Ruby KeyAsset path' : ''">
          <small>{{ slot.help || slot.why }}</small>
        </label>
        <button class="btn" :disabled="busy || !selectedCard.generationEligible" @click="savePreset">Save preset controls</button>
        </fieldset>
      </div>
    </section>
    <section>
      <h3>Shared Ruby Library</h3>
      <button class="btn" :disabled="busy" @click="loadLibrary">Read Active Library</button>
      <label>Library source request
        <input v-model="sourceRequest" placeholder="index:kind=prompt (doc, prompt, skill), toc:doc-id, doc-id#section, prompt:id, skill:id, cases:category/slug">
      </label>
      <button class="btn" :disabled="busy || !sourceRequest.trim()" @click="readLibrary">Read source with receipt</button>
      <p v-if="libraryUseId">Library receipt: {{ libraryUseId }}</p>
      <pre v-if="libraryText">{{ libraryText }}</pre>
    </section>
    <section>
      <h3>Shared Key Assets</h3>
      <button class="btn" :disabled="busy" @click="loadAssets">Browse Ruby KeyAsset</button>
      <pre v-if="assetsText">{{ assetsText }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { api, aiConfigAPI } from '~/composables/useApi'
const brain = reactive({ model: 'gpt-6.1-sol', effort: 'low' })
const models = ref<string[]>([])
const modelLabels: Record<string, string> = { 'gpt-6.1-sol': 'Sol 6.1 (Codex subscription)', 'claude-opus-5-5': 'Opus 5.5 (Claude subscription)', 'local:qwen3.8-27b@ninfer-ruby': 'Local Qwen 3.8 27B' }
const efforts = ref<string[]>([])
const effortsByModel = ref<Record<string, string[]>>({})
const availableEfforts = computed(() => effortsByModel.value[brain.model] || efforts.value)
watch(() => brain.model, () => { if (!availableEfforts.value.includes(brain.effort)) brain.effort = 'low' })
const presets = ref<any[]>([])
const showOld = ref(false)
const presetGroups = computed(() => ['Active', 'Lab', ...(showOld.value ? ['Old'] : [])].map(label => ({ label, cards: presets.value.filter(card => card.group === label) })))
const defaultsReady = computed(() => ['image', 'video'].every(kind => presets.value.some(card => card.id === defaults[kind as 'image' | 'video'] && card.kind === kind && card.generationEligible)))
const defaults = reactive({ image: '', video: '' })
const editPreset = ref('')
const selectedCard = ref<any>(null)
const slotValues = ref<Record<string, any>>({})
const error = ref('')
const notice = ref('')
const busy = ref(false)
const sourceRequest = ref('index:kind=prompt')
const libraryText = ref('')
const libraryUseId = ref('')
const assetsText = ref('')
const editableSlots = computed(() => {
  const bindings = selectedCard.value?.bindings || {}
  const automatic = new Set(['prompt', 'duration_s', 'seed', 'width', 'height'].flatMap(key => bindings[key]?.slots || (bindings[key]?.slot ? [bindings[key].slot] : [])))
  return (selectedCard.value?.slots || []).filter((slot: any) => !automatic.has(slot.name) && !/filename_prefix|output_path/i.test(slot.name))
})

async function action(work: () => Promise<void>) {
  busy.value = true; error.value = ''; notice.value = ''
  try { await work() } catch (err) { error.value = (err as Error).message } finally { busy.value = false }
}
function saveBrain() { return action(async () => { await api.put('/settings/machine-brain', brain); notice.value = 'Brain saved' }) }
function refreshPresets() { return action(async () => {
  presets.value = (await api.get(`/settings/ruby-media/presets${showOld.value ? '?show_old=1' : ''}`)).presets
  selectedCard.value = null; editPreset.value = ''
}) }
function saveDefaults() { return action(async () => { await api.put('/settings/ruby-media/defaults', defaults); notice.value = 'Local generation presets saved' }) }
function loadPreset() { return action(async () => {
  if (!editPreset.value) { selectedCard.value = null; return }
  const data = await api.get(`/settings/ruby-media/presets/${encodeURIComponent(editPreset.value)}`)
  selectedCard.value = data.card
  slotValues.value = Object.fromEntries(editableSlots.value.filter((slot: any) => slot.name in data.values).map((slot: any) => [slot.name, data.values[slot.name]]))
}) }
function savePreset() { return action(async () => { await api.put(`/settings/ruby-media/presets/${encodeURIComponent(editPreset.value)}`, { values: slotValues.value }); notice.value = 'Preset controls saved' }) }
function loadLibrary() { return action(async () => {
  const data = await api.get('/machine/library')
  libraryText.value = JSON.stringify(data, null, 2)
}) }
function readLibrary() { return action(async () => {
  if (!libraryUseId.value) {
    const opened = await api.post('/machine/library-use/sessions', { project: 'huobao', proposed_card: defaults.video || defaults.image || undefined })
    libraryUseId.value = opened.library_use_id
  }
  const data = await api.post(`/machine/library-use/${encodeURIComponent(libraryUseId.value)}/read`, { requests: [sourceRequest.value.trim()], project: 'huobao' })
  libraryText.value = JSON.stringify(data, null, 2)
}) }
function loadAssets() { return action(async () => { assetsText.value = JSON.stringify(await api.get('/settings/ruby-media/key-assets'), null, 2) }) }
onMounted(() => action(async () => {
  const loaded = await api.get('/settings/machine-brain')
  Object.assign(brain, { model: loaded.model, effort: loaded.effort }); models.value = loaded.models; efforts.value = loaded.efforts; effortsByModel.value = loaded.efforts_by_model
  const configs = await aiConfigAPI.list()
  for (const kind of ['image', 'video'] as const) defaults[kind] = configs.find((row: any) => row.service_type === kind && row.is_active && row.provider === 'ruby')?.model?.[0] || ''
  presets.value = (await api.get('/settings/ruby-media/presets')).presets
}))
</script>

<style scoped>
.machine-settings { display: grid; gap: 20px; max-width: 1080px; margin: auto; }
section { padding: 20px; background: var(--bg-1); border: 1px solid var(--border); border-radius: 12px; display: grid; gap: 12px; }
label { display: grid; gap: 5px; color: var(--text-1); }
input, select { padding: 8px; background: var(--bg-2); color: var(--text-0); border: 1px solid var(--border); border-radius: 6px; }
fieldset { border: 0; padding: 0; min-width: 0; } .library-badge { margin-left: 8px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 420px; overflow: auto; font-size: 12px; }
small, p { color: var(--text-2); }.error { color: var(--error); }
</style>
