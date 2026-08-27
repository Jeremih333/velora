$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
. (Join-Path $PSScriptRoot "velora-secret-store.ps1")
Set-Location -LiteralPath $projectRoot

Write-Host "VeloraAI: Lena Tikhonova" -ForegroundColor Cyan
Write-Host "Paste the BotFather token. Input is hidden." -ForegroundColor White
Write-Host "Telegram validates it before Windows DPAPI stores it outside Git." -ForegroundColor DarkGray
$secureToken = Read-Host "Bot token" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plainToken -notmatch '^\d{6,15}:[A-Za-z0-9_-]{30,}$') {
    throw "Invalid BotFather token format. Nothing was stored."
  }
  Set-VeloraStoredSecret "LENA_CHARACTER_BOT_TOKEN" $secureToken
  Write-Host "Token encrypted with Windows DPAPI." -ForegroundColor Green
  Write-Host "Checking the token with Telegram..." -ForegroundColor Yellow
  $env:LENA_CHARACTER_BOT_TOKEN_CHECK = $plainToken
  $identityJson = & node (Join-Path $PSScriptRoot "validate-telegram-bot-token.mjs")
  if ($LASTEXITCODE -ne 0) {
    Remove-VeloraStoredSecret "LENA_CHARACTER_BOT_TOKEN"
    throw "Telegram did not confirm this bot token. The stored value was removed."
  }
  $identity = $identityJson | ConvertFrom-Json
  Write-Host ("Telegram confirmed @" + $identity.username + ".") -ForegroundColor Green
} finally {
  Remove-Item Env:LENA_CHARACTER_BOT_TOKEN_CHECK -ErrorAction SilentlyContinue
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $plainToken = $null
}
Write-Host "Done. Lena's token is encrypted for the current Windows account." -ForegroundColor Green
Write-Host "Close this window and tell Codex: done." -ForegroundColor Cyan
Read-Host "Press Enter to close"
