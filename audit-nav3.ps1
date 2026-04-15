$ErrorActionPreference = 'SilentlyContinue'
$hasBridgeNav = @()
$noBridgeNav = @()
$files = Get-ChildItem "C:\aoe-unified-final\public\*.html"
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw
    if ($content -match 'bridge-nav\.js') {
        $hasBridgeNav += $f.Name
    } else {
        $noBridgeNav += $f.Name
    }
}
$noBridgeNav | Sort-Object