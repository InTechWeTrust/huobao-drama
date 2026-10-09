import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Hono } from 'hono'

const scratch = path.resolve(`E:/rubyapp/scratch/codex-130/huobao-alias-${process.pid}`)
const root = path.join(scratch, 'Project')
const aliases = path.join(scratch, 'moved-roots.json')
fs.mkdirSync(root, { recursive: true })
process.env.STORAGE_PATH = root
process.env.HUOBAO_DATA_DIR = scratch
process.env.HUOBAO_TEMP_DIR = path.join(scratch, 'Temp')
process.env.RUBYAPP_MOVED_ROOTS = aliases
const { sharedMediaReference } = await import('../src/utils/shared-media-reference.js')
const { getAbsolutePath, downloadFile } = await import('../src/utils/storage.js')

function move(old: string, target: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, 'retained media')
  fs.writeFileSync(aliases, JSON.stringify({ schema: 1, moves: [{ from: old, to: target }] }))
}

test('absolute and file URI readers follow the existing exact alias without changing stored text', () => {
  const old = path.join(root, 'huobao-drama-1', '02 Output', 'take.mp4')
  const target = path.join(root, 'huobao-drama-1', '06 Scenes', 'Unassigned', 'Takes', 'take.mp4')
  move(old, target)
  for (const value of [old, pathToFileURL(old).href, old.toUpperCase().replace(/\\/g, '/')]) {
    assert.equal(sharedMediaReference(value, [root]), fs.realpathSync(target))
  }
  assert.equal(getAbsolutePath('static/huobao-drama-1/02 Output/take.mp4'), target)
  assert.equal(fs.existsSync(old), false)
})

test('a recreated original disables alias and an unapproved target stays refused', () => {
  const old = path.join(root, 'restored', 'frame.png')
  const target = path.join(root, 'new', 'frame.png')
  move(old, target)
  fs.mkdirSync(path.dirname(old), { recursive: true }); fs.writeFileSync(old, 'original')
  assert.equal(sharedMediaReference(old, [root]), fs.realpathSync(old))
  const missing = path.join(root, 'missing', 'foreign.png')
  const foreign = path.join(scratch, 'outside', 'foreign.png')
  move(missing, foreign)
  assert.throws(() => sharedMediaReference(missing, [root]), /approved shared media roots/)
})

test('longest prefix wins, current alias file is reread, and cycles refuse', async () => {
  const { localizeMediaPath } = await import('../src/utils/moved-media.js')
  const old = path.join(root, 'historical')
  const exact = path.join(old, 'take.mp4')
  const target = path.join(root, 'exact', 'take.mp4')
  fs.writeFileSync(aliases, JSON.stringify({ schema: 1, moves: [
    { from: old, to: path.join(root, 'general') }, { from: exact, to: target },
  ] }))
  assert.equal(localizeMediaPath(exact), target)
  const next = path.join(root, 'next', 'take.mp4')
  fs.writeFileSync(aliases, JSON.stringify({ schema: 1, moves: [{ from: exact, to: next }] }))
  assert.equal(localizeMediaPath(exact), next)
  fs.writeFileSync(aliases, JSON.stringify({ schema: 1, moves: [{ from: exact, to: next }, { from: next, to: exact }] }))
  assert.throws(() => localizeMediaPath(exact), /chain/)
  fs.writeFileSync(aliases, JSON.stringify({ schema: 99, moves: [] }))
  assert.throws(() => localizeMediaPath(exact), /alias/)
})

test('old static URL preserves native range and HEAD playback after an exact move', async () => {
  const old = path.join(root, 'huobao-drama-5', '02 Output', 'clip.mp4')
  const target = path.join(root, 'huobao-drama-5', '06 Scenes', 'Unassigned', 'Takes', 'clip.mp4')
  move(old, target)
  const { staticMedia } = await import('../src/utils/static-media.js')
  const app = new Hono()
  app.use('/static/*', staticMedia)
  const url = '/static/huobao-drama-5/02%20Output/clip.mp4'
  const full = await app.request(url)
  assert.equal(full.status, 200)
  assert.equal(await full.text(), 'retained media')
  const range = await app.request(url, { headers: { Range: 'bytes=0-3' } })
  assert.equal(range.status, 206)
  assert.equal(await range.text(), 'reta')
  const head = await app.request(url, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal((await app.request('/static/x.png%3Asecret')).status, 404)
})

test('in-place Ruby adoption still checks drama after alias localization', async () => {
  const old = path.join(root, 'huobao-drama-6', '02 Output', 'clip.mp4')
  const target = path.join(root, 'huobao-drama-6', '06 Scenes', 'Unassigned', 'Takes', 'clip.mp4')
  move(old, target)
  const url = `http://127.0.0.1:7010/api/media?path=${encodeURIComponent(pathToFileURL(old).href)}`
  await assert.rejects(downloadFile(url, 'huobao-drama-7/06 Scenes/Unassigned/Takes'), /different drama/)
  assert.equal(await downloadFile(url, 'huobao-drama-6/06 Scenes/Unassigned/Takes'), 'static/huobao-drama-6/06 Scenes/Unassigned/Takes/clip.mp4')
})
