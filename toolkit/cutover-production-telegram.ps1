param(
  [switch]$ConfirmProductionWebhookCutover
)

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
$apiRoot = Join-Path $projectRoot "apps\api"
$wranglerConfig = Join-Path $apiRoot "wrangler.jsonc"
$wrangler = Join-Path $apiRoot "node_modules\wrangler\bin\wrangler.js"
$preflight = Join-Path $PSScriptRoot "production-preflight.mjs"
$telegramConfigurator = Join-Path $PSScriptRoot "configure-telegram.mjs"
$productionUrl = "https://velora-app.carreljeremih.workers.dev"
$stagingUrl = "https://velora-staging.carreljeremih.workers.dev"
$accountId = "9d1b271d6aec48ab5d8f595d1d3fac61"
$botUsername = "aivel0ra_bot"
$temporaryDirectory = $null
$productionSecretFile = $null
$stagingSecretFile = $null
$telegramPointer = [IntPtr]::Zero
$telegramToken = $null
$productionWebhookSecret = $null
$stagingWebhookSecret = $null
$applyStarted = $false

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

function Set-TelegramEnvironment([string]$PublicUrl, [string]$WebhookSecret) {
  $env:TELEGRAM_BOT_TOKEN = $telegramToken
  $env:TELEGRAM_WEBHOOK_SECRET = $WebhookSecret
  $env:TELEGRAM_BOT_USERNAME = $botUsername
  $env:TELEGRAM_API_ENVIRONMENT = "production"
  $env:PUBLIC_APP_URL = $PublicUrl
}

function Write-SecretFile([string]$Path, [string]$WebhookSecret) {
  $payload = [ordered]@{
    TELEGRAM_BOT_TOKEN = $telegramToken
    TELEGRAM_WEBHOOK_SECRET = $WebhookSecret
  } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($Path, $payload, [Text.UTF8Encoding]::new($false))
}

function Restore-StagingWebhook {
  & node $wrangler secret bulk $stagingSecretFile '--env=staging' --config $wranglerConfig
  if ($LASTEXITCODE -ne 0) { throw "Automatic rollback could not update the staging webhook secret." }
  Set-TelegramEnvironment $stagingUrl $stagingWebhookSecret
  & node $telegramConfigurator --apply | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Automatic rollback could not restore the staging webhook." }
}

if (-not $ConfirmProductionWebhookCutover) {
  throw "Phase 2 requires -ConfirmProductionWebhookCutover. It moves @aivel0ra_bot from staging to production."
}

