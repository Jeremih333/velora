param([string]$PublicAppUrl = "https://velora-app.danya5sitnikov.workers.dev")

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
. (Join-Path $PSScriptRoot "velora-secret-store.ps1")
Set-Location -LiteralPath $projectRoot

function New-UrlSafeSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) }
  finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

$telegramToken = Get-VeloraStoredSecret "TELEGRAM_BOT_TOKEN"
$bothubKey = Get-VeloraStoredSecret "BOTHUB_API_KEY"
$childKey = Get-VeloraStoredSecret "CHILD_BOT_ENCRYPTION_KEY"
if ([string]::IsNullOrWhiteSpace($telegramToken) -or [string]::IsNullOrWhiteSpace($bothubKey) -or [string]::IsNullOrWhiteSpace($childKey)) {
  throw "Required protected production secrets are unavailable."
}

$sessionKey = Get-VeloraStoredSecret "SECONDARY_SESSION_SIGNING_KEY"
if ([string]::IsNullOrWhiteSpace($sessionKey)) {
  $sessionKey = New-UrlSafeSecret 48
  Set-VeloraStoredSecret "SECONDARY_SESSION_SIGNING_KEY" (ConvertTo-SecureString $sessionKey -AsPlainText -Force)
}
$webhookSecret = Get-VeloraStoredSecret "SECONDARY_TELEGRAM_WEBHOOK_SECRET"
if ([string]::IsNullOrWhiteSpace($webhookSecret)) {
  $webhookSecret = New-UrlSafeSecret 36
  Set-VeloraStoredSecret "SECONDARY_TELEGRAM_WEBHOOK_SECRET" (ConvertTo-SecureString $webhookSecret -AsPlainText -Force)
}

$apiRoot = Join-Path $projectRoot "apps\api"
$sourceConfig = Join-Path $apiRoot "wrangler.jsonc"
$secondaryConfig = Join-Path $apiRoot "wrangler.secondary.generated.jsonc"
$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ("velora-secondary-shadow-" + [Guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($taskTemp) | Out-Null
$secretFile = Join-Path $taskTemp "secrets.json"

try {
  node toolkit/build-secondary-wrangler.mjs $sourceConfig $secondaryConfig $PublicAppUrl
  if ($LASTEXITCODE -ne 0) { throw "Secondary Wrangler config generation failed." }
  & corepack pnpm --filter @velora/web build
  if ($LASTEXITCODE -ne 0) { throw "Web build failed; shadow Worker was not deployed." }

  $payload = [ordered]@{
    BOTHUB_API_KEY = $bothubKey
    CHILD_BOT_ENCRYPTION_KEY = $childKey
    SESSION_SIGNING_KEY = $sessionKey
    TELEGRAM_BOT_TOKEN = $telegramToken
    TELEGRAM_WEBHOOK_SECRET = $webhookSecret
  } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($secretFile, $payload, [Text.UTF8Encoding]::new($false))

  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
  $env:CLOUDFLARE_ACCOUNT_ID = "aa0a32cd6c75f48ff223c0e3458139d7"
  $env:XDG_CONFIG_HOME = Join-Path $env:LOCALAPPDATA "Velora\cloudflare-secondary-config"
  $wrangler = Join-Path $apiRoot "node_modules\wrangler\bin\wrangler.js"
  & node $wrangler deploy --config $secondaryConfig --secrets-file $secretFile --strict --message "Velora secondary shadow; webhook unchanged"
  if ($LASTEXITCODE -ne 0) { throw "Secondary shadow Worker deployment failed." }
}
finally {
  $telegramToken = $null
  $bothubKey = $null
  $childKey = $null
  $sessionKey = $null
  $webhookSecret = $null
  Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:XDG_CONFIG_HOME -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $secondaryConfig) { Remove-Item -LiteralPath $secondaryConfig -Force }
  if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile -Force }
  $resolvedTemp = [IO.Path]::GetFullPath($taskTemp)
  $resolvedBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
