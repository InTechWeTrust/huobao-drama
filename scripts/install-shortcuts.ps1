$ErrorActionPreference='Stop'
$Desktop=[Environment]::GetFolderPath('Desktop')
if(-not(Test-Path -LiteralPath $Desktop -PathType Container)){throw 'Desktop folder is unavailable'}
$Launcher=Join-Path $PSScriptRoot 'local-suite.ps1'
$Shell=(Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if(-not $Shell){$Shell=(Get-Command powershell.exe).Source}
$ShortcutShell=New-Object -ComObject WScript.Shell
foreach($Item in @(@{Name='Huobao Drama';App='huobao'},@{Name='VLO';App='vlo'})){
  $Path=Join-Path $Desktop ($Item.Name+'.lnk')
  if(Test-Path -LiteralPath $Path){
    $Existing=$ShortcutShell.CreateShortcut($Path)
    if($Existing.Arguments -notlike ('*'+$Launcher+'*')){throw "Existing shortcut $Path belongs to another installation"}
  }
  $Shortcut=$ShortcutShell.CreateShortcut($Path)
  $Shortcut.TargetPath=$Shell
  $Shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$Launcher+'" -Open -App '+$Item.App
  $Shortcut.WorkingDirectory=Split-Path $PSScriptRoot -Parent
  $Shortcut.Description='Open '+$Item.Name+' with shared Ruby/ComfyUI storage'
  $Shortcut.WindowStyle=7
  $Shortcut.Save()
  $Verified=$ShortcutShell.CreateShortcut($Path)
  if($Verified.TargetPath -ne $Shell -or $Verified.Arguments -ne $Shortcut.Arguments){throw "Shortcut verification failed: $Path"}
  Write-Output $Path
}
