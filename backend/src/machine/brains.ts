import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
const tool = z.object({ type: z.literal('function').optional(), function: z.object({ name: z.string().regex(/^[\w.-]{1,100}$/), description: z.string().optional(), parameters: z.unknown().optional() }) })
export const ChatRequest = z.object({
  model: z.string().min(1).max(160), messages: z.array(z.record(z.string(), z.unknown())).min(1).max(120),
  tools: z.array(tool).max(100).optional(), tool_choice: z.unknown().optional(),
  reasoning_effort: z.enum(EFFORTS).optional(), stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().max(32768).optional(),
}).passthrough()
type Request = z.infer<typeof ChatRequest>
const Decision = z.object({ content: z.string(), tool_calls: z.array(z.object({ name: z.string(), arguments: z.string() })).max(16) }).strict()
type DecisionValue = z.infer<typeof Decision>
type ToolRequest = { tools?: { function: { name: string } }[]; tool_choice?: unknown }

export function validateDecision(value: unknown, request: ToolRequest): DecisionValue {
  const decision = Decision.parse(value)
  const allowed = new Set(request.tools?.map(t => t.function.name) ?? [])
  if (request.tool_choice === 'none' && decision.tool_calls.length) throw new Error('Tool use was disabled')
  for (const call of decision.tool_calls) {
    if (!allowed.has(call.name)) throw new Error('Model selected an unavailable tool')
    const args: unknown = JSON.parse(call.arguments)
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be a JSON object')
  }
  if (request.tool_choice === 'required' && !decision.tool_calls.length) throw new Error('The requested tool call is missing')
  return decision
}

export function validateLocalCompletion(value: unknown, request: ToolRequest) {
  const shape = z.object({choices:z.array(z.object({message:z.object({
    content:z.string().nullable().optional(),
    tool_calls:z.array(z.object({type:z.literal('function'),function:z.object({name:z.string(),arguments:z.string()})})).optional(),
  }).passthrough()}).passthrough()).min(1).max(1)}).passthrough()
  const parsed=shape.parse(value)
  const message=parsed.choices[0].message
  validateDecision({content:message.content??'',tool_calls:message.tool_calls?.map(call=>call.function)??[]},request)
  return value as ReturnType<typeof completionFromDecision>
}

