param([switch]$Open,[ValidateSet('huobao','vlo','both')][string]$App='both')
$ErrorActionPreference='Stop'
$Repo=Split-Path $PSScriptRoot -Parent
$State='E:\Media\Huobao\.state\suite'
$McpPython='D:\Other-projects\vlo\backend\.venv\Scripts\python.exe'
New-Item -ItemType Directory -Force -Path $State | Out-Null
$Shell=(Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if(-not $Shell){ $Shell=(Get-Command powershell.exe).Source }
function Start-LocalApp($Name,$Port,$Script) {
  if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){
    $StatusPath=if($Name -eq 'huobao'){'/api/v1/machine/status'}else{'/api/machine/status'}
    $Ready=Invoke-RestMethod -Uri "http://127.0.0.1:$Port$StatusPath" -TimeoutSec 5
    if(($Name -eq 'huobao' -and $Ready.mode -ne 'local-machine') -or ($Name -eq 'vlo' -and $Ready.enabled -ne $true)){throw "Port $Port belongs to an unverified service"}
    return
  }
  $Process=Start-Process -FilePath $Shell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$Script) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $State "$Name.out.log") -RedirectStandardError (Join-Path $State "$Name.err.log")
  Set-Content -LiteralPath (Join-Path $State "$Name.pid") -Value $Process.Id
}
Start-LocalApp 'huobao' 5679 (Join-Path $PSScriptRoot 'local-start.ps1')
Start-LocalApp 'vlo' 6332 'D:\Other-projects\vlo\scripts\local-start.ps1'
foreach($AppCheck in @(@{Port=5679;Path='/api/v1/machine/status'},@{Port=6332;Path='/api/machine/status'})) {
  $Deadline=(Get-Date).AddSeconds(45)
  do {
    try {$null=Invoke-RestMethod "http://127.0.0.1:$($AppCheck.Port)$($AppCheck.Path)" -TimeoutSec 2; break}
    catch {if((Get-Date) -ge $Deadline){throw "App on port $($AppCheck.Port) failed startup; inspect $State logs"}; Start-Sleep -Milliseconds 500}
  } while($true)
}
if(-not (Get-NetTCPConnection -State Listen -LocalPort 5678 -ErrorAction SilentlyContinue)) {
  $Process=Start-Process -FilePath $McpPython -ArgumentList @((Join-Path $PSScriptRoot 'mcp-stdio.py'),'--http') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $State 'mcp.out.log') -RedirectStandardError (Join-Path $State 'mcp.err.log')
  Set-Content -LiteralPath (Join-Path $State 'mcp.pid') -Value $Process.Id
  $McpDeadline=(Get-Date).AddSeconds(15)
  while(-not(Get-NetTCPConnection -State Listen -LocalPort 5678 -ErrorAction SilentlyContinue)){
    if((Get-Date) -ge $McpDeadline){throw "MCP failed startup; inspect $State logs"}
    Start-Sleep -Milliseconds 500
  }
}
& $McpPython (Join-Path $PSScriptRoot 'check-mcp.py') --http-only
if($LASTEXITCODE -ne 0){throw 'Port 5678 belongs to an unverified MCP service'}
if($Open){
  if($App -in @('huobao','both')){ Start-Process 'http://127.0.0.1:5679' }
  if($App -in @('vlo','both')){ Start-Process 'http://127.0.0.1:6332' }
}
