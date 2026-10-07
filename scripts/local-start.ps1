$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$State = 'E:\Media\Huobao\.state'
$Scratch = 'E:\Media\Huobao\Temp\runtime'
$TempMedia = 'E:\Media\Huobao\Temp'
$Project = 'E:\Media\Huobao\Project'
foreach ($folder in @($State,$Scratch,$TempMedia,$Project)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }
$env:HUOBAO_DATA_DIR=$State
$env:SQLITE_PATH=Join-Path $State 'huobao.sqlite3'
$env:STORAGE_PATH=$Project
$env:HUOBAO_TEMP_DIR=$TempMedia
$env:HUOBAO_AGENT_SCRATCH='E:\Media\Huobao\Temp\brain'
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
