$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
. (Join-Path $PSScriptRoot "velora-secret-store.ps1")
Set-Location -LiteralPath $projectRoot

Write-Host "VeloraAI: Alice Dvachevskaya" -ForegroundColor Cyan
Write-Host "Paste the BotFather token. Input is hidden." -ForegroundColor White
Write-Host "The value is validated by Telegram and stored with Windows DPAPI outside Git." -ForegroundColor DarkGray
$secureToken = Read-Host "Bot token" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plainToken -notmatch '^\d{6,15}:[A-Za-z0-9_-]{30,}$') {
    throw "Invalid BotFather token format. Nothing was stored."
  }
  $identity = Invoke-RestMethod -Method Get -Uri ("https://api.telegram.org/bot" + $plainToken + "/getMe")
  if (-not $identity.ok -or -not $identity.result.is_bot) {
    throw "Telegram did not confirm this bot token. Nothing was stored."
  }
  Write-Host ("Telegram confirmed @" + $identity.result.username + ".") -ForegroundColor Green
  Set-VeloraStoredSecret "ALICE_CHARACTER_BOT_TOKEN" $secureToken
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $plainToken = $null
}
Write-Host "Done. The Alice token is encrypted for the current Windows account." -ForegroundColor Green
Write-Host "Close this window and tell Codex: done." -ForegroundColor Cyan
Read-Host "Press Enter to close"
