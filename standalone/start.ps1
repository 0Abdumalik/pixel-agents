# Pixel Agents Office - Windows Launcher
# Usage: Right-click -> Run with PowerShell, or: powershell -ExecutionPolicy Bypass -File start.ps1

$ErrorActionPreference = "Stop"
$PORT = if ($env:PORT) { $env:PORT } else { "3000" }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "  Pixel Agents Office - Aperture Science Edition" -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor DarkGray
Write-Host ""

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeVersion = (node --version)
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

# Install dependencies if needed
if (-not (Test-Path "$ScriptDir\node_modules")) {
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    Push-Location $ScriptDir
    npm install 2>&1 | Out-Null
    Pop-Location
    Write-Host "  Dependencies installed." -ForegroundColor Green
}

# Build frontend if needed
if (-not (Test-Path "$ProjectRoot\dist\webview\index.html")) {
    Write-Host "  Building frontend..." -ForegroundColor Yellow
    Push-Location "$ProjectRoot\webview-ui"
    if (-not (Test-Path "node_modules")) {
        npm install 2>&1 | Out-Null
    }
    npm run build 2>&1 | Out-Null
    Pop-Location
    Write-Host "  Frontend built." -ForegroundColor Green
}

# Check Claude Code projects directory
$claudeDir = Join-Path $env:USERPROFILE ".claude\projects"
if (Test-Path $claudeDir) {
    $projectCount = (Get-ChildItem $claudeDir -Directory).Count
    Write-Host "  Claude projects: $projectCount found" -ForegroundColor Green
} else {
    Write-Host "  Claude projects dir not found (will create on first use)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Starting server on port $PORT..." -ForegroundColor Cyan
Write-Host "  Open: http://localhost:$PORT" -ForegroundColor White
Write-Host "  Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

# Open browser after short delay
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:$using:PORT"
} | Out-Null

# Start server
$env:PORT = $PORT
Push-Location $ScriptDir
node server.js
Pop-Location
