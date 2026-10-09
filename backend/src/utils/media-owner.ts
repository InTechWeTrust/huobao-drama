import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import type { MediaScope } from './storage.js'

function nativeId(value: unknown, label: string): number | null {
  if (value == null) return null
  if (!(typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value))) throw new Error(`${label} must be a native id`)
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`${label} must be a positive native id`)
  return id
}

/** Resolve ownership from native records before any upload or provider write. */
export function resolveMediaScope(body: Record<string, unknown>): MediaScope {
  let dramaId = nativeId(body.drama_id, 'drama_id')
  let episodeId = nativeId(body.episode_id, 'episode_id')
  let scope: MediaScope = {}
  const adopt = (owner: number) => {
    if (dramaId != null && dramaId !== owner) throw new Error('Media belongs to a different drama')
    dramaId = owner
  }
  const storyboardId = nativeId(body.storyboard_id, 'storyboard_id')
  if (storyboardId == null && ['character_id', 'scene_id', 'prop_id'].filter(key => body[key] != null).length > 1) {
    throw new Error('Media needs one asset owner when no storyboard is specified')
  }
  if (storyboardId != null) {
    const row = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).get()
    if (!row || row.deletedAt) throw new Error('Storyboard does not exist')
    if (episodeId != null && episodeId !== row.episodeId) throw new Error('Storyboard belongs to a different episode')
    episodeId = row.episodeId
    scope = { ...scope, storyboardId }
  }
  if (episodeId != null) {
    const row = db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).get()
    if (!row || row.deletedAt) throw new Error('Episode does not exist')
    adopt(row.dramaId)
    scope = { ...scope, episodeId }
  }
  for (const [field, table, key] of [
    ['character_id', schema.characters, 'characterId'],
    ['scene_id', schema.scenes, 'sceneId'],
    ['prop_id', schema.props, 'propId'],
  ] as const) {
    const id = nativeId(body[field], field)
    if (id == null) continue
    const row = db.select().from(table).where(eq(table.id, id)).get()
    if (!row || row.deletedAt) throw new Error(`${field} does not exist`)
    adopt(row.dramaId)
    scope = { ...scope, [key]: id }
  }
  if (dramaId != null) {
    const row = db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId)).get()
    if (!row || row.deletedAt) throw new Error('Drama does not exist')
    scope = { ...scope, dramaId }
  }
  return scope
}
