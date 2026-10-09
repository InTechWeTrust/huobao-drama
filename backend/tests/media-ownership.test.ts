import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const scratch = path.join('E:/rubyapp/scratch/codex-130', `huobao-owner-${process.pid}`)
fs.mkdirSync(scratch, { recursive: true })
process.env.SQLITE_PATH = path.join(scratch, 'owner.sqlite')
process.env.HUOBAO_DATA_DIR = scratch
process.env.STORAGE_PATH = path.join(scratch, 'Project')
const { db, schema } = await import('../src/db/index.js')
const { resolveMediaScope } = await import('../src/utils/media-owner.js')
const at = '2026-10-09T00:00:00Z'
const first = db.insert(schema.dramas).values({ title: 'First', createdAt: at, updatedAt: at }).returning().get()
const other = db.insert(schema.dramas).values({ title: 'Other', createdAt: at, updatedAt: at }).returning().get()
const episode = db.insert(schema.episodes).values({ dramaId: first.id, episodeNumber: 1, title: 'Episode', createdAt: at, updatedAt: at }).returning().get()
const shot = db.insert(schema.storyboards).values({ episodeId: episode.id, storyboardNumber: 1, createdAt: at, updatedAt: at }).returning().get()
const character = db.insert(schema.characters).values({ dramaId: first.id, name: 'Actor', createdAt: at, updatedAt: at }).returning().get()
const prop = db.insert(schema.props).values({ dramaId: first.id, name: 'Key', createdAt: at, updatedAt: at }).returning().get()

test('two native assets in the same drama refuse before provider admission', () => {
  assert.throws(() => resolveMediaScope({ character_id: character.id, prop_id: prop.id }), /one asset owner/)
  assert.throws(() => resolveMediaScope({ storyboard_id: shot.id, character_id: character.id }), /one.*owner/)
  assert.deepEqual(resolveMediaScope({ prop_id: prop.id }), { dramaId: first.id, propId: prop.id })
})

test('native storyboard resolves project and episode without a manual drama field', () => {
  assert.deepEqual(resolveMediaScope({ storyboard_id: shot.id }), { dramaId: first.id, episodeId: episode.id, storyboardId: shot.id })
})

test('completion scope resolves an existing shot episode and retains episode-only task params', async () => {
  const { resolveTaskMediaScope } = await import('../src/utils/media-owner.js')
  assert.deepEqual(resolveTaskMediaScope({ dramaId: first.id, storyboardId: shot.id, params: '{}' }),
    { dramaId: first.id, episodeId: episode.id, storyboardId: shot.id })
  assert.deepEqual(resolveTaskMediaScope({ dramaId: first.id, params: JSON.stringify({ episodeId: episode.id }) }),
    { dramaId: first.id, episodeId: episode.id })
  assert.throws(() => resolveTaskMediaScope({ dramaId: other.id, params: JSON.stringify({ episodeId: episode.id }) }), /different drama/)
})
test('native asset upload derives its registered project', () => {
  assert.deepEqual(resolveMediaScope({ character_id: String(character.id) }), { dramaId: first.id, characterId: character.id })
})
test('wrong project, missing owner and non-integral identities refuse', () => {
  assert.throws(() => resolveMediaScope({ drama_id: other.id, storyboard_id: shot.id }))
  assert.throws(() => resolveMediaScope({ character_id: 999999 }))
  assert.throws(() => resolveMediaScope({ drama_id: 1.5 }))
  assert.throws(() => resolveMediaScope({ drama_id: '../outside' }))
})
test('unbound imports use automatic Unassigned without inventing a project', () => {
  assert.deepEqual(resolveMediaScope({}), {})
})

test('native multipart upload writes a reference beside its registered character', async () => {
  const { default: upload } = await import('../src/routes/upload.js')
  const { default: sharp } = await import('sharp')
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer()
  const data = new FormData()
  data.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'reference.png')
  data.append('character_id', String(character.id))
  const response = await upload.request('/image', { method: 'POST', body: data })
  assert.equal(response.status, 200)
  const result = await response.json() as any
  assert.match(result.data.path, new RegExp(`^static/huobao-drama-${first.id}/KeyAsset/Character/character-${character.id}/Reference/`))
  const file = path.join(process.env.STORAGE_PATH!, result.data.path.slice(7))
  assert.ok(fs.statSync(file).isFile())
})

