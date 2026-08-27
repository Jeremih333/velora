$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
. (Join-Path $PSScriptRoot "velora-secret-store.ps1")
Set-Location -LiteralPath $projectRoot

$katyaToken = Get-VeloraStoredSecret "KATYA_CHARACTER_BOT_TOKEN"
$encryptionKey = Get-VeloraStoredSecret "CHILD_BOT_ENCRYPTION_KEY"
if ([string]::IsNullOrWhiteSpace($katyaToken) -or [string]::IsNullOrWhiteSpace($encryptionKey)) {
  throw "Protected Katya token or child-bot encryption key is unavailable."
}

$avatarPath = Join-Path $PSScriptRoot "cold-embrace-analysis\katya-avatar.png"
if (-not (Test-Path -LiteralPath $avatarPath -PathType Leaf)) { throw "Katya avatar is unavailable." }

$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ("velora-katya-bot-" + [Guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($taskTemp) | Out-Null

try {
  $backupJson = & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --json --command "SELECT id,character_id,telegram_bot_id,telegram_username,status,created_at,updated_at FROM character_avatar_bots WHERE character_id='katya-cold-embrace';" 2>$null | Out-String
  if ([string]::IsNullOrWhiteSpace($backupJson)) { throw "Could not inspect existing Katya AvatarBot." }
  $backupDirectory = Join-Path $env:LOCALAPPDATA "Velora\backups"
  [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
  $backupPath = Join-Path $backupDirectory ("katya-avatar-bot-presence-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ".dpapi")
  $backupSecure = ConvertTo-SecureString $backupJson -AsPlainText -Force
  [IO.File]::WriteAllText($backupPath, (ConvertFrom-SecureString $backupSecure), [Text.UTF8Encoding]::new($false))
  Set-VeloraSecretFileAcl $backupPath

  $env:KATYA_CHARACTER_BOT_TOKEN = $katyaToken
  $env:CHILD_BOT_ENCRYPTION_KEY = $encryptionKey
  $env:KATYA_AVATAR_PATH = $avatarPath
  $env:KATYA_BOT_SQL_OUTPUT = Join-Path $taskTemp "katya-avatar-bot.sql"

  node toolkit/provision-katya.mjs prepare-bot
  if ($LASTEXITCODE -ne 0) { throw "Katya AvatarBot preparation failed." }
  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
  & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --file $env:KATYA_BOT_SQL_OUTPUT
  if ($LASTEXITCODE -ne 0) { throw "Katya AvatarBot database registration failed." }

  node toolkit/provision-katya.mjs webhook
  if ($LASTEXITCODE -ne 0) { throw "Katya AvatarBot webhook activation failed." }
  node toolkit/provision-katya.mjs smoke-info
  if ($LASTEXITCODE -ne 0) { throw "Katya AvatarBot command smoke failed." }

  $verifyQuery = "SELECT b.id,b.character_id,b.telegram_username,b.status,c.publish_state FROM character_avatar_bots b JOIN characters c ON c.id=b.character_id WHERE b.id='92ca981e-660d-4c4e-8c92-ed41de400dff';"
  & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --command $verifyQuery
  if ($LASTEXITCODE -ne 0) { throw "Katya AvatarBot production verification failed." }
}
finally {
  $katyaToken = $null
  $encryptionKey = $null
  Remove-Item Env:KATYA_CHARACTER_BOT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:CHILD_BOT_ENCRYPTION_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:KATYA_AVATAR_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:KATYA_BOT_SQL_OUTPUT -ErrorAction SilentlyContinue

  $resolvedTemp = [IO.Path]::GetFullPath($taskTemp)
  $resolvedBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
