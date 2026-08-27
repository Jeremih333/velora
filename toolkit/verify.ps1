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

  # Wrangler gives an environment token precedence over its encrypted OAuth session. A stale
  # machine-level token must not make the deterministic local gate fail or silently use another
  # Cloudflare identity when integration starts a remote AI binding.
  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "package.json"))) {
    throw "package.json is not present yet. Complete the project bootstrap first."
  }

  # test:e2e already executes every @visual and @a11y scenario, including the axe scans, on all
  # four projects. Repeating those same long WebKit journeys in this process leaks engine
  # resources and can produce a false ten-minute timeout. The focused scripts remain available
  # for isolated diagnostics and run each project in a fresh Playwright process.
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
