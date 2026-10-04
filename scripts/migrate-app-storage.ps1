# Relocate only this installation's owned state and empty VLO smoke project.
# Run after local-stop.ps1; native Ruby project mappings are a separate offline step.
$ErrorActionPreference='Stop'
foreach($Port in @(5678,5679,6332)){
  if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw "Stop the local studio suite before relocating port $Port state"}
}
$Moves=@(
  @{From='E:\rubyapp\apps\huobao';To='E:\Media\Huobao\.state'},
  @{From='E:\rubyapp\apps\vlo';To='E:\Media\VLO\.state'},
  @{From='E:\rubyapp\apps\studios';To='E:\Media\Huobao\.state\suite'},
  @{From='E:\rubyapp\scratch\app-install-20261004\huobao';To='E:\Media\Huobao\Temp\runtime'},
  @{From='E:\rubyapp\scratch\app-install-20261004\vlo';To='E:\Media\VLO\Temp\runtime'},
  @{From='E:\rubyapp\scratch\app-install-20261004\brain';To='E:\Media\Huobao\Temp\brain'},
  @{From='E:\rubyapp\scratch\app-install-20261004\diagnostics';To='E:\Media\Huobao\Temp\diagnostics'},
  @{From='E:\Media\Rubyapp\Project\vlo\VLO Studio';To='E:\Media\VLO\Project\VLO Studio'}
)
foreach($Move in $Moves){
  $Source=[IO.Path]::GetFullPath($Move.From)
  $Target=[IO.Path]::GetFullPath($Move.To)
  if($Source -ne $Move.From -or $Target -ne $Move.To){throw 'Unexpected resolved relocation path'}
  if(-not($Target.StartsWith('E:\Media\Huobao\',[StringComparison]::OrdinalIgnoreCase) -or $Target.StartsWith('E:\Media\VLO\',[StringComparison]::OrdinalIgnoreCase))){throw 'Destination is outside the two app roots'}
  if(-not(Test-Path -LiteralPath $Source)){continue}
  if(Test-Path -LiteralPath $Target){throw "Destination already exists; inspect before merging: $Target"}
  $SourceItem=Get-Item -LiteralPath $Source -Force
  if($SourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked source is not eligible for relocation'}
  New-Item -ItemType Directory -Force -Path (Split-Path $Target -Parent) | Out-Null
  Move-Item -LiteralPath $Source -Destination $Target
  if((Test-Path -LiteralPath $Source) -or -not(Test-Path -LiteralPath $Target)){throw "Relocation verification failed: $Target"}
  Write-Output $Target
}
foreach($Root in @('E:\Media\Huobao\Project','E:\Media\Huobao\Temp','E:\Media\VLO\Project','E:\Media\VLO\Temp')){
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
}
