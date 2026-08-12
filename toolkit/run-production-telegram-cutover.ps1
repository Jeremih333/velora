$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
$statusFile = Join-Path $projectRoot ".phase2-status.json"

Set-Location -LiteralPath $projectRoot
& (Join-Path $PSScriptRoot "cutover-production-telegram.ps1") `
  -ConfirmProductionWebhookCutover `
  -StatusFile $statusFile
$code = $LASTEXITCODE

Write-Host ""
$color = if ($code -eq 0) { "Green" } else { "Red" }
Write-Host "PHASE 2 завершена, код $code" -ForegroundColor $color
Read-Host "Нажмите Enter после сообщения Codex, чтобы закрыть вкладку" | Out-Null
exit $code
