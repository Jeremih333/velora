param(
  [switch]$ConfirmProductionUpdate
)

$ErrorActionPreference = 'Stop'
$projectRoot = & (Join-Path $PSScriptRoot 'assert-boundary.ps1')
$apiRoot = Join-Path $projectRoot 'apps\api'
$wranglerConfig = Join-Path $apiRoot 'wrangler.jsonc'
$wrangler = Join-Path $apiRoot 'node_modules\wrangler\bin\wrangler.js'
$publicAppUrl = 'https://velora-app.carreljeremih.workers.dev'
$accountId = '9d1b271d6aec48ab5d8f595d1d3fac61'
$databaseName = 'velora-production'
$expectedPendingMigrations = @(
  '0062_avatar_bot_response_variants.sql',
  '0063_character_greeting_and_lore_depth.sql',
  '0064_roleplay_generation_fallbacks.sql',
  '0065_break_free_model_fallback_cycle.sql',
  '0066_break_standard_model_fallback_cycle.sql'
)
$expectedMigrationCount = 66

function Invoke-Checked([scriptblock]$Command, [string]$FailureMessage) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

function Invoke-WranglerText([string[]]$Arguments, [string]$FailureMessage) {
  $output = & node $wrangler @Arguments 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
  return $output
}

function Assert-Endpoint([string]$Path, [string]$Property, [string]$Expected) {
  $lastError = 'no response'
  for ($attempt = 1; $attempt -le 12; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri ($publicAppUrl + $Path) -Method Get -TimeoutSec 15
      if ([string]$response.$Property -eq $Expected) { return }
      $lastError = "unexpected $Property"
    }
    catch {
      $lastError = $_.Exception.Message
    }
    if ($attempt -lt 12) { Start-Sleep -Seconds 5 }
  }
  throw "Production smoke failed for $Path after propagation retries: $lastError"
}

if (-not $ConfirmProductionUpdate) {
  throw 'Production update requires -ConfirmProductionUpdate. No migration, deployment, or webhook change was attempted.'
}

try {
  Set-Location -LiteralPath $projectRoot
  $env:CLOUDFLARE_API_TOKEN = $null
  $env:CLOUDFLARE_ACCOUNT_ID = $accountId

  Write-Host 'Velora production update: verifying the complete local release candidate.' -ForegroundColor Cyan
  Invoke-Checked { & (Join-Path $PSScriptRoot 'verify.ps1') } 'The local quality gate failed. Production was not changed.'

  $migrationOutput = Invoke-WranglerText @(
    'd1', 'migrations', 'list', $databaseName, '--remote', '--env=', '--config', $wranglerConfig
  ) 'Could not inspect production migrations. Production was not changed.'
  $pendingMigrations = @(
    [regex]::Matches($migrationOutput, '\b(\d{4}_[A-Za-z0-9_\-]+\.sql)\b') |
      ForEach-Object { $_.Groups[1].Value } |
      Sort-Object -Unique
  )
  if ($pendingMigrations.Count -gt 0 -and ($pendingMigrations -join ',') -ne ($expectedPendingMigrations -join ',')) {
    throw "Unexpected production migration set: [$($pendingMigrations -join ', ')]. Expected exactly [$($expectedPendingMigrations -join ', ')]."
  }

  $backupDirectory = Join-Path $projectRoot 'backups\production-updates'
  [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
  $timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
  $backupPath = $null
  if ($pendingMigrations.Count -gt 0) {
    $backupPath = Join-Path $backupDirectory "velora-production-pre-update-$timestamp.sql"
    Invoke-Checked {
      & node $wrangler d1 export $databaseName --remote '--env=' --config $wranglerConfig --output $backupPath --skip-confirmation
    } 'Production D1 backup failed. Migration and deployment were not attempted.'

    Write-Host 'Applying the reviewed additive migration.' -ForegroundColor Yellow
    Invoke-Checked {
      & node $wrangler d1 migrations apply $databaseName --remote '--env=' --config $wranglerConfig
    } 'Production migration failed. Worker deployment was not attempted.'
  }
  else {
    Write-Host 'The reviewed migration is already applied; continuing with the Worker deployment.' -ForegroundColor DarkGray
  }

  $remainingOutput = Invoke-WranglerText @(
    'd1', 'migrations', 'list', $databaseName, '--remote', '--env=', '--config', $wranglerConfig
  ) 'Could not verify the applied migration. Worker deployment was not attempted.'
  if ($remainingOutput -match '\d{4}_[A-Za-z0-9_\-]+\.sql') {
    throw 'Production still reports pending migrations. Worker deployment was not attempted.'
  }

  Write-Host 'Deploying the verified Worker without changing Telegram configuration.' -ForegroundColor Yellow
  $releaseMessage = "Velora verified production update $timestamp"
  Invoke-Checked {
    & node $wrangler deploy '--env=' --config $wranglerConfig --strict --message $releaseMessage
  } 'Production Worker deployment failed. Telegram webhook was not changed.'

  Assert-Endpoint '/health' 'status' 'ok'
  Assert-Endpoint '/ready' 'status' 'ready'
  Assert-Endpoint '/openapi.json' 'openapi' '3.1.0'

  $integrityOutput = Invoke-WranglerText @(
    'd1', 'execute', $databaseName, '--remote', '--env=', '--config', $wranglerConfig,
    '--command', 'PRAGMA quick_check; PRAGMA foreign_key_check; SELECT COUNT(*) AS migrations FROM d1_migrations;'
  ) 'Production D1 integrity smoke failed after deployment.'
  if (
    $integrityOutput -notmatch '"quick_check"\s*:\s*"ok"' -or
    $integrityOutput -notmatch ('"migrations"\s*:\s*' + [regex]::Escape([string]$expectedMigrationCount))
  ) {
    throw 'Production D1 integrity smoke returned an unexpected result.'
  }

  $releaseRecord = [ordered]@{
    deployedAt = [DateTimeOffset]::UtcNow.ToString('O')
    worker = 'velora-app'
    database = $databaseName
    migrations = $expectedMigrationCount
    backup = $backupPath
    telegramWebhookChanged = $false
    health = 'PASS'
    ready = 'PASS'
    openapi = 'PASS'
    d1Integrity = 'PASS'
  }
  $recordPath = Join-Path $backupDirectory "release-$timestamp.json"
  [IO.File]::WriteAllText(
    $recordPath,
    ($releaseRecord | ConvertTo-Json -Depth 4),
    [Text.UTF8Encoding]::new($false)
  )
  Write-Host "Production update completed. Evidence: $recordPath" -ForegroundColor Green
}
catch {
  Write-Host "Production update stopped: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Telegram webhook was not changed by this script.' -ForegroundColor DarkGray
  exit 1
}
finally {
  $env:CLOUDFLARE_API_TOKEN = $null
  $env:CLOUDFLARE_ACCOUNT_ID = $null
}
