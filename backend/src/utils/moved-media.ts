import fs from 'node:fs'
import path from 'node:path'

type Move = { from: string, to: string }
let loaded: { file: string, stamp: number, bytes: number, moves: Move[] } | undefined
const key = (value: string) => value.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

/** Read the existing Ruby alias owner. Huobao never publishes a second mapping. */
function moves(): Move[] {
  const file = process.env.RUBYAPP_MOVED_ROOTS || 'D:/Other-projects/rubyapp-videogenerator/server/moved-roots.json'
  if (!fs.existsSync(file)) return []
  const info = fs.statSync(file)
  if (loaded?.file === file && loaded.stamp === info.mtimeMs && loaded.bytes === info.size) return loaded.moves
  if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new Error('Media alias owner is invalid')
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (value.schema !== 1 || !Array.isArray(value.moves) || value.moves.some((move: Move) =>
    !move || typeof move.from !== 'string' || typeof move.to !== 'string' ||
    !path.isAbsolute(move.from) || !path.isAbsolute(move.to) || key(move.from) === key(move.to))) {
    throw new Error('Media alias owner is invalid')
  }
  const result: Move[] = [...value.moves].sort((a, b) => key(b.from).length - key(a.from).length)
  loaded = { file, stamp: info.mtimeMs, bytes: info.size, moves: result }
  return result
}

/** Localize only at I/O. Existing originals always disable their alias. */
export function localizeMediaPath(value: string): string {
  let current = value
  const aliases = moves()
  for (let depth = 0; depth < 8; depth++) {
    const normalized = key(current)
    const move = aliases.find(item =>
      (normalized === key(item.from) || normalized.startsWith(key(item.from) + '\\')) && !fs.existsSync(item.from))
    if (!move) return current
    const remainder = current.replace(/\//g, '\\').slice(move.from.replace(/[\\/]+$/, '').length)
    current = move.to.replace(/[\\/]+$/, '') + remainder
  }
  throw new Error('Media alias chain does not end')
}
