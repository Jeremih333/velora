$ErrorActionPreference = "Stop"

$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
$patterns = @(
  "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
  "sk-[A-Za-z0-9_-]{20,}",
  "nf-[A-Za-z0-9._-]{20,}",
  "[0-9]{8,12}:[A-Za-z0-9_-]{30,}"
)

$arguments = @("--hidden", "--glob", "!.git/**", "--glob", "!node_modules/**", "--glob", "!dist/**", "--glob", "!.env.example")
foreach ($pattern in $patterns) {
  $matches = & rg @arguments --regexp $pattern $projectRoot 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Error "Potential secret detected for pattern: $pattern"
    Write-Output $matches
    exit 1
  }
  if ($LASTEXITCODE -gt 1) {
    throw "Secret scan failed while checking pattern: $pattern"
  }
}

Write-Output "Secret scan passed."
