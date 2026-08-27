param(
  [Parameter(Mandatory = $false)]
  [string]$TestResults = 'test-results',
  [Parameter(Mandatory = $false)]
  [ValidateRange(1, 46)]
  [int]$From = 1,
  [Parameter(Mandatory = $false)]
  [ValidateRange(1, 46)]
  [int]$To = 46,
  [Parameter(Mandatory = $false)]
  [ValidateSet('iphone', 'tablet', 'desktop')]
  [string]$Project
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$resultsRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $TestResults))
$referenceRoot = Join-Path $projectRoot 'docs\ui\reference'
$evidenceRoot = Join-Path $projectRoot 'docs\ui\evidence'

if (-not (Test-Path -LiteralPath $resultsRoot -PathType Container)) {
  throw "Test-results directory does not exist: $resultsRoot"
}

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing.dll' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class VeloraImageDiff {
  public static void Build(string expectedPath, string actualPath, string outputPath) {
    Bitmap actualSource = null;
    Bitmap expectedSource = null;
    Bitmap actual = null;
    Bitmap expected = null;
    Bitmap diff = null;
    try {
      actualSource = new Bitmap(actualPath);
      expectedSource = new Bitmap(expectedPath);
      actual = ToArgb(actualSource, actualSource.Width, actualSource.Height);
      expected = ToArgb(expectedSource, actual.Width, actual.Height);
      diff = new Bitmap(actual.Width, actual.Height, PixelFormat.Format32bppArgb);
      var rectangle = new Rectangle(0, 0, actual.Width, actual.Height);
      var actualData = actual.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      var expectedData = expected.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      var diffData = diff.LockBits(rectangle, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      try {
        var bytes = Math.Abs(actualData.Stride) * actual.Height;
        var actualBytes = new byte[bytes];
        var expectedBytes = new byte[bytes];
        var diffBytes = new byte[bytes];
        Marshal.Copy(actualData.Scan0, actualBytes, 0, bytes);
        Marshal.Copy(expectedData.Scan0, expectedBytes, 0, bytes);
        for (var offset = 0; offset < bytes; offset += 4) {
          var blue = Math.Min(255, Math.Abs(actualBytes[offset] - expectedBytes[offset]) * 3);
          var green = Math.Min(255, Math.Abs(actualBytes[offset + 1] - expectedBytes[offset + 1]) * 3);
          var red = Math.Min(255, Math.Abs(actualBytes[offset + 2] - expectedBytes[offset + 2]) * 3);
          diffBytes[offset] = (byte)blue;
          diffBytes[offset + 1] = (byte)green;
          diffBytes[offset + 2] = (byte)red;
          diffBytes[offset + 3] = 255;
        }
        Marshal.Copy(diffBytes, 0, diffData.Scan0, bytes);
      } finally {
        actual.UnlockBits(actualData);
        expected.UnlockBits(expectedData);
        diff.UnlockBits(diffData);
      }
      diff.Save(outputPath, ImageFormat.Png);
    } finally {
      if (diff != null) diff.Dispose();
      if (expected != null) expected.Dispose();
      if (actual != null) actual.Dispose();
      if (expectedSource != null) expectedSource.Dispose();
      if (actualSource != null) actualSource.Dispose();
    }
  }

  private static Bitmap ToArgb(Bitmap source, int width, int height) {
    var target = new Bitmap(width, height, PixelFormat.Format32bppArgb);
    using (var graphics = Graphics.FromImage(target)) {
      graphics.CompositingMode = CompositingMode.SourceCopy;
      graphics.CompositingQuality = CompositingQuality.HighQuality;
      graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
      graphics.SmoothingMode = SmoothingMode.HighQuality;
      graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
      graphics.DrawImage(source, new Rectangle(0, 0, width, height));
    }
    return target;
  }
}
'@

$slugs = @{
  '01' = 'discovery'
  '02' = 'create-drawer'
  '03' = 'library-drawer'
  '04' = 'characters'
  '05' = 'lorebooks'
  '06' = 'sort-popup'
  '07' = 'character-editor-top'
  '08' = 'character-editor-middle'
  '09' = 'character-editor-bottom'
  '10' = 'recent-chats'
  '11' = 'profile-overview'
  '12' = 'persona-chooser'
  '13' = 'owned-personas'
  '14' = 'persona-editor-top'
  '15' = 'persona-editor-bottom'
  '16' = 'active-long-chat'
  '17' = 'model-picker-top'
  '18' = 'model-picker-lower'
  '19' = 'model-catalog'
  '20' = 'reaction-popover'
  '21' = 'assistant-message-menu'
  '22' = 'user-message-menu'
  '23' = 'public-character-profile'
  '24' = 'greeting-collapsed'
  '25' = 'greeting-expanded'
  '26' = 'public-creator-profile'
  '27' = 'manage-chats'
  '28' = 'chat-sort'
  '29' = 'tag-filter'
  '30' = 'selected-tag'
  '31' = 'tag-query'
  '32' = 'expanded-tag-groups'
  '33' = 'excluded-tags'
  '34' = 'dense-tag-list'
  '35' = 'filtered-discovery'
  '36' = 'language-filter'
  '37' = 'group-size-filter'
  '38' = 'pricing-plan-card'
  '39' = 'pricing-comparison'
  '40' = 'pricing-premium-card'
  '41' = 'pricing-lower'
  '42' = 'pricing-faq-top'
  '43' = 'pricing-faq-lower'
  '44' = 'pricing-annual-period'
  '45' = 'pricing-annual-details'
  '46' = 'pricing-fixed-period'
}

for ($index = $From; $index -le $To; $index += 1) {
  $number = $index.ToString('00')
  $actualName = "ui-$number-$($slugs[$number])-actual.png"
  $actual = Get-ChildItem -LiteralPath $resultsRoot -Recurse -File |
    Where-Object {
      $_.Name -eq $actualName -and
      (-not $Project -or $_.Directory.Name.EndsWith("-$Project", [System.StringComparison]::OrdinalIgnoreCase))
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $actual) {
    throw "Actual screenshot ui-$number was not found under $resultsRoot"
  }
  $reference = Join-Path $referenceRoot "photo_$number.jpg"
  if (-not (Test-Path -LiteralPath $reference -PathType Leaf)) {
    throw "Reference screenshot does not exist: $reference"
  }
  $target = Join-Path $evidenceRoot "ui-$number"
  [System.IO.Directory]::CreateDirectory($target) | Out-Null
  $expectedTarget = Join-Path $target 'expected.jpg'
  $artifactSuffix = if ($Project) { "-$Project" } else { '' }
  $actualTarget = Join-Path $target "actual$artifactSuffix.png"
  $diffTarget = Join-Path $target "diff$artifactSuffix.png"
  Copy-Item -LiteralPath $reference -Destination $expectedTarget -Force
  Copy-Item -LiteralPath $actual.FullName -Destination $actualTarget -Force
  [VeloraImageDiff]::Build($expectedTarget, $actualTarget, $diffTarget)
  Write-Output "ui-$number$artifactSuffix evidence: $target"
}
