import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { confinedPath } from '../src/utils/confined-path.js'
import { taskMediaSubdir, unassignedMediaSubdir } from '../src/utils/storage.js'

test('virtual static paths resolve under media root independent of state root', () => {
  const root = path.resolve('E:/Media/Rubyapp/Project/huobao/static')
  assert.equal(confinedPath(root, 'static/images/frame.png'), path.join(root, 'images/frame.png'))
})

test('refuses traversal, absolute paths, alternate streams and sibling prefix tricks', () => {
  for (const value of ['static/../../secret', '../static-other/file', '/etc/passwd', 'C:\\secret', 'images/x.png:secret']) {
    assert.throws(() => confinedPath('E:/Media/Rubyapp/Project/huobao/static', value))
  }
})

test('generation media subfolders are scoped by drama and native ids', () => {
  assert.equal(
    taskMediaSubdir({ dramaId: 7, episodeId: 3, storyboardId: 22 }, 'videos'),
    'huobao-drama-7/06 Scenes/Episode 03/Unassigned/Takes/shot-22',
  )
  assert.equal(taskMediaSubdir({ dramaId: 7, characterId: 12 }, 'images'), 'huobao-drama-7/KeyAsset/Character/character-12/Reference')
  assert.equal(unassignedMediaSubdir('uploads'), 'Unassigned/01 Input')
})

test('generated work and film exports have separate canonical roles', () => {
  assert.equal(taskMediaSubdir({ dramaId: 7 }, 'images'), 'huobao-drama-7/06 Scenes/Unassigned/Images')
  assert.equal(taskMediaSubdir({ dramaId: 7 }, 'audio'), 'huobao-drama-7/06 Scenes/Unassigned/Audio')
  assert.equal(taskMediaSubdir({ dramaId: 7, episodeId: 3 }, 'merged'), 'huobao-drama-7/02 Output/film/Episode 03')
  assert.equal(taskMediaSubdir({ dramaId: 7 }, 'uploads'), 'huobao-drama-7/01 Input')
})

test('provided invalid native identities refuse instead of making misleading folders', () => {
  for (const dramaId of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => taskMediaSubdir({ dramaId }, 'images'))
  }
  assert.throws(() => taskMediaSubdir({ dramaId: 7, storyboardId: 0 }, 'videos'))
  assert.equal(taskMediaSubdir({}, 'videos'), 'Unassigned/06 Scenes/Unassigned/Takes')
})
