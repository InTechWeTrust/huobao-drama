/**
 * Real drama deletion: the drama's own media goes to the Recycle Bin and its rows leave the database.
 * Only files inside Huobao's own roots are touched; anything another drama still references is kept,
 * and shared roots (VLO, ComfyUI, Ruby) are never removed from here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { db } from '../db/index.js'
import { STORAGE_ROOT, TEMP_ROOT } from '../utils/paths.js'
import { recycle } from '../utils/recycle.js'

type Row = Record<string, unknown>
const sqlite = (db as unknown as { $client: import('better-sqlite3').Database }).$client
const roots = [STORAGE_ROOT, TEMP_ROOT].map(r => path.resolve(r))
const inside = (file: string, root: string) => { const rel = path.relative(root, file); return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel) }
const ours = (file: string) => roots.some(root => inside(file, root))
const key = (file: string) => path.resolve(file).toLowerCase()

/** Every media path a row mentions (static/…, bridge /files/Huobao/…, or absolute paths), JSON columns included. */
function references(row: Row): string[] {
  const out: string[] = []
  const text = JSON.stringify(row).replace(/\\\\/g, '/')
  for (const m of text.matchAll(/(?:^|["\s(])\/?static\/([^"\s?#)]+)/g)) out.push(path.resolve(STORAGE_ROOT, decodeURIComponent(m[1])))
  for (const m of text.matchAll(/\/files\/Huobao\/([^"\s?#)]+)/g)) out.push(path.resolve(STORAGE_ROOT, decodeURIComponent(m[1])))
  for (const m of text.matchAll(/[A-Za-z]:\/[^"\n]+?\.(?:png|jpe?g|webp|gif|mp4|mov|webm|mkv|wav|mp3|m4a|flac|srt|ass|vtt|json|txt)/gi)) out.push(path.resolve(m[0]))
  return out
}

function withCompanions(file: string): string[] {
  // Thumbnails and poster frames generated next to the media (x.png → x_thumb.webp, x.mp4 → x_poster.jpg).
  return [file, file.replace(/\.[^./\\]+$/, '_thumb.webp'), file.replace(/\.[^./\\]+$/, '_poster.jpg')]
}

const all = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).all(...args) as Row[]
const ids = (rows: Row[]) => rows.map(r => Number(r.id))
const list = (values: number[]) => values.length ? values.join(',') : 'NULL'

function dramaRows(dramaId: number) {
  const episodes = all('SELECT * FROM episodes WHERE drama_id = ?', dramaId)
  const ep = list(ids(episodes))
  const storyboards = all(`SELECT * FROM storyboards WHERE episode_id IN (${ep})`)
  const sb = list(ids(storyboards))
  return {
    dramas: all('SELECT * FROM dramas WHERE id = ?', dramaId),
    episodes,
    storyboards,
    characters: all('SELECT * FROM characters WHERE drama_id = ?', dramaId),
    scenes: all(`SELECT * FROM scenes WHERE drama_id = ? OR episode_id IN (${ep})`, dramaId),
    props: all('SELECT * FROM props WHERE drama_id = ?', dramaId),
    sys_task: all(`SELECT * FROM sys_task WHERE drama_id = ? OR storyboard_id IN (${sb})`, dramaId),
    video_merges: all(`SELECT * FROM video_merges WHERE drama_id = ? OR episode_id IN (${ep})`, dramaId),
    assets: all(`SELECT * FROM assets WHERE drama_id = ? OR episode_id IN (${ep}) OR storyboard_id IN (${sb})`, dramaId),
  }
}

export async function purgeDrama(dramaId: number) {
  const owned = dramaRows(dramaId)
  if (!owned.dramas.length) throw new Error('Drama not found')
  const mine = new Set<string>()
  for (const rows of Object.values(owned)) for (const row of rows) for (const ref of references(row)) mine.add(path.resolve(ref))

  // Files any other row still mentions stay put.
  const keep = new Set<string>()
  const ownedIds = Object.fromEntries(Object.entries(owned).map(([table, rows]) => [table, new Set(ids(rows))]))
  for (const table of Object.keys(owned)) {
    for (const row of all(`SELECT * FROM ${table}`)) {
      if (ownedIds[table].has(Number(row.id))) continue
      for (const ref of references(row)) keep.add(key(ref))
    }
  }

  const folder = path.resolve(STORAGE_ROOT, `huobao-drama-${dramaId}`)
  const folderShared = [...keep].some(k => k.startsWith(key(folder) + path.sep))
  const targets: string[] = []
  if (fs.existsSync(folder) && !folderShared) targets.push(folder)
  for (const file of mine) {
    if (!ours(file) || keep.has(key(file))) continue
    if (!folderShared && fs.existsSync(folder) && inside(file, folder)) continue  // goes with the folder
    for (const f of withCompanions(file)) if (fs.existsSync(f) && fs.statSync(f).isFile()) targets.push(f)
  }
  const recycled = await recycle(targets)

  // Rows last, in one transaction, so a failed file move leaves the drama visible to retry.
  const ep = list(ids(owned.episodes)), sb = list(ids(owned.storyboards))
  sqlite.transaction(() => {
    sqlite.prepare(`DELETE FROM storyboard_characters WHERE storyboard_id IN (${sb})`).run()
    sqlite.prepare(`DELETE FROM storyboard_props WHERE storyboard_id IN (${sb})`).run()
    for (const t of ['episode_characters', 'episode_scenes', 'episode_props']) sqlite.prepare(`DELETE FROM ${t} WHERE episode_id IN (${ep})`).run()
    for (const [table, rows] of Object.entries(owned)) {
      if (table !== 'dramas' && rows.length) sqlite.prepare(`DELETE FROM ${table} WHERE id IN (${list(ids(rows))})`).run()
    }
    sqlite.prepare('DELETE FROM dramas WHERE id = ?').run(dramaId)
  })()
  return { recycled, kept_shared: [...mine].filter(f => keep.has(key(f)) || !ours(f)).length }
}

