param(
  [string]$Environment = "staging",
  [string]$BotUsername = "aivel0ra_bot",
  [string]$PublicAppUrl = "https://velora-staging.carreljeremih.workers.dev"
)

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
$apiRoot = Join-Path $projectRoot "apps\api"
$wrangler = Join-Path $apiRoot "node_modules\wrangler\bin\wrangler.js"
$configureScript = Join-Path $PSScriptRoot "configure-telegram.mjs"
$pointer = [IntPtr]::Zero
$plainToken = $null
$webhookSecret = $null

try {
  Write-Host "Velora: безопасная настройка Telegram Bot API" -ForegroundColor Cyan
  Write-Host "Бот: @$BotUsername; среда: $Environment"
  Write-Host "Токен и webhook-secret не отображаются и не сохраняются локально."
  $secureToken = Read-Host "Повторно вставьте токен BotFather" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

  if ($plainToken -notmatch '^\d{6,12}:[A-Za-z0-9_-]{30,}$') {
    throw "Формат значения не похож на токен BotFather. Настройка остановлена."
  }
  if ($BotUsername -notmatch '^[A-Za-z0-9_]{5,32}$') {
    throw "Username бота недействителен."
  }

  # Совместимо с Windows PowerShell 5.1: статический GetBytes(Int32) там недоступен.
  $randomBytes = New-Object byte[] 36
  $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $randomGenerator.GetBytes($randomBytes)
  }
  finally {
    $randomGenerator.Dispose()
  }
  $webhookSecret = [Convert]::ToBase64String($randomBytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
  $env:CLOUDFLARE_API_TOKEN = $null
  $env:CLOUDFLARE_ACCOUNT_ID = "9d1b271d6aec48ab5d8f595d1d3fac61"

  $plainToken | & node $wrangler secret put TELEGRAM_BOT_TOKEN --env $Environment --config (Join-Path $apiRoot "wrangler.jsonc")
  if ($LASTEXITCODE -ne 0) { throw "Не удалось установить Telegram token в Cloudflare." }
  $webhookSecret | & node $wrangler secret put TELEGRAM_WEBHOOK_SECRET --env $Environment --config (Join-Path $apiRoot "wrangler.jsonc")
  if ($LASTEXITCODE -ne 0) { throw "Не удалось установить webhook secret в Cloudflare." }

  $env:TELEGRAM_BOT_TOKEN = $plainToken
  $env:TELEGRAM_WEBHOOK_SECRET = $webhookSecret
  $env:TELEGRAM_BOT_USERNAME = $BotUsername
  $env:PUBLIC_APP_URL = $PublicAppUrl
  & node $configureScript --apply
  if ($LASTEXITCODE -ne 0) { throw "Telegram Bot API не подтвердил настройку." }

  Write-Host "Velora Bot API, команды, меню и webhook настроены." -ForegroundColor Green
}
catch {
  Write-Host "Ошибка настройки: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Секретные значения в сообщении не выводятся." -ForegroundColor DarkGray
}
finally {
  $env:TELEGRAM_BOT_TOKEN = $null
  $env:TELEGRAM_WEBHOOK_SECRET = $null
  $plainToken = $null
  $webhookSecret = $null
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

Read-Host "Нажмите Enter, чтобы закрыть окно"
