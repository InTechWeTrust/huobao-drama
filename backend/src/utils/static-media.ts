import path from 'node:path'
import type { MiddlewareHandler } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { getAbsolutePath } from './storage.js'
import { sharedMediaReference } from './shared-media-reference.js'

/** Keep the framework's streaming, ranges and HEAD support for relocated URLs. */
export const staticMedia: MiddlewareHandler = async (c, next) => {
  if (!['GET', 'HEAD'].includes(c.req.method)) return c.notFound()
  try {
    const relative = decodeURIComponent(c.req.path.slice('/static/'.length))
    const target = sharedMediaReference(getAbsolutePath(relative))
    return await serveStatic({ root: path.dirname(target), path: path.basename(target) })(c, next)
  } catch {
    return c.notFound()
  }
}
