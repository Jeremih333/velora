param(
  [ValidateSet("staging", "production")]
  [string]$Environment = "staging",
  [switch]$ConfirmProduction
)

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
Set-Location -LiteralPath $projectRoot
$wranglerEnvironmentArgument = if ($Environment -eq "production") { '--env=' } else { "--env=$Environment" }

if ($Environment -eq "production" -and -not $ConfirmProduction) {
  throw "Production requires the explicit -ConfirmProduction checkpoint."
}

$secureKey = Read-Host "Вставьте API-ключ BotHub (ввод скрыт)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$plainKey = $null
try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($plainKey) -or $plainKey.Length -lt 16) {
    throw "API-ключ BotHub выглядит некорректно. Секрет не был сохранён."
  }

  $env:CLOUDFLARE_API_TOKEN = $null
  $env:CLOUDFLARE_ACCOUNT_ID = "9d1b271d6aec48ab5d8f595d1d3fac61"
  $plainKey | corepack pnpm --filter @velora/api exec wrangler secret put BOTHUB_API_KEY $wranglerEnvironmentArgument
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler не смог сохранить BOTHUB_API_KEY для $Environment."
  }
  Write-Output "BOTHUB_API_KEY безопасно сохранён в Cloudflare для $Environment. Значение не выведено."
}
finally {
  $plainKey = $null
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}
