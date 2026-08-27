param([Parameter(ValueFromRemainingArguments = $true)][string[]]$WranglerArgs)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$secondaryConfigRoot = Join-Path $env:LOCALAPPDATA 'Velora\cloudflare-secondary-config'
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
$env:XDG_CONFIG_HOME = $secondaryConfigRoot
$env:CLOUDFLARE_ACCOUNT_ID = 'aa0a32cd6c75f48ff223c0e3458139d7'
Set-Location -LiteralPath $project
$config = Join-Path $PSScriptRoot 'wrangler.secondary-admin.jsonc'
& corepack pnpm exec wrangler @WranglerArgs --config $config
exit $LASTEXITCODE
