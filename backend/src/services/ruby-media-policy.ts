export type MediaKind = 'image' | 'video'
export const RUBY_HEADERS = { 'Content-Type': 'application/json', 'X-Ruby-Origin': 'huobao-drama', 'X-Ruby-Session': 'huobao-drama' }

/** Only the two requested local model families; later families require an explicit change. */
export function allowedRubyPreset(card: any, kind?: MediaKind): boolean {
  if (card?.engine !== 'comfyui' || card?.state !== 'active' || card?.repair) return false
  if (kind && card.kind !== kind) return false
  const evidence = card.runtimeSchema
  const model = evidence?.model
  if (!model?.known) return false
  const nodes = [...(evidence.standard || []), ...(evidence.advanced || [])].flatMap((slot: any) => (slot.patch || []).map((patch: any) => patch.class_type))
  if (card.kind === 'image') return model.id === 'qwen_image_2_1' && nodes.includes('TextEncodeQwenImage21')
  return card.kind === 'video' && model.id === 'minimax_h3' && (nodes.some((name: string) => String(name).startsWith('MiniMaxH3')) || /graph.s nodes/i.test(model.reason || ''))
}

export function parseRubyJob(result: any, kind: MediaKind, rubyBase: string) {
  const status = result?.status
  if (status === 'succeeded') {
    const uri = result?.result?.storage_uri
    if (!uri || typeof uri !== 'string') throw new Error('Ruby completed without a media artifact')
    const url = `${rubyBase}/api/media?path=${encodeURIComponent(uri)}`
    return { status: 'completed' as const, ...(kind === 'image' ? { imageUrl: url } : { videoUrl: url }) }
  }
  if (status === 'failed' || status === 'cancelled') return { status: 'failed' as const, error: result.error || result.error_message || `Ruby job ${status}` }
  if (!['queued', 'running', 'pending', 'processing'].includes(status)) throw new Error(`Unknown Ruby job status: ${status}`)
  return { status: status === 'queued' ? 'pending' as const : 'processing' as const }
}

export function rubyLoopbackBase(): string {
  const value = process.env.RUBY_BASE_URL || 'http://127.0.0.1:7010'
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Ruby must use a local HTTP endpoint')
  return value.replace(/\/+$/, '')
}
