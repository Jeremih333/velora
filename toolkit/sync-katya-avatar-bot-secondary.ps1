$ErrorActionPreference = 'Stop'

$projectRoot = & (Join-Path $PSScriptRoot 'assert-boundary.ps1')
. (Join-Path $PSScriptRoot 'velora-secret-store.ps1')
Set-Location -LiteralPath $projectRoot

$token = Get-VeloraStoredSecret 'KATYA_CHARACTER_BOT_TOKEN'
$encryptionKey = Get-VeloraStoredSecret 'CHILD_BOT_ENCRYPTION_KEY'
if ([string]::IsNullOrWhiteSpace($token) -or [string]::IsNullOrWhiteSpace($encryptionKey)) {
  throw 'Protected Katya token or child-bot encryption key is unavailable.'
}

$avatarPath = Join-Path $PSScriptRoot 'cold-embrace-analysis\katya-avatar.png'
$stagingRoot = Join-Path $env:LOCALAPPDATA 'Velora\migration-staging'
[IO.Directory]::CreateDirectory($stagingRoot) | Out-Null
$deltaPath = Join-Path $stagingRoot ('katya-avatar-bot-delta-' + [Guid]::NewGuid().ToString('N') + '.sql')

try {
  $env:KATYA_CHARACTER_BOT_TOKEN = $token
  $env:CHILD_BOT_ENCRYPTION_KEY = $encryptionKey
  $env:KATYA_AVATAR_PATH = $avatarPath
  $env:KATYA_BOT_SQL_OUTPUT = $deltaPath
  node toolkit/provision-katya.mjs prepare-bot-offline
  if ($LASTEXITCODE -ne 0) { throw 'Katya AvatarBot delta generation failed.' }

  & (Join-Path $PSScriptRoot 'cloudflare-secondary-wrangler.ps1') d1 execute velora-production-cutover --remote --file $deltaPath
  if ($LASTEXITCODE -ne 0) { throw 'Secondary Katya AvatarBot update failed.' }
}
finally {
  $token = $null
  $encryptionKey = $null
  Remove-Item Env:KATYA_CHARACTER_BOT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:CHILD_BOT_ENCRYPTION_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:KATYA_AVATAR_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:KATYA_BOT_SQL_OUTPUT -ErrorAction SilentlyContinue
  $resolvedDelta = [IO.Path]::GetFullPath($deltaPath)
  $resolvedStaging = [IO.Path]::GetFullPath($stagingRoot)
  if ($resolvedDelta.StartsWith($resolvedStaging, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedDelta)) {
    Remove-Item -LiteralPath $resolvedDelta -Force
  }
}
