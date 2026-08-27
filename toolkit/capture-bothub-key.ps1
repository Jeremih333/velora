$ErrorActionPreference = 'Stop'
$projectRoot = & (Join-Path $PSScriptRoot 'assert-boundary.ps1')
. (Join-Path $PSScriptRoot 'velora-secret-store.ps1')
Set-Location -LiteralPath $projectRoot

$secureKey = Read-Host 'BotHub API key (hidden)' -AsSecureString
if ($null -eq $secureKey -or $secureKey.Length -lt 16) {
  throw 'BotHub API key looks invalid and was not saved.'
}
Set-VeloraStoredSecret 'BOTHUB_API_KEY' $secureKey
Write-Host 'BotHub API key was encrypted with Windows DPAPI. Its value was not printed.' -ForegroundColor Green
Write-Host 'Tell Codex: done.' -ForegroundColor Cyan
Read-Host 'Press Enter to close'
