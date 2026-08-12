$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
Set-Location -LiteralPath $projectRoot
$lockPath = Join-Path $projectRoot ".velora-verify.lock"
$lockStream = $null

try {
  try {
    $lockStream = [IO.File]::Open(
      $lockPath,
      [IO.FileMode]::OpenOrCreate,
      [IO.FileAccess]::ReadWrite,
      [IO.FileShare]::None
    )
  }
  catch {
    throw "Another Velora quality gate is already running. Wait for it to finish before retrying."
  }

  & (Join-Path $PSScriptRoot "secret-scan.ps1")

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "package.json"))) {
    throw "package.json is not present yet. Complete the project bootstrap first."
  }

  $commands = @("format:check", "docs:check", "lint", "typecheck", "test", "test:roleplay-quality", "test:contract", "test:integration", "build", "test:e2e")
  foreach ($command in $commands) {
    Write-Output "Running pnpm $command"
    corepack pnpm $command
    if ($LASTEXITCODE -ne 0) {
      throw "Quality gate failed: pnpm $command"
    }
  }

  Write-Output "Velora quality gate passed."
}
finally {
  if ($lockStream) { $lockStream.Dispose() }
  if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force }
}
