$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$wixDirectory = Join-Path $projectRoot '.tools\wix314'
$candlePath = Join-Path $wixDirectory 'candle.exe'
$lightPath = Join-Path $wixDirectory 'light.exe'

if ((Test-Path -LiteralPath $candlePath) -and (Test-Path -LiteralPath $lightPath)) {
  Write-Host "WiX Toolset is ready: $wixDirectory"
  exit 0
}

$downloadUrl = 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip'
$expectedSha256 = '6AC824E1642D6F7277D0ED7EA09411A508F6116BA6FAE0AA5F2C7DAA2FF43D31'
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) "wix314-binaries-$([guid]::NewGuid()).zip"

try {
  Write-Host 'Downloading WiX Toolset 3.14.1...'
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -UseBasicParsing

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $archiveStream = [System.IO.File]::OpenRead($archivePath)
  try {
    $hashBytes = $sha256.ComputeHash($archiveStream)
    $actualSha256 = [System.BitConverter]::ToString($hashBytes).Replace('-', '')
  }
  finally {
    $archiveStream.Dispose()
    $sha256.Dispose()
  }
  if ($actualSha256 -ne $expectedSha256) {
    throw "WiX archive checksum mismatch. Received: $actualSha256"
  }

  New-Item -ItemType Directory -Path $wixDirectory -Force | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $wixDirectory -Force

  if (-not (Test-Path -LiteralPath $candlePath) -or -not (Test-Path -LiteralPath $lightPath)) {
    throw 'The downloaded archive does not contain candle.exe and light.exe.'
  }

  Write-Host "WiX Toolset is ready: $wixDirectory"
}
finally {
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
}
