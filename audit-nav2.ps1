$ErrorActionPreference = 'SilentlyContinue'
$htmlFiles = Get-ChildItem "C:\aoe-unified-final\public\*.html" | ForEach-Object { $_.Name }
$noBridgeNav = @()
$hasBridgeNav = @()
foreach ($f in $htmlFiles) {
    $content = Get-Content "C:\aoe-unified-final\public\$f" -Raw
    if ($content -match 'bridge-nav\.js') {
        $hasBridgeNav += $f
    } else {
        $noBridgeNav += $f
    }
}
Write-Host "=== PAGES WITHOUT bridge-nav.js ($($noBridgeNav.Count)) ===" -ForegroundColor Yellow
$noBridgeNav | Sort-Object | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "=== PAGES WITH bridge-nav.js ($($hasBridgeNav.Count)) ===" -ForegroundColor Green
$hasBridgeNav | Sort-Object | ForEach-Object { Write-Host $_ }