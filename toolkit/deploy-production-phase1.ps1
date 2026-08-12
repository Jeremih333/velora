param(
  [switch]$ConfirmProductionDeployment
)

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
$apiRoot = Join-Path $projectRoot "apps\api"
$wranglerConfig = Join-Path $apiRoot "wrangler.jsonc"
$wrangler = Join-Path $apiRoot "node_modules\wrangler\bin\wrangler.js"
$preflight = Join-Path $PSScriptRoot "production-preflight.mjs"
$telegramConfigurator = Join-Path $PSScriptRoot "configure-telegram.mjs"
$publicAppUrl = "https://velora-app.carreljeremih.workers.dev"
$accountId = "9d1b271d6aec48ab5d8f595d1d3fac61"
$botUsername = "aivel0ra_bot"
$temporaryDirectory = $null
$secretFile = $null
$telegramPointer = [IntPtr]::Zero
$bothubPointer = [IntPtr]::Zero
$telegramToken = $null
$bothubKey = $null
$sessionSigningKey = $null
$webhookSecret = $null

function New-UrlSafeSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) }
  finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Invoke-Checked([scriptblock]$Command, [string]$FailureMessage) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

function Assert-HttpJson([string]$Url, [string]$ExpectedText) {
  $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 15 -UseBasicParsing
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch $ExpectedText) {
    throw "Production smoke failed for $Url."
  }
}

if (-not $ConfirmProductionDeployment) {
  throw "Phase 1 requires -ConfirmProductionDeployment. It migrates velora-production and creates velora-app, but does not move the Telegram webhook."
}

