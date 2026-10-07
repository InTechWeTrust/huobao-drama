<template>
  <section class="ruby-shot">
    <strong>Live Library controls · {{ card?.title || model }}</strong>
    <button class="btn" :disabled="busy" @click="load">Refresh this preset</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="card">
      <p>Card {{ card.version }} · {{ card.runtimeSchema?.model?.id }}</p>
      <p v-if="durationSlot">{{ durationSlot.label }}: {{ durationSlot.min }}–{{ durationSlot.max }} {{ card.bindings?.duration_s?.unit || 'seconds' }}. {{ durationSlot.help }}</p>
      <p v-else>Duration is fixed or controlled by this graph. Preview shows the actual bound values.</p>
      <p>Duration applies to this shot or the preset's extension window. The assembled episode combines its clips.</p>
      <label v-if="continuations.length">Continue a source clip
        <select v-model="controls.extend_kind"><option value="">New shot</option><option v-for="choice in continuations" :key="choice.id" :value="choice.id">{{ choice.label || choice.id }}</option></select>
      </label>
      <label v-if="controls.extend_kind">Existing source video
        <input v-model="controls.extend_from" placeholder="E:/Media/.../source.mp4"><small>Uses the existing file; preview checks this preset's continuation binding.</small>
      </label>
      <label>Shot resolution
        <select v-model="controls.resolution"><option value="">Use episode resolution</option><option v-for="resolution in vocabulary.resolutions || []" :key="resolution.id" :value="resolution.id">{{ resolution.id }}{{ resolution.needs_upscale ? ' · requires a supported enhancement pass' : '' }}</option></select>
      </label>
      <label>Additional speech/audio tracks
        <select v-model="controls.audio_enabled" aria-label="Additional speech/audio tracks"><option :value="null">Use existing project policy</option><option :value="false">No additional speech/audio tracks</option><option :value="true">Enable additional speech/audio tracks</option></select>
        <small>Controls Ruby's additional tracks for this shot. Native H3 audio and the source clip's soundtrack remain governed by the preset. Preview reports any unavailable speech provider.</small>
      </label>
      <details>
        <summary>Native preset inputs and advanced controls</summary>
        <label v-for="slot in editableSlots" :key="slot.name">{{ slot.label || slot.name }}{{ slot.required ? ' *' : '' }}
          <select v-if="slot.options?.length" :value="controls.advanced[slot.name] ?? slot.default" @change="setValue(slot.name, slot.options.find((option: any) => String(option) === ($event.target as HTMLSelectElement).value))"><option v-for="option in slot.options" :key="String(option)" :value="option">{{ option }}</option></select>
          <input v-else :value="controls.advanced[slot.name] ?? slot.default ?? ''" :type="numeric(slot) ? 'number' : 'text'" :min="slot.min" :max="slot.max" :step="slot.step || 'any'" @change="setValue(slot.name, numeric(slot) ? Number(($event.target as HTMLInputElement).value) : ($event.target as HTMLInputElement).value)">
          <small>{{ slot.help || slot.why }}</small>
          <button v-if="slot.name in controls.advanced" class="btn" @click="resetValue(slot.name)">Use card default</button>
        </label>
      </details>
      <button class="btn" :disabled="busy" @click="save">Save for this shot</button>
      <button class="btn" :disabled="busy" @click="preview">Preview binding</button>
      <p v-if="notice" role="status">{{ notice }}</p>
      <template v-if="bound">
        <p v-if="bound.delivery_requires_enhancement">This selection cannot be delivered by the current generation path. Choose a native size or a preset with supported enhancement. Generation refuses a silent size downgrade.</p>
        <p v-for="(note, index) in bound.notes || []" :key="index">{{ note.field }}: {{ note.message }}</p>
        <details><summary>Actual bound graph values · {{ bound.card_version }}</summary><pre>{{ JSON.stringify(bound.values, null, 2) }}</pre></details>
      </template>
    </template>
  </section>
