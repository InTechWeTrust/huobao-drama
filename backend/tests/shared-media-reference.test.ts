import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sharedMediaReference } from '../src/utils/shared-media-reference.js'

test('rejects OS files and local Ruby URIs pointing outside shared media', () => {
  assert.throws(() => sharedMediaReference('C:/Windows/win.ini'), /outside|ENOENT/)
  assert.throws(() => sharedMediaReference('http://127.0.0.1:7010/api/media?path=C%3A%2FWindows%2Fwin.ini'), /outside|ENOENT/)
  assert.throws(() => sharedMediaReference('C:/Windows/win.ini:secret'), /shared media/)
  assert.throws(() => sharedMediaReference('https://example.com/file.png'), /local Ruby/)
})

test('accepts an existing approved media file without copying it', () => {
  const root = 'E:/Media/Huobao/Temp/tests/references'
  fs.mkdirSync(root, { recursive: true })
  const fixture = path.join(root, `reference-${process.pid}.txt`)
  fs.writeFileSync(fixture, 'test reference')
  try {
    assert.equal(sharedMediaReference(fixture), fs.realpathSync(fixture))
    assert.equal(sharedMediaReference(`http://127.0.0.1:7010/api/media?path=${encodeURIComponent(fixture)}`), fs.realpathSync(fixture))
  } finally { fs.rmSync(fixture) }
})