try {
  Set-Location -LiteralPath $projectRoot
  $env:CLOUDFLARE_API_TOKEN = $null
  $env:CLOUDFLARE_ACCOUNT_ID = $accountId

  Write-Host "Velora production phase 1: preflight and local gate" -ForegroundColor Cyan
  $preflightOutput = & node $preflight --remote | Out-String
  if ($LASTEXITCODE -ne 0) { throw "Production preflight failed. Nothing was migrated or deployed." }
  $preflightState = $preflightOutput | ConvertFrom-Json
  if ($preflightState.remote.productionWorkerExists -ne $false) {
    throw "velora-app already exists. Phase 1 is intentionally first-deploy only."
  }
  if (@($preflightState.remote.pendingMigrationNames).Count -ne 28) {
    throw "Production D1 is not in the reviewed initial 28-pending-migration state."
  }
  if (@($preflightState.remote.missingSecretNames).Count -ne 4) {
    throw "Production secrets are not in the reviewed initial empty state."
  }
  Invoke-Checked { & (Join-Path $PSScriptRoot "verify.ps1") } "The local quality gate failed. Nothing was migrated or deployed."

  $secureTelegramToken = Read-Host "Paste the @aivel0ra_bot BotFather token (hidden)" -AsSecureString
  $telegramPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureTelegramToken)
  $telegramToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($telegramPointer)
  if ($telegramToken -notmatch '^\d{6,12}:[A-Za-z0-9_-]{30,}$') {
    throw "The Telegram token format is invalid. Nothing was migrated or deployed."
  }

  $secureBothubKey = Read-Host "Paste the BotHub API key (hidden)" -AsSecureString
  $bothubPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureBothubKey)
  $bothubKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bothubPointer)
  if ([string]::IsNullOrWhiteSpace($bothubKey) -or $bothubKey.Length -lt 16) {
    throw "The BotHub key format is invalid. Nothing was migrated or deployed."
  }

  $sessionSigningKey = New-UrlSafeSecret 48
  $webhookSecret = New-UrlSafeSecret 36
  $env:TELEGRAM_BOT_TOKEN = $telegramToken
  $env:TELEGRAM_WEBHOOK_SECRET = $webhookSecret
  $env:TELEGRAM_BOT_USERNAME = $botUsername
  $env:TELEGRAM_API_ENVIRONMENT = "production"
  $env:PUBLIC_APP_URL = $publicAppUrl

  Invoke-Checked { & node $telegramConfigurator } "Telegram configuration dry-run failed. Nothing was migrated or deployed."
  Invoke-Checked { & node $telegramConfigurator --check-identity } "Telegram did not confirm @aivel0ra_bot. Nothing was migrated or deployed."
  $bothubModels = Invoke-RestMethod -Uri "https://openai.bothub.chat/v1/models" -Method Get -TimeoutSec 20 -Headers @{ Authorization = "Bearer $bothubKey" }
  if ($null -eq $bothubModels.data -or @($bothubModels.data).Count -eq 0) {
    throw "BotHub authenticated but returned no model capabilities. Nothing was migrated or deployed."
  }
  Invoke-Checked { corepack pnpm --filter @velora/web build } "The production web build failed. Nothing was migrated or deployed."

  $backupDirectory = Join-Path $PSScriptRoot "backups"
  [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
  $backupTimestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
  $backupPath = Join-Path $backupDirectory "velora-production-pre-phase1-$backupTimestamp.sql"
  Invoke-Checked {
    & node $wrangler d1 export velora-production --remote '--env=' --config $wranglerConfig --output $backupPath --skip-confirmation
  } "Production D1 backup failed. Nothing was migrated or deployed."

  Write-Host "Applying the reviewed 28-migration sequence to isolated velora-production..." -ForegroundColor Yellow
  Invoke-Checked {
    & node $wrangler d1 migrations apply velora-production --remote '--env=' --config $wranglerConfig
  } "Production D1 migration failed. The Worker was not deployed."

  $temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("velora-production-" + [Guid]::NewGuid().ToString('N'))
  [IO.Directory]::CreateDirectory($temporaryDirectory) | Out-Null
  $secretFile = Join-Path $temporaryDirectory "secrets.json"
  $secretPayload = [ordered]@{
    BOTHUB_API_KEY = $bothubKey
    SESSION_SIGNING_KEY = $sessionSigningKey
    TELEGRAM_BOT_TOKEN = $telegramToken
    TELEGRAM_WEBHOOK_SECRET = $webhookSecret
  } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($secretFile, $secretPayload, [Text.UTF8Encoding]::new($false))

  Write-Host "Deploying the first production Worker version with all secrets atomically..." -ForegroundColor Yellow
  Invoke-Checked {
    & node $wrangler deploy '--env=' --config $wranglerConfig --secrets-file $secretFile --strict --message "Velora production phase 1; paid gates disabled"
  } "Production Worker deployment failed. Telegram webhook remains on staging."

  Assert-HttpJson "$publicAppUrl/health" '"status"\s*:\s*"ok"'
  Assert-HttpJson "$publicAppUrl/ready" '"status"\s*:\s*"ready"'
  Assert-HttpJson "$publicAppUrl/openapi.json" '"openapi"\s*:\s*"3\.1\.0"'
  $integrityOutput = & node $wrangler d1 execute velora-production --remote '--env=' --config $wranglerConfig --command "PRAGMA quick_check; PRAGMA foreign_key_check; SELECT COUNT(*) AS migrations FROM d1_migrations;" | Out-String
  if ($LASTEXITCODE -ne 0 -or $integrityOutput -notmatch '"quick_check"\s*:\s*"ok"' -or $integrityOutput -notmatch '"migrations"\s*:\s*28') {
    throw "Production D1 integrity smoke failed. Telegram webhook remains on staging."
  }

  Write-Host "Production phase 1 completed. Telegram webhook is still on staging; paid AI and payments remain disabled." -ForegroundColor Green
}
catch {
  Write-Host "Production phase 1 stopped: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Telegram webhook was not changed by this script." -ForegroundColor DarkGray
  exit 1
}
finally {
  $env:TELEGRAM_BOT_TOKEN = $null
  $env:TELEGRAM_WEBHOOK_SECRET = $null
  $env:TELEGRAM_BOT_USERNAME = $null
  $env:TELEGRAM_API_ENVIRONMENT = $null
  $env:PUBLIC_APP_URL = $null
  $telegramToken = $null
  $bothubKey = $null
  $sessionSigningKey = $null
  $webhookSecret = $null
  if ($telegramPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($telegramPointer)
  }
  if ($bothubPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bothubPointer)
  }
  if ($secretFile -and (Test-Path -LiteralPath $secretFile)) {
    Remove-Item -LiteralPath $secretFile -Force
  }
  if ($temporaryDirectory -and (Test-Path -LiteralPath $temporaryDirectory)) {
    Remove-Item -LiteralPath $temporaryDirectory -Force
  }
}
