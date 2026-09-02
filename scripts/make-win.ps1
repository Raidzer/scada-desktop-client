$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$localWixDirectory = Join-Path $projectRoot '.tools\wix314'
$localCandle = Join-Path $localWixDirectory 'candle.exe'
$localLight = Join-Path $localWixDirectory 'light.exe'

if ((Test-Path -LiteralPath $localCandle) -and (Test-Path -LiteralPath $localLight)) {
  $env:PATH = "$localWixDirectory;$env:PATH"
}
elseif (-not (Get-Command candle.exe -ErrorAction SilentlyContinue) -or
        -not (Get-Command light.exe -ErrorAction SilentlyContinue)) {
  throw 'WiX Toolset was not found. Run once: npm run setup:wix'
}

$forgeCommand = Join-Path $projectRoot 'node_modules\.bin\electron-forge.cmd'
if (-not (Test-Path -LiteralPath $forgeCommand)) {
  throw 'Electron Forge was not found. Run first: npm ci'
}

Push-Location $projectRoot
try {
  & $forgeCommand make --platform=win32 --arch=x64
  if ($LASTEXITCODE -ne 0) {
    throw "MSI build failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}
