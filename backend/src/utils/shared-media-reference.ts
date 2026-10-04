import fs from 'node:fs'
import path from 'node:path'

export const SHARED_MEDIA_ROOTS = [
  'E:/Media/Huobao/Project', 'E:/Media/Huobao/KeyAsset', 'E:/Media/Huobao/Temp',
  'E:/Media/VLO/Project', 'E:/Media/VLO/KeyAsset', 'E:/Media/VLO/Temp',
  'E:/Media/Rubyapp/Project', 'E:/Media/Rubyapp/KeyAsset', 'E:/Media/Rubyapp/Handoff', 'E:/Media/Rubyapp/Temp',
  'E:/Media/ComfyUI/Input', 'E:/Media/ComfyUI/Project', 'E:/Media/ComfyUI/Temp',
]

/** Existing files only; realpath confinement also defeats junctions and alternate streams. */
export function sharedMediaReference(raw: string, roots = SHARED_MEDIA_ROOTS): string {
  let value = raw
  if (/^https?:/i.test(value)) {
    const url = new URL(value)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '7010' || url.pathname !== '/api/media' || url.username || url.password) throw new Error('Use a local Ruby media reference')
    value = url.searchParams.get('path') || ''
  }
  if (!path.isAbsolute(value) || value.includes('\0') || value.slice(2).includes(':')) throw new Error('Reference must be a shared media file')
  const target = fs.realpathSync(value)
  const allowed = roots.some(root => {
    if (!fs.existsSync(root)) return false
    const relative = path.relative(fs.realpathSync(root), target)
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  })
  if (!allowed || !fs.statSync(target).isFile()) throw new Error('Reference is outside the approved shared media roots')
  return target
}
