/**
 * ComfyBridge (D:\Other-projects\comfy-bridge) — local ComfyUI without Ruby.
 * Image: Qwen-Image 2.1 / GPT Image (Codex subscription) / workflow:<name>;
 * video: MiniMax H3 through Seed Hunter Combo. Results land in E:\Media\Huobao\Project\comfy\
 * and are adopted in place by downloadFile (no second copy).
 */
import path from 'node:path'
import { getAbsolutePath } from '../../utils/storage.js'
import { sharedMediaReference } from '../../utils/shared-media-reference.js'
import type { AIConfig, ImageGenerationRecord, VideoGenerationRecord, ImageProviderAdapter, VideoProviderAdapter } from './types.js'

const IMAGE_SIZES: Record<string, string> = { '16:9': '1344x768', '9:16': '768x1344', '1:1': '1024x1024', '4:3': '1184x896', '3:4': '896x1184' }

function endpoint(config: AIConfig) {
  const url = new URL(config.baseUrl)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('ComfyBridge must run on this machine')
  return config.baseUrl.replace(/\/+$/, '')
}

/** static/... project files are passed as absolute paths so the bridge hardlinks instead of copying. */
function media(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('static/') || raw.startsWith('/static/')) return getAbsolutePath(raw.replace(/^\//, ''))
  if (path.isAbsolute(raw)) return sharedMediaReference(raw)  // only the approved E:\Media roots
  if (/^(https?|data):/i.test(raw)) return raw
  return null
}

function list(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const items = JSON.parse(raw)
    return (Array.isArray(items) ? items : []).map(item => media(typeof item === 'string' ? item : item?.url)).filter((x): x is string => !!x)
  } catch { return [] }
}

export class ComfyBridgeImageAdapter implements ImageProviderAdapter {
  provider = 'comfybridge'
  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord) {
    const size = /^\d+x\d+$/i.test(record.size || '') ? record.size!.toLowerCase() : IMAGE_SIZES[record.size || ''] || '1344x768'
    return {
      url: `${endpoint(config)}/v1/images/generations`, method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: { model: record.model || config.model, prompt: record.prompt || '', size, n: 1, images: list(record.referenceImages).slice(0, 4) },
    }
  }
  parseGenerateResponse(result: any) {
    const url = result?.data?.[0]?.url
    if (!url) throw new Error(result?.error?.message || 'ComfyBridge returned no image')
    return { isAsync: false, imageUrl: url }
  }
  buildPollRequest(config: AIConfig, taskId: string) {
    return { url: `${endpoint(config)}/v1/models`, method: 'GET', headers: {}, body: undefined }
  }
  parsePollResponse() { return { status: 'failed' as const, error: 'ComfyBridge images are synchronous' } }
  extractImageUrl(result: any) { return result?.data?.[0]?.url || null }
  extractImageBase64() { return null }
}

export class ComfyBridgeVideoAdapter implements VideoProviderAdapter {
  provider = 'comfybridge'
  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord) {
    const first = media(record.firstFrameUrl) || media(record.imageUrl)
    const last = media(record.lastFrameUrl)
    return {
      url: `${endpoint(config)}/v1/videos`, method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: {
        model: record.model || config.model,
        engine: 'combo',
        prompt: record.prompt || '',
        seconds: record.duration || 5,
        resolution: String(record.resolution || '480P').toUpperCase().startsWith('720') ? '720P' : '480P',
        ...(record.seed != null ? { seed: record.seed } : {}),
        ...(first ? { first_frame: first } : {}),
        ...(last ? { last_frame: last } : {}),
        reference_images: list(record.referenceImageUrls).slice(0, 6),
        reference_videos: list(record.referenceVideoUrls).slice(0, 3),
        reference_audios: list(record.referenceAudioUrls).slice(0, 3),
        ...(record.generateAudio === false || record.generateAudio === 0 ? { combo: { audio: { speech: 'off', sfx: false, music: false } } } : {}),
      },
    }
  }
  parseGenerateResponse(result: any) {
    if (typeof result?.id !== 'string') throw new Error(result?.error?.message || 'ComfyBridge did not return a job id')
    return { isAsync: true, taskId: result.id }
  }
  buildPollRequest(config: AIConfig, taskId: string) {
    return { url: `${endpoint(config)}/v1/videos/${encodeURIComponent(taskId)}`, method: 'GET', headers: {}, body: undefined }
  }
  parsePollResponse(result: any) {
    if (result?.status === 'completed' && result.url) return { status: 'completed' as const, videoUrl: result.url }
    if (result?.status === 'failed') return { status: 'failed' as const, error: result?.error?.message || 'MiniMax H3 failed' }
    return { status: 'processing' as const }
  }
  extractVideoUrl(result: any) { return result?.url || null }
}
