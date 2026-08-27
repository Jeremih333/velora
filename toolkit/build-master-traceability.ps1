param(
  [Parameter(Mandatory = $true)][string]$ContractPath,
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\docs\testing\UI_MASTER_CONTRACT_TRACEABILITY.md')
)

$ErrorActionPreference = 'Stop'
$resolved = [IO.Path]::GetFullPath($ContractPath)
if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Contract not found: $resolved" }
$content = [IO.File]::ReadAllText($resolved, [Text.Encoding]::UTF8)
$matches = [regex]::Matches($content, '(?m)^#\s+(?<number>\d+)\.\s*(?<title>.+?)\s*$')
if ($matches.Count -ne 217) { throw "Expected sections 0..216 (217 total), found $($matches.Count)." }
$numbers = $matches | ForEach-Object { [int]$_.Groups['number'].Value }
if (($numbers | Select-Object -Unique).Count -ne 217 -or ($numbers | Measure-Object -Minimum).Minimum -ne 0 -or ($numbers | Measure-Object -Maximum).Maximum -ne 216) {
  throw 'Contract headings are not the exact unique range 0..216.'
}

$lines = [Collections.Generic.List[string]]::new()
$lines.Add('# UI master contract traceability')
$lines.Add('')
$sourceHash = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
$lines.Add('Source SHA-256: `' + $sourceHash + '`')
$lines.Add('')
$lines.Add('A status is changed from `NOT_VERIFIED` only when the named implementation and test evidence exists. Existing product work is not automatically credited to this new contract.')
$lines.Add('')
$lines.Add('| Requirement | Source | Implementation | Unit/component | E2E | Visual | Status |')
$lines.Add('| ----------: | ------ | -------------- | -------------- | --- | ------ | ------ |')
foreach ($match in $matches) {
  $number = [int]$match.Groups['number'].Value
  $title = $match.Groups['title'].Value.Trim().Replace('|', '\|')
  $lines.Add("| $number | Section $number - $title | pending mapping | pending | pending | pending | NOT_VERIFIED |")
}
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($OutputPath))) | Out-Null
[IO.File]::WriteAllLines([IO.Path]::GetFullPath($OutputPath), $lines, $utf8)
Write-Host "Created traceability for sections 0..216."
