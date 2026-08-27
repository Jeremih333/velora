$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project
Write-Host 'Cloudflare Wrangler OAuth login' -ForegroundColor Cyan
Write-Host 'Keep this window open until Wrangler confirms login.' -ForegroundColor Yellow
# Wrangler deliberately skips OAuth while an API token is present. Remove it
# only from this child process; the persisted user/system environment is untouched.
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
corepack pnpm exec wrangler login
Write-Host ''
Write-Host 'Press Enter after copying the result to Codex.' -ForegroundColor Green
[void](Read-Host)
