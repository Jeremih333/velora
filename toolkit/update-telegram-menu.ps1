param(
  [string]$BotUsername = 'aivel0ra_bot',
  [string]$PublicAppUrl = 'https://velora-app.carreljeremih.workers.dev',
  [string]$CacheVersion = '20260822-2'
)

$ErrorActionPreference = 'Stop'
$projectRoot = & (Join-Path $PSScriptRoot 'assert-boundary.ps1')
. (Join-Path $PSScriptRoot 'velora-secret-store.ps1')
Set-Location -LiteralPath $projectRoot
$token = Get-VeloraStoredSecret 'TELEGRAM_BOT_TOKEN'
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'TELEGRAM_BOT_TOKEN is absent from the local DPAPI store.'
}
if ($CacheVersion -notmatch '^[A-Za-z0-9._-]{1,64}$') {
  throw 'CacheVersion contains unsupported characters.'
}
try {
  $env:TELEGRAM_BOT_TOKEN = $token
  $env:TELEGRAM_BOT_USERNAME = $BotUsername
  $env:PUBLIC_APP_URL = $PublicAppUrl
  $env:WEB_APP_CACHE_VERSION = $CacheVersion
  $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  & node (Join-Path $PSScriptRoot 'update-telegram-menu.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Telegram menu update failed.' }
}
finally {
  Remove-Item Env:TELEGRAM_BOT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:TELEGRAM_BOT_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:PUBLIC_APP_URL -ErrorAction SilentlyContinue
  Remove-Item Env:WEB_APP_CACHE_VERSION -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
}
