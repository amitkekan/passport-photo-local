$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    throw 'Dependencies are missing. Review README.md, then run npm ci before starting.'
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed. The local server was not started.' }
Write-Host 'Open http://127.0.0.1:4317 in Edge or Chrome. Photos remain in browser memory.'
& npm.cmd start
if ($LASTEXITCODE -ne 0) { throw 'The local server exited with an error.' }