export function completionFromDecision(decision: DecisionValue, model: string) {
  const tool_calls = decision.tool_calls.map(call => ({ id: `call_${randomUUID()}`, type: 'function' as const, function: call }))
  return { id: `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now()/1000), model,
    choices: [{ index: 0, message: { role: 'assistant', content: decision.content || null, ...(tool_calls.length ? { tool_calls } : {}) }, finish_reason: tool_calls.length ? 'tool_calls' : 'stop' }],
  }
}

export function localModelForEffort(model: string, effort: string | undefined, ids: string[]) {
  if (!ids.includes(model)) throw new Error('Local model is not advertised by llama-swap')
  if (!effort || effort === 'auto') return model
  const base = model.replace(/:(low|medium|high|xhigh|auto)$/, '')
  const alias = `${base}:${effort}`
  if (ids.includes(alias)) return alias
  // Ruby's NInfer seat uses reasoning_effort in the request, not model aliases.
  if (model === 'qwen3.8-27b@ninfer-ruby' && ['low','medium','high','xhigh'].includes(effort)) return model
  throw new Error(`Local backend does not advertise ${effort} effort for this model`)
}

export async function localModels(): Promise<string[]> {
  const result = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(5000) })
  if (!result.ok) throw new Error('Local model discovery failed')
  const body = await result.json() as { data?: { id: string }[] }
  return (body.data ?? []).map(x => x.id)
}

const decisionSchema = { type: 'object', additionalProperties: false, required: ['content','tool_calls'], properties: {
  content: {type:'string'}, tool_calls: {type:'array', items:{type:'object',additionalProperties:false,required:['name','arguments'],properties:{name:{type:'string'},arguments:{type:'string'}}}},
} }

async function executable(provider: 'codex' | 'claude') {
  const configured = process.env[provider === 'codex' ? 'HUOBAO_CODEX_EXE' : 'HUOBAO_CLAUDE_EXE']
  if (configured) { await fs.access(configured); return configured }
  if (provider === 'claude') {
    const exe = path.join(process.env.APPDATA!, 'npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe')
    await fs.access(exe); return exe
  }
  const root = path.join(process.env.LOCALAPPDATA!, 'OpenAI/Codex/bin')
  const entries = await fs.readdir(root, {withFileTypes:true})
  for (const entry of entries.filter(e=>e.isDirectory()).reverse()) {
    const exe = path.join(root,entry.name,'codex.exe')
    try { await fs.access(exe); return exe } catch { /* other installed versions */ }
  }
  throw new Error('Codex native executable is unavailable')
}

function run(exe: string, args: string[], prompt: string, cwd: string): Promise<string> {
  const env = {...process.env}
  // Subscription seats use their existing login. Never fall back to paid API credentials.
  for (const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','OPENAI_BASE_URL','ANTHROPIC_BASE_URL','CLAUDECODE']) delete env[key]
  env.TEMP = cwd; env.TMP = cwd
  return new Promise((resolve,reject)=>{
    const child = spawn(exe,args,{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']})
    let stdout=''; let bytes=0; let settled=false
    const finish = (error?: Error) => { if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(stdout) }
    const stop = () => { if(child.pid) spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}) }
    const timer=setTimeout(()=>{stop();finish(new Error('Subscription model timed out'))},240000)
    child.stdout.on('data',(data:Buffer)=>{bytes+=data.length;if(bytes>4_000_000){stop();finish(new Error('Model response exceeded limit'))}else stdout+=data.toString()})
    child.stderr.on('data',()=>{/* Credentials and provider diagnostics are not returned to HTTP clients. */})
    child.on('error',()=>finish(new Error('Subscription model could not start')))
    child.on('close',code=>finish(code===0?undefined:new Error('Subscription model request failed; check seat access and selected model')))
    child.stdin.on('error',()=>{})
    child.stdin.end(prompt)
  })
}

const active = new Set<string>()
export async function chat(request: Request) {
  if (request.model.startsWith('local:')) {
    const model = localModelForEffort(request.model.slice(6),request.reasoning_effort,await localModels())
    const response=await fetch('http://127.0.0.1:1234/v1/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...request,model,reasoning_effort:model==='qwen3.8-27b@ninfer-ruby'&&request.reasoning_effort==='high'?'xhigh':request.reasoning_effort,stream:false}),signal:AbortSignal.timeout(240000),
    })
    if(!response.ok) throw new Error(`Local model refused the request (${response.status})`)
    return validateLocalCompletion(await response.json(),request)
  }
  const provider=request.model==='gpt-6.1-sol'?'codex':request.model==='claude-opus-5-5'?'claude':null
  if(!provider) throw new Error('Only configured local models, Opus 5.5 and Sol 6.1 are enabled')
  if(provider==='claude' && request.reasoning_effort==='ultra') throw new Error('Claude Code does not support ultra effort')
  if(active.has(provider)) throw new Error('This subscription seat is busy; retry after the current request')
  active.add(provider)
  const cwd=path.resolve(process.env.HUOBAO_AGENT_SCRATCH ?? 'E:/Media/Huobao/Temp/brain')
  const prompt='Act only as the model of an application. Do not use shell, filesystem, network, MCP or built-in tools. Select from the function definitions below; the application will execute them and send their results in subsequent messages. Return the exact JSON object with content:string and tool_calls:[{name:string,arguments:JSON-string-of-object}]. Do not claim a tool succeeded before its result is provided. Follow the application system messages and the tool_choice setting.\n'+JSON.stringify(request)
  try {
    await fs.mkdir(cwd,{recursive:true})
    let value: unknown
    if(provider==='claude') {
      const args=['-p','--output-format','json','--no-session-persistence','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--model',request.model,'--effort',request.reasoning_effort??'medium','--json-schema',JSON.stringify(decisionSchema)]
      const body=JSON.parse(await run(await executable(provider),args,prompt,cwd)) as {is_error?:boolean;structured_output?:unknown;result?:string}
      if(body.is_error) throw new Error('Claude subscription refused this request')
      value=body.structured_output??JSON.parse(body.result??'{}')
    } else {
      const schemaFile=path.join(cwd,`${randomUUID()}.schema.json`)
      await fs.writeFile(schemaFile,JSON.stringify(decisionSchema))
      try {
        const args=['exec','--json','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--disable','shell_tool','--disable','multi_agent','--disable','code_mode_host','-c','web_search="disabled"','-c','model_provider="openai"','-c',`model_reasoning_effort="${request.reasoning_effort??'low'}"`,'-m',request.model,'--output-schema',schemaFile,'-']
        // Only configuration table names are inspected; no credential file is opened.
        const config=await fs.readFile(path.join(process.env.USERPROFILE!,'.codex/config.toml'),'utf8')
        for(const name of new Set(Array.from(config.matchAll(/^\[mcp_servers\.([\w-]+)(?:\.[\w-]+)?\]/gm),m=>m[1]))) args.push('-c',`mcp_servers.${name}.enabled=false`)
        const lines=(await run(await executable(provider),args,prompt,cwd)).split(/\r?\n/)
        let last=''
        for(const line of lines) { try { const event=JSON.parse(line);if(event.type==='item.completed'&&event.item?.type==='agent_message') last=event.item.text } catch { /* non-JSON status line */ } }
        if(!last) throw new Error('Codex returned no structured model response')
        value=JSON.parse(last)
      } finally { await fs.rm(schemaFile,{force:true}) }
    }
    return completionFromDecision(validateDecision(value,request),request.model)
  } finally { active.delete(provider) }
}
