$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
. (Join-Path $PSScriptRoot "velora-secret-store.ps1")
Set-Location -LiteralPath $projectRoot

$aliceToken = Get-VeloraStoredSecret "ALICE_CHARACTER_BOT_TOKEN"
$mainToken = Get-VeloraStoredSecret "TELEGRAM_BOT_TOKEN"
if ([string]::IsNullOrWhiteSpace($aliceToken) -or [string]::IsNullOrWhiteSpace($mainToken)) {
  throw "Protected Telegram credentials are unavailable."
}

$avatarHash = "7F6B34C4B2736219771B9D1BA3813BF418DDAACB94AFF3F5A56AFE0FB25D67C4"
$avatarPath = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE "Downloads") -File -Filter "*.png" |
  Where-Object { $_.Length -eq 723883 -and (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -eq $avatarHash } |
  Select-Object -First 1 -ExpandProperty FullName
if ([string]::IsNullOrWhiteSpace($avatarPath) -or -not (Test-Path -LiteralPath $avatarPath -PathType Leaf)) {
  throw "The clean Alice avatar is unavailable."
}

$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ("velora-alice-avatar-" + [Guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($taskTemp) | Out-Null

try {
  $backupJson = & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --json --command "SELECT provider_file_id,provider_unique_id,mime_type,original_name,byte_size,width,height FROM file_objects WHERE id='alice-dvachevskaya-avatar';" 2>$null | Out-String
  if ([string]::IsNullOrWhiteSpace($backupJson)) { throw "Could not capture the previous avatar reference." }

  $backupDirectory = Join-Path $env:LOCALAPPDATA "Velora\backups"
  [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
  $backupPath = Join-Path $backupDirectory ("alice-avatar-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ".dpapi")
  $backupSecure = ConvertTo-SecureString $backupJson -AsPlainText -Force
  [IO.File]::WriteAllText($backupPath, (ConvertFrom-SecureString $backupSecure), [Text.UTF8Encoding]::new($false))
  Set-VeloraSecretFileAcl $backupPath

  $env:ALICE_CHARACTER_BOT_TOKEN = $aliceToken
  $env:TELEGRAM_BOT_TOKEN = $mainToken
  $env:ALICE_AVATAR_JPG = $avatarPath
  $env:ALICE_SQL_OUTPUT = Join-Path $taskTemp "refresh.sql"
  node toolkit/provision-alice.mjs refresh-avatar
  if ($LASTEXITCODE -ne 0) { throw "Telegram avatar upload failed." }

  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
  & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --file $env:ALICE_SQL_OUTPUT
  if ($LASTEXITCODE -ne 0) { throw "Production avatar metadata update failed." }

  Write-Host "Alice avatar refreshed. The previous reference is protected with Windows DPAPI." -ForegroundColor Green
}
finally {
  $aliceToken = $null
  $mainToken = $null
  Remove-Item Env:ALICE_CHARACTER_BOT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:TELEGRAM_BOT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:ALICE_AVATAR_JPG -ErrorAction SilentlyContinue
  Remove-Item Env:ALICE_SQL_OUTPUT -ErrorAction SilentlyContinue

  $resolvedTemp = [IO.Path]::GetFullPath($taskTemp)
  $resolvedBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
