"""Thin MCP access to the two original apps; REST/native editor own state."""
from __future__ import annotations

import argparse
import asyncio
import re
from typing import Any, Literal

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

HUOBAO = 'http://127.0.0.1:5679/api/v1'
VLO = 'http://127.0.0.1:6332/api/machine'
server = MCPServer('local-studios', version='1.0.0', instructions=(
    'Operate the original Huobao and VLO apps on this computer. First use studio_status and studio_capabilities. '
    'VLO editing requires its connected browser; wait for durable command acknowledgement. '
    'Use only MiniMax H3 video and Qwen 2.1 image. Library reads use Ruby Active policy and receipts. '
    'Never claim a queued job, pending editor command, or unavailable model completed.'))
READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)


async def request(method: str, url: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=240, trust_env=False) as client:
        response = await client.request(method, url, json=body if method != 'GET' else None)
    try:
        payload = response.json()
    except ValueError:
        payload = {'message': response.text[:2000]}
    return {'ok': response.is_success, 'status': response.status_code, 'result': payload}


def native_path(value: str) -> str:
    """No URL, encoded traversal, credentials, update service or arbitrary proxy."""
    if not re.fullmatch(r'/(?:dramas|episodes|storyboards|scenes|characters|props|tasks|agent|merge|style-presets|prompts|skills)(?:/[a-zA-Z0-9_.-]+)*(?:\?[a-zA-Z0-9_=&%.+-]*)?', value):
        raise ValueError('Use an allowed native API path from studio_capabilities')
    if '..' in value or '%' in value.split('?', 1)[0]:
        raise ValueError('Path traversal is refused')
    return value


@server.tool(annotations=READ_ONLY)
async def studio_status() -> dict[str, Any]:
    """Check both apps, shared roots, available model backends and editor connection."""
    huobao, vlo = await asyncio.gather(request('GET', HUOBAO+'/machine/status'), request('GET', VLO+'/status'), return_exceptions=True)
    return {'huobao': str(huobao) if isinstance(huobao,Exception) else huobao,
            'vlo': str(vlo) if isinstance(vlo,Exception) else vlo}


@server.tool(annotations=READ_ONLY)
async def studio_capabilities() -> dict[str, Any]:
    """Read supported VLO commands and Huobao API routes before modifying a film."""
    return {'huobao': {'base':HUOBAO,'native_routes':['dramas','episodes','storyboards','scenes','characters','props','tasks','agent','merge','style-presets','prompts','skills'],
                      'brain':await request('GET',HUOBAO+'/settings/machine-brain'),
                      'media':await request('GET',HUOBAO+'/settings/ruby-media')},
            'vlo':await request('GET',VLO+'/capabilities')}


