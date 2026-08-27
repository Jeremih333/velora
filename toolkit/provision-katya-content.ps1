$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
. (Join-Path $PSScriptRoot "velora-secret-store.ps1")
Set-Location -LiteralPath $projectRoot

$mainToken = Get-VeloraStoredSecret "TELEGRAM_BOT_TOKEN"
if ([string]::IsNullOrWhiteSpace($mainToken)) { throw "Protected main Telegram token is unavailable." }

$avatarPath = Join-Path $PSScriptRoot "cold-embrace-analysis\katya-avatar.png"
if (-not (Test-Path -LiteralPath $avatarPath -PathType Leaf)) { throw "Katya avatar is unavailable." }

$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ("velora-katya-content-" + [Guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($taskTemp) | Out-Null

try {
  $backupQuery = @"
SELECT 'character' AS kind,id AS object_id FROM characters WHERE id='katya-cold-embrace'
UNION ALL SELECT 'world_lorebook',id FROM lorebooks WHERE id='lorebook-cold-embrace'
UNION ALL SELECT 'katya_lorebook',id FROM lorebooks WHERE id='lorebook-katya-cold-embrace';
"@
  $backupJson = & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --json --command $backupQuery 2>$null | Out-String
  if ([string]::IsNullOrWhiteSpace($backupJson)) { throw "Could not inspect existing Katya content." }

  $backupDirectory = Join-Path $env:LOCALAPPDATA "Velora\backups"
  [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
  $backupPath = Join-Path $backupDirectory ("katya-content-presence-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ".dpapi")
  $backupSecure = ConvertTo-SecureString $backupJson -AsPlainText -Force
  [IO.File]::WriteAllText($backupPath, (ConvertFrom-SecureString $backupSecure), [Text.UTF8Encoding]::new($false))
  Set-VeloraSecretFileAcl $backupPath

  $env:TELEGRAM_BOT_TOKEN = $mainToken
  $env:KATYA_AVATAR_PATH = $avatarPath
  $env:KATYA_SQL_OUTPUT = Join-Path $taskTemp "katya-content.sql"
  node toolkit/provision-katya.mjs prepare-content
  if ($LASTEXITCODE -ne 0) { throw "Katya content preparation failed." }

  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
  & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --file $env:KATYA_SQL_OUTPUT
  if ($LASTEXITCODE -ne 0) { throw "Katya production content provisioning failed." }

  $verifyQuery = "SELECT c.id,v.name,c.publish_state,c.visibility,(SELECT COUNT(*) FROM character_lorebooks cl WHERE cl.character_id=c.id AND cl.enabled=1) AS lorebooks,(SELECT COUNT(*) FROM lorebook_entries le WHERE le.lorebook_id IN ('lorebook-cold-embrace','lorebook-katya-cold-embrace') AND le.enabled=1) AS lore_entries FROM characters c JOIN character_versions v ON v.id=c.active_version_id WHERE c.id='katya-cold-embrace';"
  & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --command $verifyQuery
  if ($LASTEXITCODE -ne 0) { throw "Katya production verification failed." }
}
finally {
  $mainToken = $null
  Remove-Item Env:TELEGRAM_BOT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:KATYA_AVATAR_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:KATYA_SQL_OUTPUT -ErrorAction SilentlyContinue

  $resolvedTemp = [IO.Path]::GetFullPath($taskTemp)
  $resolvedBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
