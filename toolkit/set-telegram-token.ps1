param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
$apiRoot = Join-Path $projectRoot "apps\api"
$wrangler = Join-Path $apiRoot "node_modules\wrangler\bin\wrangler.js"

Write-Host "Velora: безопасная установка Telegram Bot Token" -ForegroundColor Cyan
Write-Host "Среда: $Environment. Введённое значение не отображается и не сохраняется локально."
$secureToken = Read-Host "Вставьте токен нового Velora-бота" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plainToken -notmatch '^\d{6,12}:[A-Za-z0-9_-]{30,}$') {
    throw "Формат токена не похож на токен BotFather. Секрет не изменён."
  }

  $env:CLOUDFLARE_API_TOKEN = $null
  $env:CLOUDFLARE_ACCOUNT_ID = "9d1b271d6aec48ab5d8f595d1d3fac61"
  $plainToken | & node $wrangler secret put TELEGRAM_BOT_TOKEN --env $Environment --config (Join-Path $apiRoot "wrangler.jsonc")
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler не смог установить секрет."
  }
  Write-Host "Токен Velora безопасно установлен в Cloudflare $Environment." -ForegroundColor Green
}
finally {
  $plainToken = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

Read-Host "Нажмите Enter, чтобы закрыть окно"
