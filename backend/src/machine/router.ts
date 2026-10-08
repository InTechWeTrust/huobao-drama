import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { ChatRequest, chat, EFFORTS, localModels } from './brains.js'

const app=new Hono()
const allowedOrigins=new Set(['http://127.0.0.1:5679','http://localhost:5679','http://127.0.0.1:6332','http://localhost:6332'])
app.use('*',bodyLimit({maxSize:1_500_000}))
app.use('*',async(c,next)=>{
  const origin=c.req.header('origin')
  if(origin&&!allowedOrigins.has(origin))return c.json({error:'Untrusted browser origin'},403)
  if(!['127.0.0.1','localhost','[::1]'].includes(new URL(c.req.url).hostname))return c.json({error:'Local machine access only'},403)
  await next()
})
app.get('/status',async c=>c.json({mode:'local-machine',cloud_api:false,media:['E:/Media/Huobao','E:/Media/VLO'],shared_sources:['E:/Media/Rubyapp/KeyAsset','E:/Media/ComfyUI/Input'],ruby_backend:'http://127.0.0.1:7010',library:'E:/rubyapp/Library',comfyui:'http://127.0.0.1:8188',models:{video:['minimax-h3'],image:['qwen-2.1']},brain_efforts:EFFORTS,efforts_by_model:{'local:qwen3.8-27b@ninfer-ruby':['low','medium','high','xhigh'],'claude-opus-5-5':['low','medium','high','xhigh','max'],'gpt-6.1-sol':EFFORTS},effort_wire:{'local:qwen3.8-27b@ninfer-ruby':{high:'xhigh'}}}))
app.get('/v1/models',async c=>{
  let ids:string[]=[]
  try{ids=await localModels()}catch{/* Offline models do not pretend to be ready. */}
  return c.json({object:'list',data:[...ids.filter(id=>!id.includes(':')).map(id=>({id:`local:${id}`,object:'model',owned_by:'local'})),{id:'gpt-6.1-sol',object:'model',owned_by:'codex-subscription'},{id:'claude-opus-5-5',object:'model',owned_by:'claude-subscription'}]})
})
app.post('/v1/chat/completions',async c=>{
  try{
    const request=ChatRequest.parse(await c.req.json())
    const result=await chat(request)
    if(!request.stream)return c.json(result)
    const choice=result.choices[0]
    const delta={role:'assistant',content:choice.message.content,tool_calls:choice.message.tool_calls?.map((call,index)=>({...call,index}))}
    const chunk={...result,object:'chat.completion.chunk',choices:[{index:0,delta,finish_reason:null}]}
    const stop={...chunk,choices:[{index:0,delta:{},finish_reason:choice.finish_reason}]}
    return c.body(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(stop)}\n\ndata: [DONE]\n\n`,200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'})
  }catch(err){return c.json({error:{message:err instanceof Error?err.message:'Model request refused',type:'local_machine_error'}},400)}
})

async function ruby(c: Context,route:string) {
  const caller=c.req.header('X-Machine-App')==='vlo'?'vlo':'huobao-drama'
  const response=await fetch(`http://127.0.0.1:7010/api/${route}`,{
    method:c.req.method,headers:{'Content-Type':'application/json','X-Ruby-Origin':caller,'X-Ruby-Session':caller},
    ...(c.req.method==='POST'?{body:await c.req.text()}:{}),signal:AbortSignal.timeout(30000),
  })
  return new Response(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('Content-Type')??'application/json'}})
}
app.get('/library',c=>{
  const params=new URLSearchParams(new URL(c.req.url).searchParams)
  params.set('state','active')
  return ruby(c,`catalogue?${params}`)
})
app.get('/library/:kind/:id',c=>ruby(c,`catalogue/${encodeURIComponent(c.req.param('kind'))}/${encodeURIComponent(c.req.param('id'))}`))
app.post('/library-use/sessions',c=>ruby(c,'library-use/sessions'))
app.post('/library-use/:id/read',c=>ruby(c,`library-use/${encodeURIComponent(c.req.param('id'))}/read`))
app.get('/library-use/:id',c=>ruby(c,`library-use/${encodeURIComponent(c.req.param('id'))}`))
export default app
