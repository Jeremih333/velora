$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "assert-boundary.ps1") | Out-Null
node (Join-Path $PSScriptRoot "secret-scan.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "Secret scan failed."
}
