param([ValidateSet('huobao','vlo','mcp')][string[]]$Name=@('huobao','vlo','mcp'))
$ErrorActionPreference='Stop'
$State='E:\Media\Huobao\.state\suite'
foreach($StudioName in $Name) {
  $StudioPidFile=Join-Path $State "$StudioName.pid"
  if(-not(Test-Path -LiteralPath $StudioPidFile)){continue}
  $StudioPid=[int](Get-Content -LiteralPath $StudioPidFile)
  $StudioProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$StudioPid"
  if($StudioProcess) {
    $ExpectedMarker=switch($StudioName){'huobao'{'D:\Other-projects\huobao-drama\scripts\local-start.ps1'} 'vlo'{'D:\Other-projects\vlo\scripts\local-start.ps1'} 'mcp'{'D:\Other-projects\huobao-drama\scripts\mcp-stdio.py'}}
    if(-not $StudioProcess.CommandLine.Contains($ExpectedMarker)){throw "PID $StudioPid no longer belongs to $StudioName; refusing to stop it"}
    & taskkill.exe /PID $StudioPid /T /F | Out-Null
    if($LASTEXITCODE -ne 0){throw "Could not stop $StudioName"}
  }
  Remove-Item -LiteralPath $StudioPidFile
}