test('wrong-drama multipart upload refuses before creating that project', async () => {
  const { default: upload } = await import('../src/routes/upload.js')
  const data = new FormData()
  data.append('file', new Blob(['test'], { type: 'image/png' }), 'reference.png')
  data.append('drama_id', String(other.id))
  data.append('character_id', String(character.id))
  const response = await upload.request('/image', { method: 'POST', body: data })
  assert.equal(response.status, 400)
  assert.equal(fs.existsSync(path.join(process.env.STORAGE_PATH!, `huobao-drama-${other.id}`)), false)
})

test('Ruby file URI is adopted in place only by the owning drama', async () => {
  const { pathToFileURL } = await import('node:url')
  const { downloadFile } = await import('../src/utils/storage.js')
  const folder = `huobao-drama-${first.id}/06 Scenes/Unassigned/Images`
  const file = path.join(process.env.STORAGE_PATH!, folder, 'native.png')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'native artifact')
  const url = `http://127.0.0.1:7010/api/media?path=${encodeURIComponent(pathToFileURL(file).href)}`
  assert.equal(await downloadFile(url, folder), `static/${folder}/native.png`)
  await assert.rejects(downloadFile(url, `huobao-drama-${other.id}/06 Scenes/Unassigned/Images`), /different drama/)
})

test('unbound Ruby requests refuse before creating a processing task', async () => {
  const { default: tasks } = await import('../src/routes/tasks.js')
  const original = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = async () => { providerCalls++; throw new Error('Unexpected provider admission') }
  try {
  for (const type of ['image', 'video'] as const) {
    const config = db.insert(schema.aiServiceConfigs).values({
      serviceType: type, provider: 'ruby', name: 'Local Ruby', model: JSON.stringify(['owned-fixture']),
      baseUrl: 'http://127.0.0.1:7010', apiKey: '',
      isActive: true, createdAt: at, updatedAt: at,
    }).returning().get()
    const before = db.select().from(schema.sysTask).all().length
    const response = await tasks.request('/', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, prompt: 'Fixture', model: 'owned-fixture', config_id: config.id }),
    })
    const result = await response.json()
    assert.equal(response.status, 400, JSON.stringify(result))
    assert.match(JSON.stringify(result), /native Huobao drama/i)
    assert.equal(db.select().from(schema.sysTask).all().length, before)
  }
  assert.equal(providerCalls, 0)
  } finally { globalThis.fetch = original }
})

test('episode-only generation keeps the validated episode in the existing task params', async () => {
  const { default: tasks } = await import('../src/routes/tasks.js')
  const { resolveTaskMediaScope } = await import('../src/utils/media-owner.js')
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json({ error: { message: 'Fixture does not render' } }, { status: 400 })
  try {
    for (const type of ['image', 'video'] as const) {
      const config = db.insert(schema.aiServiceConfigs).values({ serviceType: type,
        provider: 'ruby', name: 'Fixture only',
        model: JSON.stringify(['owned-fixture']), baseUrl: 'http://127.0.0.1:7010', apiKey: '',
        isActive: true, createdAt: at, updatedAt: at }).returning().get()
      const response = await tasks.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, prompt: 'Fixture', episode_id: episode.id, config_id: config.id }) })
      assert.equal(response.status, 201)
      const record = (await response.json() as any).data
      assert.equal(JSON.parse(record.params).episodeId, episode.id)
      assert.deepEqual(resolveTaskMediaScope(record), { dramaId: first.id, episodeId: episode.id })
      // Consume the isolated provider failure before restoring fetch; no real request is sent.
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setImmediate(resolve))
        const saved = db.select().from(schema.sysTask).all().find(item => item.id === record.id)
        if (saved?.status === 'failed') break
      }
      assert.equal(db.select().from(schema.sysTask).all().find(item => item.id === record.id)?.status, 'failed')
    }
  } finally { globalThis.fetch = original }
})
