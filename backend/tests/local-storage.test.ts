import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { confinedPath } from '../src/utils/confined-path.js'

test('virtual static paths resolve under media root independent of state root', () => {
  const root = path.resolve('E:/Media/Rubyapp/Project/huobao/static')
  assert.equal(confinedPath(root, 'static/images/frame.png'), path.join(root, 'images/frame.png'))
})

test('refuses traversal, absolute paths, alternate streams and sibling prefix tricks', () => {
  for (const value of ['static/../../secret', '../static-other/file', '/etc/passwd', 'C:\\secret', 'images/x.png:secret']) {
    assert.throws(() => confinedPath('E:/Media/Rubyapp/Project/huobao/static', value))
  }
})
