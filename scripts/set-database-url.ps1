# set-database-url.ps1
#
# Prompts interactively for your real Supabase DATABASE_URI, validates it, and
# appends to .env. Must be run in YOUR OWN PowerShell window (not through the
# Claude tool — Read-Host needs a real console).
#
# Usage (in your PowerShell):
#   cd C:\aoe-unified-final
#   powershell -ExecutionPolicy Bypass -File scripts\set-database-url.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSCommandPath))

Write-Host ""
Write-Host "=== Supabase DATABASE_URL setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Get the URI from: Supabase Dashboard > Settings > Database > Connection string > URI tab"
Write-Host "Click 'Display password' before copying, so the password is in the URI (not [YOUR-PASSWORD])."
Write-Host ""

# Compare to SUPABASE_URL if present, to catch project-ref mismatches early
$envLines = Get-Content .env -ErrorAction SilentlyContinue
$supaUrl = ($envLines | Where-Object { $_ -match '^SUPABASE_URL=(.+)$' }) -replace '^SUPABASE_URL=', ''
$expectedRef = ''
if ($supaUrl -match '^https://([a-z0-9]+)\.supabase\.co') { $expectedRef = $Matches[1] }
if ($expectedRef) {
    Write-Host "SUPABASE_URL project-ref detected: $expectedRef" -ForegroundColor DarkGray
    Write-Host "The URI you paste must have user 'postgres.$expectedRef'." -ForegroundColor DarkGray
    Write-Host ""
}

$sec = Read-Host "Paste Supabase URI (hidden input)" -AsSecureString
$uri = [System.Net.NetworkCredential]::new('', $sec).Password

# Validation ladder
if ([string]::IsNullOrWhiteSpace($uri)) {
    Write-Host "ABORT: empty input" -ForegroundColor Red; exit 1
}
if ($uri -match 'PASTE|YOUR_|<.+>|REAL_|\[YOUR|abc123|realpw') {
    Write-Host "ABORT: input contains placeholder text" -ForegroundColor Red; exit 2
}
# Accept both Supabase shapes:
#   Pooler: postgresql://postgres.<ref>:<pw>@<pooler-host>:<port>/postgres
#   Direct: postgresql://postgres:<pw>@db.<ref>.supabase.co:<port>/postgres
$isPooler = ($uri -match '^postgresql://postgres\.[a-z0-9]+:[^@]+@[^/]+:[0-9]+/postgres')
$isDirect = ($uri -match '^postgresql://postgres:[^@]+@db\.[a-z0-9]+\.supabase\.co:[0-9]+/postgres')
if (-not ($isPooler -or $isDirect)) {
    Write-Host "ABORT: URI does not match any supported Supabase pattern" -ForegroundColor Red; exit 3
}
if ($isDirect) {
    Write-Host "WARNING: Direct connection detected. Only works over IPv6 (or with IPv4 add-on)." -ForegroundColor Yellow
    Write-Host "         If migrations fail with ENETUNREACH, switch to Session Pooler." -ForegroundColor Yellow
}
$actualRef = ''
if ($isPooler -and $uri -match 'postgres\.([a-z0-9]+):') { $actualRef = $Matches[1] }
elseif ($isDirect -and $uri -match '@db\.([a-z0-9]+)\.supabase\.co') { $actualRef = $Matches[1] }
if ($expectedRef -and $actualRef -and ($expectedRef -ne $actualRef)) {
    Write-Host "ABORT: URI project-ref '$actualRef' does not match SUPABASE_URL ref '$expectedRef'" -ForegroundColor Red
    Write-Host "       You pasted a URI from the wrong project." -ForegroundColor Red
    exit 4
}

# Remove any existing DATABASE_URL line (clean overwrite)
$content = Get-Content .env -Raw -ErrorAction SilentlyContinue
if ($null -eq $content) { $content = '' }
$content = [regex]::Replace($content, '(?m)^DATABASE_URL=.*\r?\n?', '')
if (-not $content.EndsWith("`n")) { $content += "`n" }
$content += "DATABASE_URL=$uri`n"
Set-Content -Path .env -Value $content -NoNewline

Write-Host ""
Write-Host "OK: DATABASE_URL written to .env (ref=$actualRef, len=$($uri.Length))" -ForegroundColor Green
Write-Host "Now go back to Claude and say 'done'." -ForegroundColor Cyan
