$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

$Port = 3001
$Url = "http://localhost:$Port"
$Root = $PSScriptRoot
$Dist = Join-Path $Root 'dist'
$ServerJs = Join-Path $Dist 'server.js'
$TimeoutSec = 120
$AppName = Split-Path -Leaf $Root

function Add-NodePathsToEnv {
    $extra = @(
        "$env:ProgramFiles\nodejs",
        ${env:ProgramFiles(x86)} + '\nodejs',
        "$env:APPDATA\npm",
        "$env:LOCALAPPDATA\pnpm"
    )
    foreach ($dir in $extra) {
        if ((Test-Path $dir) -and ($env:PATH -notlike "*$dir*")) {
            $env:PATH = "$dir;$env:PATH"
        }
    }
}

function Resolve-NodeRunner {
    Add-NodePathsToEnv
    foreach ($name in @('node')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    $nodeExe = "$env:ProgramFiles\nodejs\node.exe"
    if (Test-Path $nodeExe) { return $nodeExe }
    return $null
}

function Resolve-NpmRunner {
    Add-NodePathsToEnv
    foreach ($path in @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        ${env:ProgramFiles(x86)} + '\nodejs\npm.cmd'
    )) {
        if (Test-Path $path) { return $path }
    }
    $cmd = Get-Command npm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Import-DotEnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim()
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
}

function Test-DashPronto {
    param([string]$TargetUrl)
    try {
        $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Show-Erro {
    param([string]$Mensagem)
    [System.Windows.Forms.MessageBox]::Show($Mensagem, $AppName, 'OK', 'Error') | Out-Null
}

Set-Location $Root

if (Test-DashPronto -TargetUrl $Url) {
    Start-Process $Url
    exit 0
}

$node = Resolve-NodeRunner
if (-not $node) {
    Show-Erro 'Node.js não encontrado. Instale em nodejs.org e tente de novo.'
    exit 1
}

if (-not (Test-Path $ServerJs)) {
    $npm = Resolve-NpmRunner
    if (-not $npm) {
        Show-Erro 'dist/ ainda não existe. Instale o Node e rode na pasta do projeto: npm run build:dist'
        exit 1
    }
    [System.Windows.Forms.MessageBox]::Show(
        'Primeira vez: vai gerar dist/ (next build). Pode levar alguns minutos.',
        $AppName,
        'OK',
        'Information'
    ) | Out-Null
    Push-Location $Root
    try {
        if (-not (Test-Path (Join-Path $Root 'node_modules\next\package.json'))) {
            & $npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install exit $LASTEXITCODE" }
        }
        & $npm run build:dist
        if ($LASTEXITCODE -ne 0) { throw "build:dist exit $LASTEXITCODE" }
    } catch {
        Show-Erro "Falha ao gerar dist/.`n`n$($_.Exception.Message)"
        exit 1
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $ServerJs)) {
    Show-Erro 'dist/server.js não foi criado. Rode: npm run build:dist'
    exit 1
}

$envLocal = Join-Path $Root '.env.local'
if (Test-Path $envLocal) {
    Copy-Item $envLocal (Join-Path $Dist '.env.local') -Force
    Import-DotEnvFile -Path $envLocal
} elseif (-not (Test-Path (Join-Path $Dist '.env.local'))) {
    Show-Erro @(
        'Falta .env.local na raiz do projeto (credenciais Supabase / Espião).',
        'Copie de .env.example e preencha antes de abrir o dist.'
    ) -join "`n"
    exit 1
}

$env:PORT = "$Port"
$env:HOSTNAME = '127.0.0.1'

$distQuoted = "'$($Dist -replace "'", "''")'"
$nodeQuoted = "'$($node -replace "'", "''")'"

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location $distQuoted; `$env:PORT='$Port'; `$env:HOSTNAME='127.0.0.1'; & $nodeQuoted server.js"
)

$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    if (Test-DashPronto -TargetUrl $Url) {
        Start-Process $Url
        exit 0
    }
    Start-Sleep -Seconds 1
}

[System.Windows.Forms.MessageBox]::Show(
    "O servidor dist não respondeu em $Url dentro de ${TimeoutSec}s.`nVerifique a janela do terminal.",
    $AppName,
    'OK',
    'Warning'
) | Out-Null
exit 1
