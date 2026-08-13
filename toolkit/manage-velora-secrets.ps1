param(
  [ValidateSet("Set", "List", "Remove")][string]$Action = "Set",
  [ValidateSet("TELEGRAM_BOT_TOKEN", "BOTHUB_API_KEY", "CLOUDFLARE_API_TOKEN")][string]$Name
)

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
. (Join-Path $PSScriptRoot "velora-secret-store.ps1")
Set-Location -LiteralPath $projectRoot

if ($Action -eq "List") {
  $names = @(Get-VeloraStoredSecretNames)
  if ($names.Count -eq 0) { Write-Host "The local Velora secret store is empty." -ForegroundColor Yellow }
  else {
    Write-Host "Stored names (values are never displayed):" -ForegroundColor Cyan
    $names | ForEach-Object { Write-Host "  - $_" -ForegroundColor Green }
  }
  exit 0
}
if ([string]::IsNullOrWhiteSpace($Name)) { throw "Specify -Name for Action=$Action." }
if ($Action -eq "Remove") {
  Remove-VeloraStoredSecret $Name
  Write-Host "$Name was removed from the local Velora secret store." -ForegroundColor Yellow
  exit 0
}
$value = Read-Host "Enter $Name (hidden input)" -AsSecureString
Set-VeloraStoredSecret $Name $value
Write-Host "$Name is encrypted for the current Windows account." -ForegroundColor Green
Write-Host "File: $(Get-VeloraSecretStorePath)" -ForegroundColor DarkGray
