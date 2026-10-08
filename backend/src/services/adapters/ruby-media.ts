import type { AIConfig, ImageGenerationRecord, VideoGenerationRecord, ImageProviderAdapter, VideoProviderAdapter } from './types.js'

function endpoint(config: AIConfig) {
  const url = new URL(config.baseUrl)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Ruby media adapter requires this machine')
  return config.baseUrl.replace(/\/+$/, '')
}

class RubyAdapter {
  provider = 'ruby'
  constructor(private kind: 'image' | 'video') {}
  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord | VideoGenerationRecord) {
    return { url: `${endpoint(config)}/${this.kind}`, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { ...record, model: record.model || config.model } }
  }
  parseGenerateResponse(result: any) {
    if (typeof result?.taskId !== 'string' || !result.taskId) throw new Error('Ruby did not return a job reference')
    return { isAsync: true, taskId: result.taskId }
  }
  buildPollRequest(config: AIConfig, taskId: string) {
    return { url: `${endpoint(config)}/jobs/${encodeURIComponent(taskId)}?kind=${this.kind}`, method: 'GET', headers: {}, body: undefined }
  }
  parsePollResponse(result: any) { return result }
}

export class RubyImageAdapter extends RubyAdapter implements ImageProviderAdapter {
  constructor() { super('image') }
  extractImageUrl(result: any) { return result?.imageUrl || null }
  extractImageBase64() { return null }
}

export class RubyVideoAdapter extends RubyAdapter implements VideoProviderAdapter {
  constructor() { super('video') }
  extractVideoUrl(result: any) { return result?.videoUrl || null }
}
