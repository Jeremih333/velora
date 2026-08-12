param(
  [ValidateSet("staging", "telegram-test", "production")]
  [string]$Environment = "staging",
  [string]$BotUsername = "aivel0ra_bot",
  [string]$PublicAppUrl = "https://velora-staging.carreljeremih.workers.dev",
  [switch]$ConfirmProductionCutover
)

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
$apiRoot = Join-Path $projectRoot "apps\api"
$wranglerConfig = Join-Path $apiRoot "wrangler.jsonc"
$wrangler = Join-Path $apiRoot "node_modules\wrangler\bin\wrangler.js"
$configureScript = Join-Path $PSScriptRoot "configure-telegram.mjs"
$apiEnvironment = if ($Environment -eq "telegram-test") { "test" } else { "production" }
$wranglerEnvironmentArgument = if ($Environment -eq "production") { '--env=' } else { "--env=$Environment" }
$pointer = [IntPtr]::Zero
$plainToken = $null
$webhookSecret = $null
$sessionSigningKey = $null

function New-UrlSafeSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) }
  finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

try {
  Write-Host "Velora: secure Telegram Bot API setup" -ForegroundColor Cyan
  Write-Host "Bot: @$BotUsername; Worker environment: $Environment; Telegram API: $apiEnvironment"
  Write-Host "The token and generated secrets are never printed or stored in local files."

  if ($BotUsername -notmatch '^[A-Za-z0-9_]{5,32}$') {
    throw "Invalid Telegram bot username."
  }
  if ($Environment -eq "production") {
    if (-not $ConfirmProductionCutover) {
      throw "Production Telegram cutover requires -ConfirmProductionCutover. The bot has one webhook and staging will stop receiving updates."
    }
    if ($PublicAppUrl -ne "https://velora-app.carreljeremih.workers.dev") {
      throw "Production cutover must use the isolated velora-app URL."
    }
  }
  if ($Environment -eq "telegram-test") {
    if ($BotUsername -eq "aivel0ra_bot" -or $BotUsername -eq "velora_test_pending_bot") {
      throw "Create a separate Test Server bot and place its real username in wrangler.jsonc first."
    }
    if ($PublicAppUrl -ne "https://velora-telegram-test.carreljeremih.workers.dev") {
      throw "The telegram-test Worker must use its isolated velora-telegram-test URL."
    }
  }

  $configSource = Get-Content -LiteralPath $wranglerConfig -Raw
  if ($configSource -notmatch ('"TELEGRAM_BOT_USERNAME"\s*:\s*"' + [Regex]::Escape($BotUsername) + '"')) {
    throw "wrangler.jsonc does not contain the requested bot username. Update and review it first."
  }

  $secureToken = Read-Host "Paste the BotFather token (hidden input)" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plainToken -notmatch '^\d{6,12}:[A-Za-z0-9_-]{30,}$') {
    throw "The value does not look like a BotFather token. Nothing was changed."
  }

  $webhookSecret = New-UrlSafeSecret 36
  $sessionSigningKey = New-UrlSafeSecret 48
  $env:TELEGRAM_BOT_TOKEN = $plainToken
  $env:TELEGRAM_WEBHOOK_SECRET = $webhookSecret
  $env:TELEGRAM_BOT_USERNAME = $BotUsername
  $env:TELEGRAM_API_ENVIRONMENT = $apiEnvironment
  $env:PUBLIC_APP_URL = $PublicAppUrl

  & node $configureScript
  if ($LASTEXITCODE -ne 0) { throw "Telegram configuration dry-run failed." }
  & node $configureScript --check-identity
  if ($LASTEXITCODE -ne 0) { throw "The Bot API did not confirm this bot identity." }

  $env:CLOUDFLARE_API_TOKEN = $null
  $env:CLOUDFLARE_ACCOUNT_ID = "9d1b271d6aec48ab5d8f595d1d3fac61"
  $webhookSecret | & node $wrangler secret put TELEGRAM_WEBHOOK_SECRET $wranglerEnvironmentArgument --config $wranglerConfig
  if ($LASTEXITCODE -ne 0) { throw "Could not install TELEGRAM_WEBHOOK_SECRET." }
  $sessionSigningKey | & node $wrangler secret put SESSION_SIGNING_KEY $wranglerEnvironmentArgument --config $wranglerConfig
  if ($LASTEXITCODE -ne 0) { throw "Could not install SESSION_SIGNING_KEY." }
  $plainToken | & node $wrangler secret put TELEGRAM_BOT_TOKEN $wranglerEnvironmentArgument --config $wranglerConfig
  if ($LASTEXITCODE -ne 0) { throw "Could not install TELEGRAM_BOT_TOKEN." }

  & node $wrangler deploy $wranglerEnvironmentArgument --config $wranglerConfig
  if ($LASTEXITCODE -ne 0) { throw "The isolated Worker deployment failed." }
  & node $configureScript --apply
  if ($LASTEXITCODE -ne 0) { throw "Telegram rejected webhook/menu configuration." }

  Write-Host "Velora Telegram setup completed for @$BotUsername in $Environment." -ForegroundColor Green
}
catch {
  Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Secret values were not printed." -ForegroundColor DarkGray
  exit 1
}
finally {
  $env:TELEGRAM_BOT_TOKEN = $null
  $env:TELEGRAM_WEBHOOK_SECRET = $null
  $env:TELEGRAM_BOT_USERNAME = $null
  $env:TELEGRAM_API_ENVIRONMENT = $null
  $env:PUBLIC_APP_URL = $null
  $plainToken = $null
  $webhookSecret = $null
  $sessionSigningKey = $null
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}
