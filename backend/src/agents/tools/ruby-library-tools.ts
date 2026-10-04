import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { rubyRequest } from '../../services/ruby-media.js'

export const rubyLibraryTools = {
  consultRubyLibrary: createTool({
    id: 'consult_ruby_library',
    description: 'Consult the actual shared Ruby Library before story, storyboard or media prompt work. Returns its index, matched guidance and a receipt. Exact source request examples: index:kind=prompt or index:kind=doc or index:kind=skill (these are the only valid index kinds; filters kind=, family=, page=), toc:<doc-id>, <doc-id>#<section>, prompt:<id>, skill:<id>, cases:<category>/<slug>. Presets are inspected through the catalogue and selected with proposed_card, never index:kind=preset. Read returned guidance and apply relevant facts to your work; never invent library content.',
    inputSchema: z.object({
      proposed_card: z.string().optional(),
      requests: z.array(z.string()).max(8).optional(),
    }),
    execute: async ({ proposed_card, requests }, context) => {
      let key = context?.requestContext?.get('rubyLibraryUseId' as never) as string | undefined
      let opened: any
      if (!key) {
        opened = await rubyRequest('/api/library-use/sessions', { project: 'huobao', proposed_card })
        key = opened.library_use_id
        context?.requestContext?.set('rubyLibraryUseId' as never, key as never)
      }
      if (requests?.length) {
        const sources = await rubyRequest(`/api/library-use/${encodeURIComponent(key!)}/read`, { project: 'huobao', requests })
        return { ...opened, ...sources }
      }
      return opened || rubyRequest(`/api/library-use/${encodeURIComponent(key!)}`)
    },
  }),
}
