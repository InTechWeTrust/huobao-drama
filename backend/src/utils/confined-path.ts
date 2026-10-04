import fs from 'node:fs'
import path from 'node:path'

/** Resolve a virtual static URL without letting database/upload paths escape. */
export function confinedPath(root: string, value: string): string {
  const clean = value.replace(/\\/g, '/')
  if (path.isAbsolute(clean) || /^[A-Za-z]:/.test(clean) || clean.includes(':') || clean.includes('\0')) {
    throw new Error('Media path must be relative to the configured storage root')
  }
  const relative = clean.startsWith('static/') ? clean.slice(7) : clean
  const base = path.resolve(root)
  const target = path.resolve(base, relative)
  const inside = (file: string, parent: string) => {
    const rel = path.relative(parent, file)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  }
  if (!inside(target, base)) throw new Error('Media path escapes the configured storage root')
  // Check existing ancestors as well: junctions/symlinks cannot move reads or writes outside root.
  if (fs.existsSync(base)) {
    let ancestor = target
    while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor)
    if (!inside(fs.realpathSync(ancestor), fs.realpathSync(base))) throw new Error('Media link escapes the configured storage root')
  }
  return target
}
