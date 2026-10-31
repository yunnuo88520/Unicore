# Author: yunnuo <ymz@ebox.vip>
# Description: Launch the actual Wails executable with disposable data, verify rendered UI and reopen it.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
$config = Get-Content 'cmd/desktop/wails.json' -Raw | ConvertFrom-Json
$executable = (Resolve-Path "build/desktop/bin/$($config.outputfilename).exe").Path
$evidence = [IO.Path]::GetFullPath('build/acceptance/windows-startup')
[IO.Directory]::CreateDirectory($evidence) | Out-Null
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('unicore-startup-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot) | Out-Null
$data = Join-Path $testRoot '数据 App Data # % &'
$previousData = $env:APP_DATA_DIR
$previousBrowserArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$results = @()

function Save-Evidence($root, [string]$name) {
    $nodes = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $names = @($root.Current.Name)
    foreach ($node in $nodes) { $names += $node.Current.Name }
    $names | Set-Content (Join-Path $evidence "$name.txt") -Encoding utf8
    $rect = $root.Current.BoundingRectangle
    if ($rect.Width -gt 0 -and $rect.Height -gt 0) {
        $bitmap = New-Object Drawing.Bitmap ([int]$rect.Width), ([int]$rect.Height)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen([int]$rect.X, [int]$rect.Y, 0, 0, $bitmap.Size)
            $bitmap.Save((Join-Path $evidence "$name.png"), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
    return ($names -join "`n")
}

function Exercise([string]$name, [bool]$expectFailure) {
    $process = Start-Process -FilePath $executable -WorkingDirectory (Split-Path $executable) -PassThru -RedirectStandardError (Join-Path $evidence "$name.stderr.log")
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(60)
        $ready = $false
        while ([DateTime]::UtcNow -lt $deadline) {
            $process.Refresh()
            if ($process.HasExited) { throw "Wails exited before rendering: $($process.ExitCode); see $name.stderr.log" }
            if ($process.MainWindowHandle -ne 0) {
                $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
                if ($expectFailure) {
                    if ($root.Current.Name -eq "$($config.name) · 启动失败") { $ready = $true; break }
                } elseif ($root.Current.Name -eq $config.name) {
                    $texts = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
                    $names = @($texts | ForEach-Object { $_.Current.Name }) -join "`n"
                    if ($names.Contains('工作台概览') -and $names.Contains('核心实验室')) { $ready = $true; break }
                }
            }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw "Wails did not render the expected window: $name" }
        $text = Save-Evidence $root $name
        if ($expectFailure) {
            if (-not $text.Contains('错误详情')) { throw 'Startup dialog omitted the diagnostic message' }
        } else {
            $database = Join-Path $data 'unicore.db'
            if (-not (Test-Path -LiteralPath $database) -or (Get-Item -LiteralPath $database).Length -lt 100) { throw 'Desktop database was not initialized at the requested path' }
        }
        if (-not $process.CloseMainWindow()) { throw "Cannot close Wails window: $name" }
        if (-not $process.WaitForExit(15000)) { throw "Wails did not exit cleanly: $name" }
        $expectedExit = 0
        if ($expectFailure) { $expectedExit = 1 }
        if ($process.ExitCode -ne $expectedExit) { throw "Unexpected Wails exit code: $($process.ExitCode)" }
        return @{ name = $name; status = 'passed'; exit_code = $process.ExitCode }
    } finally {
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
        $process.Dispose()
    }
}

try {
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "$previousBrowserArguments --force-renderer-accessibility"
    $env:APP_DATA_DIR = $data
    $results += Exercise 'first-start' $false
    $results += Exercise 'reopen' $false
    $blocked = Join-Path $testRoot 'not-a-directory'
    [IO.File]::WriteAllText($blocked, 'isolated startup failure fixture')
    $env:APP_DATA_DIR = $blocked
    $results += Exercise 'startup-error' $true
    @{ results = $results; executable = [IO.Path]::GetFileName($executable); commit = (git rev-parse HEAD); date = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidence 'results.json') -Encoding utf8
    Write-Output 'PASS real Windows Wails startup, rendered UI, SQLite reopen and visible startup error'
} finally {
    $env:APP_DATA_DIR = $previousData
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousBrowserArguments
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
