# Installs the latest BusyHub release on Windows, for the current user (no administrator rights).
#
#   irm https://raw.githubusercontent.com/niklas-schmidt-dev/busyhub/main/install.ps1 | iex
#
# $env:BUSYHUB_VERSION = 'v0.1.0'   install that release instead of the latest
# $env:BUSYHUB_NO_OPEN = '1'        do not start BusyHub afterwards
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'niklas-schmidt-dev/busyhub'
$version = if ($env:BUSYHUB_VERSION) { $env:BUSYHUB_VERSION } else { 'latest' }
$base = if ($version -eq 'latest') { "https://github.com/$repo/releases/latest/download" } else { "https://github.com/$repo/releases/download/$version" }

# An x64 PowerShell on Arm reports AMD64 here and the real CPU in PROCESSOR_ARCHITEW6432.
$cpu = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$arch = if ($cpu -eq 'ARM64') { 'arm64' } else { 'x64' }

$file = "BusyHub-windows-$arch-setup.exe"
$installer = Join-Path ([System.IO.Path]::GetTempPath()) $file

Write-Host "Downloading $file"
Invoke-WebRequest -Uri "$base/$file" -OutFile $installer -UseBasicParsing

Write-Host 'Installing BusyHub for this user'
$process = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
Remove-Item $installer -ErrorAction SilentlyContinue
if ($process.ExitCode -ne 0) { throw "The installer exited with code $($process.ExitCode)" }

$exe = Join-Path $env:LOCALAPPDATA 'Programs\BusyHub\BusyHub.exe'
if (Test-Path $exe) {
  Write-Host "Installed $exe"
  if (-not $env:BUSYHUB_NO_OPEN) { Start-Process $exe }
} else {
  Write-Host 'Installed BusyHub. Start it from the Start menu.'
}
