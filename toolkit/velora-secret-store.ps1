$ErrorActionPreference = "Stop"

$script:VeloraSecretNames = @("TELEGRAM_BOT_TOKEN", "BOTHUB_API_KEY", "CLOUDFLARE_API_TOKEN")

function Get-VeloraSecretStorePath {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw "LOCALAPPDATA is unavailable; the Windows secret store cannot be used."
  }
  return Join-Path $env:LOCALAPPDATA "Velora\secrets.dpapi.json"
}

function Assert-VeloraSecretName([string]$Name) {
  if ($script:VeloraSecretNames -notcontains $Name) { throw "Unsupported Velora secret name: $Name" }
}

function Read-VeloraSecretDocument {
  $path = Get-VeloraSecretStorePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    return [ordered]@{ version = 1; entries = [ordered]@{} }
  }
  $document = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([int]$document.version -ne 1 -or $null -eq $document.entries) {
    throw "The Velora secret store has an unsupported format."
  }
  $entries = [ordered]@{}
  foreach ($property in $document.entries.PSObject.Properties) { $entries[$property.Name] = $property.Value }
  return [ordered]@{ version = 1; entries = $entries }
}

function Set-VeloraSecretFileAcl([string]$Path) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = New-Object Security.AccessControl.FileSecurity
  $acl.SetOwner($identity)
  $acl.SetAccessRuleProtection($true, $false)
  $rule = New-Object Security.AccessControl.FileSystemAccessRule(
    $identity, [Security.AccessControl.FileSystemRights]::FullControl,
    [Security.AccessControl.AccessControlType]::Allow
  )
  $acl.AddAccessRule($rule)
  [IO.File]::SetAccessControl($Path, $acl)
}

function Save-VeloraSecretDocument($Document) {
  $path = Get-VeloraSecretStorePath
  $directory = Split-Path -Parent $path
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $temporary = Join-Path $directory ("secrets-" + [Guid]::NewGuid().ToString("N") + ".tmp")
  try {
    [IO.File]::WriteAllText($temporary, ($Document | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    Set-VeloraSecretFileAcl $temporary
    Move-Item -LiteralPath $temporary -Destination $path -Force
    Set-VeloraSecretFileAcl $path
  }
  finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}

function Set-VeloraStoredSecret([string]$Name, [Security.SecureString]$Value) {
  Assert-VeloraSecretName $Name
  if ($null -eq $Value -or $Value.Length -eq 0) { throw "Secret value cannot be empty." }
  $document = Read-VeloraSecretDocument
  $document.entries[$Name] = [ordered]@{
    ciphertext = ConvertFrom-SecureString $Value
    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  Save-VeloraSecretDocument $document
}

function Get-VeloraStoredSecret([string]$Name) {
  Assert-VeloraSecretName $Name
  $document = Read-VeloraSecretDocument
  if (-not $document.entries.Contains($Name)) { return $null }
  $cipherText = [string]$document.entries[$Name].ciphertext
  if ([string]::IsNullOrWhiteSpace($cipherText)) { throw "Stored Velora secret $Name is invalid." }
  $secureValue = ConvertTo-SecureString $cipherText
  $pointer = [IntPtr]::Zero
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally { if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) } }
}

function Remove-VeloraStoredSecret([string]$Name) {
  Assert-VeloraSecretName $Name
  $document = Read-VeloraSecretDocument
  if ($document.entries.Contains($Name)) { $document.entries.Remove($Name); Save-VeloraSecretDocument $document }
}

function Get-VeloraStoredSecretNames {
  $document = Read-VeloraSecretDocument
  return @($document.entries.Keys | Sort-Object)
}
