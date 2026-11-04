# Runs the headless browser checks. Usage:
#   powershell -File tests\run.ps1 smoke
#   powershell -File tests\run.ps1 shot yard,kitchen E:\some\output\dir
#   powershell -File tests\run.ps1 smoke -BaseUrl http://localhost:8123/repo-name/
param([string]$Mode = 'smoke', [string]$Shots = '', [string]$OutDir = '', [string]$BaseUrl = '')
$root = Split-Path -Parent $PSScriptRoot
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$url = if ($BaseUrl) { $BaseUrl.TrimEnd('/') + '/index.html' } else { 'file:///' + ($root -replace '\\', '/') + '/index.html' }
$profile = Join-Path $env:TEMP ('akyar-chrome-' + [guid]::NewGuid().ToString('N'))
$common = @('--headless=new', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--no-first-run', "--user-data-dir=$profile", '--window-size=1280,720', '--hide-scrollbars')
if ($Mode -eq 'smoke') {
    $out = & $chrome @common '--virtual-time-budget=240000' '--dump-dom' "$url#dev" 2>$null | Out-String
    if ($out -match '@@RESULT@@(.*)@@END@@') {
        $json = $Matches[1] -replace '&amp;', '&' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&quot;', '"'
        $r = $json | ConvertFrom-Json
        "total $($r.total), failed $($r.failed)"
        if ($r.crash) { "CRASH: $($r.crash)" }
        foreach ($f in $r.fail) { "FAIL  $($f.name) [$($f.info)]" }
        foreach ($p in $r.passed) { "ok    $p" }
    } else {
        'No result captured. Tail of DOM:'
        $out.Substring([Math]::Max(0, $out.Length - 1500))
    }
} else {
    foreach ($s in $Shots.Split(',')) {
        $png = Join-Path $OutDir "$s.png"
        & $chrome @common '--virtual-time-budget=45000' "--screenshot=$png" "$url#shot=$s" 2>$null | Out-Null
        "$s -> " + (Test-Path $png)
    }
}
Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
