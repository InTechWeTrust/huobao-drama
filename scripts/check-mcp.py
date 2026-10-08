"""Verify real stdio discovery and native REST status without GPU inference."""
import asyncio
import argparse
from pathlib import Path
from mcp import Client, StdioServerParameters

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--http-only',action='store_true')
    options=parser.parse_args()
    expected={'studio_status','studio_capabilities','huobao_request','huobao_brain','huobao_media','vlo_library_workflow','vlo_command','vlo_result','library_catalogue','library_consult'}
    parameters=StdioServerParameters(command=r'D:\Other-projects\vlo\backend\.venv\Scripts\python.exe',args=[str(Path(__file__).with_name('mcp-stdio.py'))])
    transports=['http://127.0.0.1:5678/mcp'] if options.http_only else [parameters,'http://127.0.0.1:5678/mcp']
    for transport in transports:
      async with Client(transport) as client:
        tools=await client.list_tools()
        names=[tool.name for tool in tools.tools]
        assert expected <= set(names), names
        schemas={tool.name:tool.input_schema for tool in tools.tools}
        assert 'episode_id' in schemas['huobao_brain']['properties']
        assert 'storyboard_id' in schemas['huobao_media']['properties']
        assert 'preview' in schemas['huobao_media']['properties']['action']['enum']
        assert 'shot-controls' in schemas['huobao_media']['properties']['action']['enum']
        assert 'shot' in schemas['vlo_library_workflow']['properties']
        assert 'expected_source_hash' in schemas['vlo_library_workflow']['properties']
        print('MCP discovery PASS:',', '.join(names))
        answer=await client.call_tool('studio_status',{})
        assert not answer.is_error, answer
        assert answer.structured_content['huobao']['ok'], answer.structured_content
        assert answer.structured_content['vlo']['ok'], answer.structured_content
        print('MCP studio_status:',answer.structured_content)

if __name__=='__main__':
    asyncio.run(main())
