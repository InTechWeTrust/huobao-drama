import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { MACHINE_MODELS, MACHINE_EFFORTS_BY_MODEL } from './ai.js'
import { now } from '../utils/response.js'

export function validateMachineBrain(model: string, effort: string) {
  if (!(MACHINE_MODELS as readonly string[]).includes(model)) throw new Error('Choose a supported machine brain')
  if (!MACHINE_EFFORTS_BY_MODEL[model]?.includes(effort)) throw new Error('Choose an effort supported by this machine brain')
  return { model, effort }
}

export function getEpisodeBrain(episodeId: number): { model: string; effort: string } | null {
  const row = db.select().from(schema.appSettings).where(eq(schema.appSettings.key, `machine_brain:episode:${episodeId}`)).get()
  if (!row) return null
  try { const value = JSON.parse(row.value); return validateMachineBrain(value.model, value.effort) } catch { return null }
}

export function setEpisodeBrain(episodeId: number, model: string, effort: string) {
  const selected = validateMachineBrain(model, effort)
  const key = `machine_brain:episode:${episodeId}`, value = JSON.stringify(selected)
  db.insert(schema.appSettings).values({ key, value, updatedAt: now() }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: now() } }).run()
  return selected
}

/** Each agent request closes over its own effort; changing another episode cannot affect it. */
export function machineEffortFetch(model: string, effort: string): typeof fetch {
  validateMachineBrain(model, effort)
  return (input, init) => {
    if (typeof init?.body === 'string') {
      const body = JSON.parse(init.body)
      return fetch(input, { ...init, body: JSON.stringify({ ...body, reasoning_effort: effort }) })
    }
    return fetch(input, init)
  }
}
