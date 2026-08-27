param([string]$ArchivePath = "")

$ErrorActionPreference = "Stop"
$projectRoot = & (Join-Path $PSScriptRoot "assert-boundary.ps1")
$destination = Join-Path $projectRoot "docs\ui\reference"

if ([string]::IsNullOrWhiteSpace($ArchivePath)) {
  $archiveName = (-join ([char[]](1092,1086,1090,1086))) + " " +
    (-join ([char[]](1080,1085,1090,1077,1088,1092,1077,1081,1089,1072))) + ".zip"
  $ArchivePath = Join-Path ([Environment]::GetFolderPath("UserProfile")) `
    (Join-Path "Downloads\Telegram Desktop" $archiveName)
}

if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
  throw "UI reference archive was not found."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing
$archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  $entries = @($archive.Entries)
  if ($entries.Count -ne 46) { throw "Expected exactly 46 UI references; found $($entries.Count)." }

  $mapped = foreach ($entry in $entries) {
    if ($entry.FullName -match '[\\/]' -or $entry.FullName -notmatch '^photo_(\d{1,2})_2026-08-11_02-07-32\.jpg$') {
      throw "Unsafe or unexpected archive entry: $($entry.FullName)"
    }
    $number = [int]$Matches[1]
    if ($number -lt 1 -or $number -gt 46) { throw "Reference number is out of range." }
    [pscustomobject]@{ Number = $number; Entry = $entry }
  }
  if (@($mapped.Number | Sort-Object -Unique).Count -ne 46) {
    throw "Reference numbers are duplicated or incomplete."
  }

  [IO.Directory]::CreateDirectory($destination) | Out-Null
  foreach ($item in ($mapped | Sort-Object Number)) {
    $target = Join-Path $destination ("photo_{0:D2}.jpg" -f $item.Number)
    $sourceStream = $item.Entry.Open()
    try {
      $memory = [IO.MemoryStream]::new()
      try {
        $sourceStream.CopyTo($memory)
        $bytes = $memory.ToArray()
      }
      finally { $memory.Dispose() }
    }
    finally { $sourceStream.Dispose() }

    $imageStream = [IO.MemoryStream]::new($bytes, $false)
    try {
      $image = [Drawing.Image]::FromStream($imageStream, $true, $true)
      try {
        if ($image.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Jpeg.Guid) {
          throw "Reference $($item.Number) is not a valid JPEG."
        }
        if ($image.Width -lt 1 -or $image.Height -lt 1) {
          throw "Reference $($item.Number) has invalid dimensions."
        }
      }
      finally { $image.Dispose() }
    }
    finally { $imageStream.Dispose() }

    [IO.File]::WriteAllBytes($target, $bytes)
  }
}
finally { $archive.Dispose() }

$files = @(Get-ChildItem -LiteralPath $destination -File -Filter "photo_*.jpg" | Sort-Object Name)
if ($files.Count -ne 46) { throw "Imported reference directory is incomplete." }
Write-Output "Imported and validated 46 UI references into docs/ui/reference."
