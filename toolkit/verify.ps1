$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
Set-Location -LiteralPath $projectRoot

& (Join-Path $PSScriptRoot "secret-scan.ps1")

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "package.json"))) {
  throw "package.json is not present yet. Complete the project bootstrap first."
}

$commands = @("format:check", "lint", "typecheck", "test", "test:roleplay-quality", "test:contract", "test:integration", "build", "test:e2e")
foreach ($command in $commands) {
  Write-Output "Running pnpm $command"
  corepack pnpm $command
  if ($LASTEXITCODE -ne 0) {
    throw "Quality gate failed: pnpm $command"
  }
}

Write-Output "Velora quality gate passed."