@server.tool()
async def huobao_request(method: Literal['GET','POST','PUT','PATCH','DELETE'], path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    """Operate Huobao native projects, episodes, assets, storyboard, agent, tasks and export. Use native route schemas; jobs are asynchronous."""
    return await request(method,HUOBAO+native_path(path),body)


@server.tool()
async def huobao_brain(model: str, effort: str, episode_id: int | None = None) -> dict[str, Any]:
    """Choose a subscription/local brain and Effort. Supply episode_id to change only that episode; otherwise set the app default."""
    if episode_id is not None and episode_id < 1:
        raise ValueError('episode_id must be positive')
    suffix = '' if episode_id is None else '/episodes/'+str(episode_id)
    return await request('PUT',HUOBAO+'/settings/machine-brain'+suffix,{'model':model,'effort':effort})


@server.tool()
async def huobao_media(action: Literal['settings','presets','preset','inputs','defaults','shot-controls','preview'], preset_id: str | None = None, body: dict[str, Any] | None = None, storyboard_id: int | None = None) -> dict[str, Any]:
    """Read live presets/inputs; set defaults, preset values or one storyboard's controls. Preview validates a shot without queueing media."""
    if storyboard_id is not None and (action != 'shot-controls' or storyboard_id < 1):
        raise ValueError('A positive storyboard_id only applies to shot-controls')
    if body is not None and action not in ('defaults','preset','shot-controls','preview'):
        raise ValueError('This action does not accept a body')
    if action=='preset':
        if not preset_id or not re.fullmatch(r'[a-zA-Z0-9_.-]{1,200}',preset_id):
            raise ValueError('A valid preset identity is required')
        suffix='/presets/'+preset_id
    else:
        if preset_id is not None:
            raise ValueError('preset_id only applies to preset')
        if action == 'shot-controls':
            if storyboard_id is None:
                raise ValueError('storyboard_id is required')
            suffix='/shot-controls/'+str(storyboard_id)
        elif action == 'preview':
            if body is None:
                raise ValueError('A shot body is required for preview')
            suffix='/preview'
        else:
            suffix={'settings':'','presets':'/presets','inputs':'/key-assets','defaults':'/defaults' if body is not None else ''}[action]
    return await request('POST' if action == 'preview' else 'PUT' if body is not None else 'GET',HUOBAO+'/settings/ruby-media'+suffix,body)


@server.tool()
async def vlo_library_workflow(preset_id: str, ruby_project: str = 'vlo', shot: dict[str, Any] | None = None, expected_source_hash: str | None = None) -> dict[str, Any]:
    """Import an Active H3/Qwen Ruby preset through VLO's native Library receipt gate; load returned workflow_id using generation.load, without starting a render."""
    if not re.fullmatch(r'[a-zA-Z0-9_.-]{1,200}',preset_id) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',ruby_project):
        raise ValueError('Invalid preset or Ruby project identity')
    payload:dict[str,Any]={'preset_id':preset_id,'ruby_project':ruby_project}
    if shot is not None:
        payload['shot']=shot
    if expected_source_hash is not None:
        if not re.fullmatch(r'[a-f0-9]{64}', expected_source_hash):
            raise ValueError('expected_source_hash must be a SHA256 identity')
        payload['expected_source_hash']=expected_source_hash
    return await request('POST',VLO+'/library/workflow',payload)


@server.tool()
async def vlo_command(command: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    """Submit a validated command to VLO's actual connected editor; poll vlo_result until success/failure, never equate queueing with completion."""
    return await request('POST',VLO+'/commands',{'command':command,'args':args or {}})


@server.tool(annotations=READ_ONLY)
async def vlo_result(command_id: str) -> dict[str, Any]:
    """Read the actual VLO editor acknowledgement and durable result of one command."""
    if not re.fullmatch(r'[\w-]{1,100}',command_id):
        raise ValueError('Invalid command ID')
    return await request('GET',VLO+'/commands/'+command_id)


@server.tool(annotations=READ_ONLY)
async def library_catalogue(kind: Literal['','prompt','doc','skill','preset'] = '', query: str = '') -> dict[str, Any]:
    """Search the Ruby Library Active catalogue; does not bypass Library policy by reading files."""
    params=httpx.QueryParams({'kind':kind,'q':query})
    return await request('GET',HUOBAO+'/machine/library?'+str(params))


@server.tool()
async def library_consult(project: str, requests: list[str], proposed_card: str | None = None) -> dict[str, Any]:
    """Open a Ruby Library use session, read selected sources and retain its pinned receipts for later native writes. Project must exist in Ruby."""
    body:dict[str,Any]={'project':project}
    if proposed_card:
        body['proposed_card']=proposed_card
    opened=await request('POST',HUOBAO+'/machine/library-use/sessions',body)
    if not opened['ok']:
        return opened
    payload=opened['result']
    key=payload.get('library_use_id')
    if not key:
        return {'ok':False,'error':'Ruby returned no library use identity','opened':opened}
    read=await request('POST',HUOBAO+'/machine/library-use/'+key+'/read',{'requests':requests,'project':project})
    return {'ok':read['ok'],'library_use_id':key,'opened':opened,'read':read}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--http',action='store_true')
    args=parser.parse_args()
    if args.http:
        import uvicorn
        uvicorn.run(server.streamable_http_app(host='127.0.0.1'),host='127.0.0.1',port=5678,log_level='warning')
    else:
        server.run()
