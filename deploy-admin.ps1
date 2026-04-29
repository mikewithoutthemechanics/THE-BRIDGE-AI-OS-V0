param()
$ErrorActionPreference = 'Stop'
$LocalPath  = 'c:\aoe-unified-final-main\admin-dashboard.html'
$VpsHost    = 'root@102.208.228.44'
$RemotePath = '/var/www/bridgeai/apps/admin-dashboard/index.html'
$TS = [int][double]::Parse((Get-Date -UFormat %s))

if (-not (Test-Path $LocalPath)) { throw "missing local file: $LocalPath" }
$localBytes = (Get-Item $LocalPath).Length
Write-Host ("local:  {0} ({1} bytes)" -f $LocalPath, $localBytes)

Write-Host "backup on VPS..."
ssh -o BatchMode=yes $VpsHost "cp $RemotePath $RemotePath.pre-memfix-$TS && stat -c 'backup: %n (%s bytes)' $RemotePath.pre-memfix-$TS"

Write-Host "upload..."
scp $LocalPath ($VpsHost + ':' + $RemotePath)

Write-Host "verify live..."
ssh -o BatchMode=yes $VpsHost "stat -c 'live: %s bytes  mtime=%y' $RemotePath; echo -n 'mem_mb grep count: '; grep -c mem_mb $RemotePath"

Write-Host "verify via HTTPS..."
$curlOut = curl.exe -s https://bridge-ai-os.com/admin/
$hits = ([regex]::Matches($curlOut, 'mem_mb')).Count
$pubBytes = $curlOut.Length
Write-Host ("public HTML: {0} bytes, mem_mb x{1}" -f $pubBytes, $hits)

if ($hits -eq 3) {
  Write-Host "DEPLOY OK" -ForegroundColor Green
} else {
  Write-Warning "mem_mb hit count off - expected 3 got $hits"
}
