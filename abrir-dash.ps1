$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

$Port = 3000
$Url = "http://localhost:$Port"
$Root = $PSScriptRoot
$TimeoutSec = 90
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

function Resolve-DevRunner {
    Add-NodePathsToEnv

    foreach ($name in @('pnpm', 'npm')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            $path = $cmd.Source
            if ($path -match '\.ps1$') {
                $cmdPath = $path -replace '\.ps1$', '.cmd'
                if (Test-Path $cmdPath) { $path = $cmdPath }
            }
            return @{ Tool = $name; Path = $path }
        }
    }

    $files = @(
        @{ Tool = 'pnpm'; Path = "$env:APPDATA\npm\pnpm.cmd" },
        @{ Tool = 'pnpm'; Path = "$env:LOCALAPPDATA\pnpm\pnpm.exe" },
        @{ Tool = 'pnpm'; Path = "$env:ProgramFiles\nodejs\pnpm.cmd" },
        @{ Tool = 'npm'; Path = "$env:ProgramFiles\nodejs\npm.cmd" },
        @{ Tool = 'npm'; Path = ${env:ProgramFiles(x86)} + '\nodejs\npm.cmd' }
    )
    foreach ($item in $files) {
        if (Test-Path $item.Path) {
            return $item
        }
    }

    return $null
}

function Test-DepsInstaladas {
    if (-not (Test-Path (Join-Path $Root 'package.json'))) {
        return $true
    }
    $nextBin = Join-Path $Root 'node_modules\.bin\next.cmd'
    $nextPkg = Join-Path $Root 'node_modules\next\package.json'
    $anyBin = Join-Path $Root 'node_modules\.bin'
    if ((Test-Path $nextBin) -or (Test-Path $nextPkg)) { return $true }
    if ((Test-Path $anyBin) -and (Get-ChildItem $anyBin -ErrorAction SilentlyContinue)) { return $true }
    return $false
}

function Install-Deps {
    param($Runner)
    [System.Windows.Forms.MessageBox]::Show(
        'Dependências não instaladas. Vai rodar a instalação agora — pode levar alguns minutos na primeira vez.',
        $AppName,
        'OK',
        'Information'
    ) | Out-Null

    Push-Location $Root
    try {
        & $Runner.Path install
        if ($LASTEXITCODE -ne 0) {
            throw "install exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Get-DevCommandLine {
    param($Runner)
    $quoted = "'$($Runner.Path -replace "'", "''")'"
    $binPath = "'$($Root -replace "'", "''")\node_modules\.bin'"
    $pathSetup = "`$env:PATH = $binPath + ';' + `$env:PATH"
    if ($Runner.Tool -eq 'npm') {
        return "$pathSetup; & $quoted run dev"
    }
    return "$pathSetup; & $quoted dev"
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
    [System.Windows.Forms.MessageBox]::Show(
        $Mensagem,
        $AppName,
        'OK',
        'Error'
    ) | Out-Null
}

Set-Location $Root

if (-not (Test-Path (Join-Path $Root 'package.json'))) {
    Show-Erro 'Este projeto não tem package.json. abrir-dash é para projetos Node.'
    exit 1
}

if (Test-DashPronto -TargetUrl $Url) {
    Start-Process $Url
    exit 0
}

$runner = Resolve-DevRunner
if (-not $runner) {
    Show-Erro @(
        'Node.js / npm / pnpm não encontrados.',
        '',
        'Instale o Node.js (nodejs.org) e tente novamente.'
    ) -join "`n"
    exit 1
}

if (-not (Test-DepsInstaladas)) {
    try {
        Install-Deps -Runner $runner
    } catch {
        Show-Erro @(
            'Falha ao instalar dependências.',
            '',
            'Abra um terminal na pasta do projeto e rode:',
            '  npm install',
            '',
            "Detalhe: $($_.Exception.Message)"
        ) -join "`n"
        exit 1
    }
}

$devLine = Get-DevCommandLine -Runner $runner
$rootQuoted = "'$($Root -replace "'", "''")'"

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location $rootQuoted; $devLine"
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
    "O servidor não respondeu em $Url dentro de ${TimeoutSec}s.`nVerifique a janela do terminal que foi aberta.",
    $AppName,
    'OK',
    'Warning'
) | Out-Null
exit 1
