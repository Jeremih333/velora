$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
. (Join-Path $PSScriptRoot "velora-secret-store.ps1")
Set-Location -LiteralPath $projectRoot

Write-Host "VeloraAI: Katya / Cold Embrace" -ForegroundColor Cyan
Write-Host "Paste the BotFather token. Input is hidden." -ForegroundColor White
Write-Host "Telegram validates it before Windows DPAPI stores it outside Git." -ForegroundColor DarkGray
$secureToken = Read-Host "Bot token" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plainToken -notmatch '^\d{6,15}:[A-Za-z0-9_-]{30,}$') {
    throw "Invalid BotFather token format. Nothing was stored."
  }
  $env:KATYA_CHARACTER_BOT_TOKEN_CHECK = $plainToken
  $identityJson = & node (Join-Path $PSScriptRoot "validate-telegram-bot-token.mjs") "KATYA_CHARACTER_BOT_TOKEN_CHECK"
  if ($LASTEXITCODE -ne 0) { throw "Telegram did not confirm this bot token. Nothing was stored." }
  $identity = $identityJson | ConvertFrom-Json
  Set-VeloraStoredSecret "KATYA_CHARACTER_BOT_TOKEN" $secureToken
  Write-Host "Token encrypted with Windows DPAPI." -ForegroundColor Green
  Write-Host ("Telegram confirmed @" + $identity.username + ".") -ForegroundColor Green
} finally {
  Remove-Item Env:KATYA_CHARACTER_BOT_TOKEN_CHECK -ErrorAction SilentlyContinue
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $plainToken = $null
}
Write-Host "Done. Katya's token is encrypted for the current Windows account." -ForegroundColor Green
Write-Host "Close this window and tell Codex: done." -ForegroundColor Cyan
Read-Host "Press Enter to close"
