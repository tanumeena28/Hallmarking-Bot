# NCH Hallmarking Bot - Windows Server Setup Script
# Run this script as Administrator on the Windows Server

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   NCH Hallmarking Bot Server Setup Script   " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check for Administrator rights
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Please run this PowerShell script as Administrator!" -ForegroundColor Red
    Write-Host "Right-click on PowerShell, select 'Run as Administrator', and execute this script again." -ForegroundColor Yellow
    Exit
}

Write-Host "[1/3] Enabling Windows Subsystem for Linux (WSL) features..." -ForegroundColor Yellow
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host "[2/3] Downloading and queueing Ubuntu Linux installation..." -ForegroundColor Yellow
wsl --install -d Ubuntu --no-launch

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "WSL and Ubuntu have been enabled successfully!" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "Next Steps:" -ForegroundColor White
Write-Host "1. Please RESTART this Windows Server now." -ForegroundColor White
Write-Host "2. After restart, log back in. The Ubuntu window will open automatically." -ForegroundColor White
Write-Host "3. In Ubuntu, set your Username and Password when prompted." -ForegroundColor White
Write-Host "4. Then run the deployment script 'deploy.sh' to download and run Docker." -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""

$choice = Read-Host "Do you want to restart the server now? (Y/N)"
if ($choice -eq 'Y' -or $choice -eq 'y') {
    Write-Host "Restarting server..." -ForegroundColor Red
    Restart-Computer -Force
} else {
    Write-Host "Please restart the server manually to apply changes." -ForegroundColor Yellow
}
