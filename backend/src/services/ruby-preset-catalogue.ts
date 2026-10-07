import { allowedRubyPreset, type MediaKind } from './ruby-media-policy.js'

export const PRESET_GROUPS = ['Active', 'Lab', 'Old'] as const
export type RubyPresetState = 'active' | 'lab' | 'old'
export type RubyRequest = (route: string) => Promise<any>
const states: RubyPresetState[] = ['active', 'lab', 'old']
const schemaCache = new Map<string, { expires: number; value: any }>()

/** Browsing never grants permission to submit a preset. No local copy is rewritten. */
export async function readRubyPresetCatalogue(request: RubyRequest, options: { kind?: MediaKind; showOld?: boolean; fresh?: boolean } = {}) {
  const [data, capabilities] = await Promise.all([request('/api/presets?state=all'), request('/api/shots/capabilities')])
  if (!Array.isArray(data.presets)) throw new Error('Ruby returned an invalid preset catalogue')
  const candidates = data.presets.filter((card: any) => states.includes(card.state)
    && (options.showOld || card.state !== 'old') && card.engine === 'comfyui' && !card.repair
    && ['image', 'video'].includes(card.produces || card.kind)
    && (!options.kind || (card.produces || card.kind) === options.kind))
  const enriched = await Promise.all(candidates.map(async (card: any) => {
    const key = `${card.id}:${card.version || ''}`
    let cached = schemaCache.get(key)
    let verified = false
    try {
      if (options.fresh !== false || !cached || cached.expires <= Date.now()) {
        cached = { value: await request(`/api/presets/${encodeURIComponent(card.id)}/schema`), expires: Date.now() + 30_000 }
        schemaCache.set(key, cached)
      }
      verified = true
    } catch { /* Keep the visible Library entry, but refuse generation without live evidence. */ }
    const result = { ...card, kind: card.produces || card.kind,
      group: PRESET_GROUPS[states.indexOf(card.state)], runtimeSchema: verified ? cached?.value : undefined,
      shotCapability: capabilities.capabilities?.[card.id] }
    return { ...result, generationEligible: allowedRubyPreset(result, options.kind) }
  }))
  return enriched.sort((left: any, right: any) => states.indexOf(left.state) - states.indexOf(right.state))
}
