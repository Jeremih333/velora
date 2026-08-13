$ErrorActionPreference = "Stop"
$originalLocalAppData = $env:LOCALAPPDATA
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ("velora-secret-test-" + [Guid]::NewGuid().ToString("N"))
$resolvedTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTestRoot.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Secret-store self-test path escaped the operating-system temporary directory."
}

try {
  $env:LOCALAPPDATA = $resolvedTestRoot
  . (Join-Path $PSScriptRoot "velora-secret-store.ps1")
  $characters = [char[]](108,111,99,97,108,45,114,111,117,110,100,45,116,114,105,112)
  $secure = New-Object Security.SecureString
  foreach ($character in $characters) { $secure.AppendChar($character) }
  $secure.MakeReadOnly()
  Set-VeloraStoredSecret "TELEGRAM_BOT_TOKEN" $secure
  $decrypted = Get-VeloraStoredSecret "TELEGRAM_BOT_TOKEN"
  $expected = -join $characters
  if ($decrypted -ne $expected) { throw "DPAPI round trip failed." }
  $raw = Get-Content -LiteralPath (Get-VeloraSecretStorePath) -Raw -Encoding UTF8
  if ($raw.Contains($expected)) { throw "Plaintext leaked into the secret-store file." }
  if (@(Get-VeloraStoredSecretNames) -notcontains "TELEGRAM_BOT_TOKEN") { throw "Secret listing failed." }
  Remove-VeloraStoredSecret "TELEGRAM_BOT_TOKEN"
  if ($null -ne (Get-VeloraStoredSecret "TELEGRAM_BOT_TOKEN")) { throw "Secret removal failed." }
  Write-Host "Velora DPAPI secret-store self-test passed." -ForegroundColor Green
}
finally {
  $env:LOCALAPPDATA = $originalLocalAppData
  if (Test-Path -LiteralPath $resolvedTestRoot) { Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force }
}
