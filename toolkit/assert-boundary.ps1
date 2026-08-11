$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$marker = Join-Path $projectRoot ".velora-project"

if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
  throw "Velora boundary marker is missing: $marker"
}

$resolvedRoot = (Resolve-Path -LiteralPath $projectRoot).Path
if ($resolvedRoot -match "(?i)[\\/]RoleMate(?:[\\/]|$)") {
  throw "Refusing to operate inside the RoleMate workspace."
}

Write-Output $resolvedRoot