</template>
<script setup lang="ts">
import { api } from '~/composables/useApi'
const props = defineProps<{ model: string; storyboardId: number; duration: number; prompt: string; aspect: string; resolution: string; references: string[] }>()
const emit = defineEmits(['duration-contract', 'vocabulary'])
const card = ref<any>(null)
const vocabulary = ref<any>({})
const controls = ref<any>({ extend_from: '', extend_kind: '', resolution: '', audio_enabled: null, advanced: {} })
const bound = ref<any>(null)
const error = ref(''), notice = ref(''), busy = ref(false)
const durationSlot = computed(() => (card.value?.slots || []).find((slot: any) => slot.name === card.value?.bindings?.duration_s?.slot))
const continuations = computed(() => (card.value?.shotCapability?.continuations || []).filter((choice: any) => choice.possible))
const editableSlots = computed(() => {
  const bindings = card.value?.bindings || {}
  const automatic = new Set(['prompt', 'duration_s', 'seed', 'width', 'height'].flatMap(key => bindings[key]?.slots || (bindings[key]?.slot ? [bindings[key].slot] : [])))
  const sourceSlots = bindings.extend_from?.slots || (bindings.extend_from?.slot ? [bindings.extend_from.slot] : [])
  return (card.value?.slots || []).filter((slot: any) => !automatic.has(slot.name) && !sourceSlots.includes(slot.name) && !/filename_prefix|output_path/i.test(slot.name))
})
function numeric(slot: any) { return ['int', 'float', 'seed'].includes(slot.type) }
function setValue(name: string, value: unknown) { controls.value = { ...controls.value, advanced: { ...controls.value.advanced, [name]: value } } }
function resetValue(name: string) { controls.value = { ...controls.value, advanced: Object.fromEntries(Object.entries(controls.value.advanced).filter(([key]) => key !== name)) } }
async function action(work: () => Promise<void>) { busy.value = true; error.value = ''; notice.value = ''; try { await work() } catch (err) { error.value = (err as Error).message } finally { busy.value = false } }
let selectionRevision = 0
function load() { const revision = ++selectionRevision; return action(async () => {
  bound.value = null; card.value = null
  if (!props.model) return
  const [data, saved] = await Promise.all([api.get(`/settings/ruby-media/presets/${encodeURIComponent(props.model)}`), api.get(`/settings/ruby-media/shot-controls/${props.storyboardId}`)])
  if (revision !== selectionRevision) return
  card.value = data.card; vocabulary.value = data.vocabulary
  controls.value = saved.model === props.model ? { audio_enabled: null, ...saved, advanced: saved.advanced || {} } : { extend_from: '', extend_kind: '', resolution: '', audio_enabled: null, advanced: {} }
  emit('duration-contract', { slot: durationSlot.value, binding: card.value.bindings?.duration_s }); emit('vocabulary', data.vocabulary)
}) }
function body() { return { ...controls.value, model: props.model, duration: props.duration, prompt: props.prompt, aspectRatio: props.aspect, resolution: controls.value.resolution || props.resolution, referenceImageUrls: controls.value.extend_kind ? [] : props.references, extend_from: controls.value.extend_kind ? controls.value.extend_from : '' } }
function save() { return action(async () => { await api.put(`/settings/ruby-media/shot-controls/${props.storyboardId}`, body()); notice.value = 'Controls saved for this shot' }) }
function preview() { return action(async () => { bound.value = await api.post('/settings/ruby-media/preview', body()) }) }
watch(() => [props.model, props.storyboardId], load, { immediate: true })
</script>
<style scoped>
.ruby-shot { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
label { display: grid; gap: 5px; margin: 8px 0; } input, select { width: 100%; padding: 7px; color: var(--text-0); background: var(--bg-2); } p, small { color: var(--text-2); font-size: 12px; } pre { white-space: pre-wrap; overflow-wrap: anywhere; } [role=alert] { color: var(--error); }
</style>
