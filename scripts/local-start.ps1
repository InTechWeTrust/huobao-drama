$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$State = 'E:\Media\Huobao\.state'
# Media paths are fixed on E: (no Ruby lookup). Ruby folders stay readable so older dramas keep their references.
$TempMedia = 'E:\Media\Huobao\Temp'
$Project = 'E:\Media\Huobao\Project'
$Mapping = @{ shared_media_roots = @($Project, $TempMedia,
  'E:\Media\VLO\Project', 'E:\Media\VLO\Temp',
  'E:\Media\ComfyUI\Input', 'E:\Media\ComfyUI\Project', 'E:\Media\ComfyUI\Temp\Windows',
  'E:\Media\Rubyapp\Project', 'E:\Media\Rubyapp\KeyAsset', 'E:\Media\Rubyapp\Handoff', 'E:\Media\Rubyapp\Temp') }
$Scratch = Join-Path $TempMedia 'runtime'
foreach ($folder in @($State,$Scratch,$TempMedia,$Project)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }
$env:HUOBAO_DATA_DIR=$State
$env:SQLITE_PATH=Join-Path $State 'huobao.sqlite3'
$env:STORAGE_PATH=$Project
$env:HUOBAO_TEMP_DIR=$TempMedia
$env:HUOBAO_SHARED_MEDIA_ROOTS=ConvertTo-Json -InputObject @($Mapping.shared_media_roots) -Compress
$env:HUOBAO_AGENT_SCRATCH=Join-Path $TempMedia 'brain'
$env:HUOBAO_LOCAL_MACHINE='1'
$env:RUBYAPP_URL='http://127.0.0.1:7010'
$Workspace=Join-Path $State 'workspace'
if(-not(Test-Path -LiteralPath $Workspace)){
  Copy-Item -LiteralPath (Join-Path $Repo 'backend\workspace') -Destination $Workspace -Recurse
}
$env:WORKSPACE_PATH=$Workspace
$env:HUOBAO_VERSION=(Get-Content -LiteralPath (Join-Path $Repo 'desktop\package.json') -Raw | ConvertFrom-Json).version
$env:FRONTEND_DIST=Join-Path $Repo 'frontend\.output\public'
$env:TEMP=$Scratch; $env:TMP=$Scratch
$env:npm_config_cache=Join-Path $Scratch 'npm-cache'
Set-Location (Join-Path $Repo 'backend')
& node.exe --import tsx src/index.ts
exit $LASTEXITCODE
