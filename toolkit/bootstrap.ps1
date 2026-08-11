$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
Set-Location -LiteralPath $projectRoot

$requiredCommands = @("node", "corepack", "git")
foreach ($command in $requiredCommands) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required command is missing: $command"
  }
}

Write-Output "Velora root: $projectRoot"
Write-Output "Node: $(node --version)"
Write-Output "Corepack: $(corepack --version)"
Write-Output "pnpm: $(corepack pnpm --version)"
Write-Output "Git: $(git --version)"
Write-Output "Wrangler: $(corepack pnpm dlx wrangler --version)"
