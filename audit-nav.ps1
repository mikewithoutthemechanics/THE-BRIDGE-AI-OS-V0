$ErrorActionPreference = 'SilentlyContinue'
$htmlFiles = Get-ChildItem "C:\aoe-unified-final\public\*.html" | ForEach-Object { $_.Name -replace '\.html$','' }
$routes = @(
    'home','pricing','docs','claude-partner','voice','portal','agents','economy',
    'marketplace','esim','carrier','crm','leads','invoicing','settings','profile',
    'billing','projects','avatar','neurolink','topology','legal','ui','workforce',
    'vendors','quotes','admin-command','admin-revenue','admin-withdraw','admin-esim',
    'intelligence','executive-dashboard','aoe-dashboard','svg-engine','supadash',
    'bridge-audit-dashboard','auth-dashboard','admin-sitemap','godmode-terminal',
    'control','logs','treasury','wallet','defi','trading'
)
$notLinked = $htmlFiles | Where-Object { $_ -notin $routes -and $_ -notmatch '^-' }
$notLinked | Sort-Object | Format-Table -AutoSize