try {
  Set-Location -LiteralPath $projectRoot
  $env:CLOUDFLARE_API_TOKEN = $null
  $env:CLOUDFLARE_ACCOUNT_ID = $accountId

  $preflightOutput = & node $preflight --remote | Out-String
  if ($LASTEXITCODE -ne 0) { throw "Production preflight failed. Telegram was not changed." }
  $preflightState = $preflightOutput | ConvertFrom-Json
  if ($preflightState.remote.productionWorkerExists -ne $true) {
    throw "velora-app is not deployed. Complete production phase 1 first."
  }
  if (@($preflightState.remote.pendingMigrationNames).Count -ne 0) {
    throw "Production D1 still has pending migrations. Telegram was not changed."
  }
  if (@($preflightState.remote.missingSecretNames).Count -ne 0) {
    throw "Production Worker does not have all required secrets. Telegram was not changed."
  }

  Invoke-Checked { & (Join-Path $PSScriptRoot "verify.ps1") } "The local quality gate failed. Telegram was not changed."
  $health = Invoke-RestMethod -Uri "$productionUrl/health" -Method Get -TimeoutSec 15
  $readiness = Invoke-RestMethod -Uri "$productionUrl/ready" -Method Get -TimeoutSec 15
  if ($health.status -ne "ok" -or $readiness.status -ne "ready") {
    throw "Production health/readiness failed. Telegram was not changed."
  }

  $secureTelegramToken = Read-Host "Paste the @aivel0ra_bot BotFather token (hidden)" -AsSecureString
  $telegramPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureTelegramToken)
  $telegramToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($telegramPointer)
  if ($telegramToken -notmatch '^\d{6,12}:[A-Za-z0-9_-]{30,}$') {
    throw "The Telegram token format is invalid. Telegram was not changed."
  }

  $productionWebhookSecret = New-UrlSafeSecret 36
  $stagingWebhookSecret = New-UrlSafeSecret 36
  Set-TelegramEnvironment $productionUrl $productionWebhookSecret
  Invoke-Checked { & node $telegramConfigurator } "Telegram configuration dry-run failed. Telegram was not changed."
  Invoke-Checked { & node $telegramConfigurator --check-identity } "Telegram did not confirm @aivel0ra_bot. Telegram was not changed."

  $temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("velora-cutover-" + [Guid]::NewGuid().ToString('N'))
  [IO.Directory]::CreateDirectory($temporaryDirectory) | Out-Null
  $productionSecretFile = Join-Path $temporaryDirectory "production-secrets.json"
  $stagingSecretFile = Join-Path $temporaryDirectory "staging-rollback-secrets.json"
  Write-SecretFile $productionSecretFile $productionWebhookSecret
  Write-SecretFile $stagingSecretFile $stagingWebhookSecret

  Write-Host "Updating the production Telegram secrets as one Cloudflare operation..." -ForegroundColor Yellow
  Invoke-Checked {
    & node $wrangler secret bulk $productionSecretFile '--env=' --config $wranglerConfig
  } "Production Telegram secrets were not updated. The webhook remains on staging."

  $applyStarted = $true
  $configurationOutput = & node $telegramConfigurator --apply | Out-String
  if ($LASTEXITCODE -ne 0) { throw "Telegram rejected the production configuration." }
  $configuration = $configurationOutput | ConvertFrom-Json
  if (
    $configuration.configured -ne $true -or
    $configuration.webhookUrl -ne "$productionUrl/telegram/webhook" -or
    $configuration.menuType -ne "web_app" -or
    [int]$configuration.commandCount -lt 10
  ) {
    throw "Telegram production configuration verification failed."
  }

  Write-Host "Telegram cutover completed and verified for @$botUsername." -ForegroundColor Green
  $applyStarted = $false
}
catch {
  $originalFailure = $_.Exception.Message
  if ($applyStarted -and $telegramToken -and $stagingSecretFile) {
    try {
      Write-Host "Cutover verification failed; restoring the staging webhook..." -ForegroundColor Yellow
      Restore-StagingWebhook
      Write-Host "Staging webhook restored." -ForegroundColor Green
    }
    catch {
      Write-Host "CRITICAL: automatic staging rollback failed: $($_.Exception.Message)" -ForegroundColor Red
      Write-Host "Run the documented manual rollback immediately." -ForegroundColor Red
    }
  }
  Write-Host "Telegram cutover stopped: $originalFailure" -ForegroundColor Red
  exit 1
}
finally {
  $env:TELEGRAM_BOT_TOKEN = $null
  $env:TELEGRAM_WEBHOOK_SECRET = $null
  $env:TELEGRAM_BOT_USERNAME = $null
  $env:TELEGRAM_API_ENVIRONMENT = $null
  $env:PUBLIC_APP_URL = $null
  $telegramToken = $null
  $productionWebhookSecret = $null
  $stagingWebhookSecret = $null
  if ($telegramPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($telegramPointer)
  }
  foreach ($path in @($productionSecretFile, $stagingSecretFile)) {
    if ($path -and (Test-Path -LiteralPath $path)) { Remove-Item -LiteralPath $path -Force }
  }
  if ($temporaryDirectory -and (Test-Path -LiteralPath $temporaryDirectory)) {
    Remove-Item -LiteralPath $temporaryDirectory -Force
  }
}
