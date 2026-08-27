$ErrorActionPreference = "Continue"

try {
  & (Join-Path $PSScriptRoot "capture-katya-bot-token.ps1")
} catch {
  Write-Host ""
  Write-Host "Could not store Katya's token:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close this window"
