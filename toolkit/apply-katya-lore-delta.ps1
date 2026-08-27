$ErrorActionPreference = 'Stop'

$projectRoot = & (Join-Path $PSScriptRoot 'assert-boundary.ps1')
Set-Location -LiteralPath $projectRoot
$stagingRoot = Join-Path $env:LOCALAPPDATA 'Velora\migration-staging'
[IO.Directory]::CreateDirectory($stagingRoot) | Out-Null
$deltaPath = Join-Path $stagingRoot ('katya-lore-delta-' + [Guid]::NewGuid().ToString('N') + '.sql')

try {
  $env:KATYA_SQL_OUTPUT = $deltaPath
  node toolkit/provision-katya.mjs prepare-lore
  if ($LASTEXITCODE -ne 0) { throw 'Katya lore delta generation failed.' }

  $characterDeltaPath = Join-Path $stagingRoot ('katya-character-delta-' + [Guid]::NewGuid().ToString('N') + '.sql')
  $env:KATYA_SQL_OUTPUT = $characterDeltaPath
  node toolkit/provision-katya.mjs prepare-character-delta
  if ($LASTEXITCODE -ne 0) { throw 'Katya character delta generation failed.' }
  [IO.File]::AppendAllText($deltaPath, [IO.File]::ReadAllText($characterDeltaPath), [Text.UTF8Encoding]::new($false))
  Remove-Item -LiteralPath $characterDeltaPath -Force

  & corepack pnpm --filter @velora/api exec wrangler d1 execute velora-production --remote --file $deltaPath
  if ($LASTEXITCODE -ne 0) { throw 'Primary Katya lore update failed.' }

  & (Join-Path $PSScriptRoot 'cloudflare-secondary-wrangler.ps1') d1 execute velora-production-cutover --remote --file $deltaPath
  if ($LASTEXITCODE -ne 0) { throw 'Secondary Katya lore update failed.' }
}
finally {
  Remove-Item Env:KATYA_SQL_OUTPUT -ErrorAction SilentlyContinue
  $resolvedDelta = [IO.Path]::GetFullPath($deltaPath)
  $resolvedStaging = [IO.Path]::GetFullPath($stagingRoot)
  if ($resolvedDelta.StartsWith($resolvedStaging, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedDelta)) {
    Remove-Item -LiteralPath $resolvedDelta -Force
  }
  if ($null -ne $characterDeltaPath -and (Test-Path -LiteralPath $characterDeltaPath)) {
    $resolvedCharacterDelta = [IO.Path]::GetFullPath($characterDeltaPath)
    if ($resolvedCharacterDelta.StartsWith($resolvedStaging, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedCharacterDelta -Force
    }
  }
}
