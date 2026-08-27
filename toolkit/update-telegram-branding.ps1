param([string]$BotUsername = 'aivel0ra_bot')

$ErrorActionPreference = 'Stop'
$projectRoot = & (Join-Path $PSScriptRoot 'assert-boundary.ps1')
. (Join-Path $PSScriptRoot 'velora-secret-store.ps1')
$token = Get-VeloraStoredSecret 'TELEGRAM_BOT_TOKEN'
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'TELEGRAM_BOT_TOKEN is absent from the local DPAPI store.'
}

$avatarPath = Join-Path $projectRoot 'toolkit\veloraai-telegram-avatar.jpg'
if (-not (Test-Path -LiteralPath $avatarPath)) { throw 'Telegram avatar asset is missing.' }

try {
  $env:TELEGRAM_BOT_TOKEN = $token
  $env:TELEGRAM_BOT_USERNAME = $BotUsername
  $env:TELEGRAM_AVATAR_PATH = $avatarPath
  $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  & node (Join-Path $PSScriptRoot 'update-telegram-branding.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Telegram branding update failed.' }
}
finally {
  Remove-Item Env:TELEGRAM_BOT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:TELEGRAM_BOT_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:TELEGRAM_AVATAR_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
}
