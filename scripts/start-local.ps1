param([string]$PythonExe = '')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPython = $PythonExe
if (-not $taskPython) {
    $taskPython = Join-Path $taskRoot 'backend\.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = (Get-Command python).Source }
}
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Python executable not found. Pass -PythonExe with an installed interpreter.' }
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'backend\.env'))) {
    throw 'Copy backend/.env.example to backend/.env and configure the model keys first.'
}
foreach ($taskPort in @(8010, 8931)) {
    if (Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $taskPort is already in use. Open the running preview or stop its process first."
    }
}
New-Item -ItemType Directory -Path (Join-Path $taskRoot 'output') -Force | Out-Null
$taskApi = Start-Process -FilePath $taskPython -WorkingDirectory (Join-Path $taskRoot 'backend') -ArgumentList @('main.py','--port','8010') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRoot 'output\api.log') -RedirectStandardError (Join-Path $taskRoot 'output\api-errors.log')
$taskSite = Start-Process -FilePath $taskPython -WorkingDirectory (Join-Path $taskRoot 'frontend') -ArgumentList @('-m','http.server','8931','--bind','127.0.0.1') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRoot 'output\site.log') -RedirectStandardError (Join-Path $taskRoot 'output\site-errors.log')
Start-Sleep -Milliseconds 750
if ($taskApi.HasExited -or $taskSite.HasExited) {
    foreach ($taskProcess in @($taskApi, $taskSite)) {
        if (-not $taskProcess.HasExited) { Stop-Process -Id $taskProcess.Id }
    }
    throw 'Startup failed. Inspect output/api-errors.log and output/site-errors.log.'
}
Write-Host "Website: http://127.0.0.1:8931  API: http://127.0.0.1:8010/docs"
Write-Host "Stop these preview processes: Stop-Process -Id $($taskApi.Id),$($taskSite.Id)"
$taskPreview = @{
    started_at = (Get-Date).ToString('o')
    website = 'http://127.0.0.1:8931/'
    api = 'http://127.0.0.1:8010'
    api_pid = $taskApi.Id
    site_pid = $taskSite.Id
    python = $taskPython
    status = 'started-not-yet-verified'
    published = $false
}
$taskPreview | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'output\local-preview.json') -Encoding UTF8
