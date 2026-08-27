$ErrorActionPreference = 'Stop'

try {
  $project = Split-Path -Parent $PSScriptRoot
  $apiProject = Join-Path $project 'apps\api'
  $primaryAccountId = '9d1b271d6aec48ab5d8f595d1d3fac61'
  $secondaryConfigRoot = Join-Path $env:LOCALAPPDATA 'Velora\cloudflare-secondary-config'

  Set-Location -LiteralPath $apiProject
  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
  [IO.Directory]::CreateDirectory($secondaryConfigRoot) | Out-Null
  $env:XDG_CONFIG_HOME = $secondaryConfigRoot

  Write-Host 'VeloraAI secondary Cloudflare account login' -ForegroundColor Cyan
  Write-Host 'Open the device URL and sign in with the SECOND Cloudflare account.' -ForegroundColor Yellow
  Write-Host 'The console will remain open until you press Enter.' -ForegroundColor DarkGray
  Write-Host ''

  & corepack pnpm exec wrangler login --device
  if ($LASTEXITCODE -ne 0) { throw "Wrangler login failed with code $LASTEXITCODE." }

  $identityJson = & corepack pnpm exec wrangler whoami --json
  if ($LASTEXITCODE -ne 0) { throw "Wrangler identity check failed with code $LASTEXITCODE." }
  $identity = $identityJson | ConvertFrom-Json
  $accountIds = @($identity.accounts | ForEach-Object { [string]$_.id })

  Write-Host ''
  if ($accountIds.Count -eq 1 -and $accountIds[0] -eq $primaryAccountId) {
    Write-Host 'The primary account was selected again. Secondary login is NOT ready.' -ForegroundColor Red
    Write-Host 'Run this window again after signing out of Cloudflare in the browser.' -ForegroundColor Yellow
  } else {
    Write-Host 'Secondary Cloudflare identity confirmed.' -ForegroundColor Green
    Write-Host ('Account IDs: ' + ($accountIds -join ', ')) -ForegroundColor Green
    $identityPath = Join-Path $secondaryConfigRoot 'verified-account.json'
    [IO.File]::WriteAllText($identityPath, $identityJson, [Text.UTF8Encoding]::new($false))
    Write-Host ('Secondary context: ' + $secondaryConfigRoot) -ForegroundColor DarkGray
  }
} catch {
  Write-Host ''
  Write-Host 'Cloudflare login failed:' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
  Write-Host ''
  [void](Read-Host 'Press Enter to close')
}
