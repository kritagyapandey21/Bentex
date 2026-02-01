<#
Start-dev: creates virtualenv (if missing), installs requirements, then starts the Flask dev server.
Usage: run from project root in PowerShell:
    ./scripts/start-dev.ps1
#>
Write-Output "Ensuring virtual environment exists (.venv)..."
if (-not (Test-Path -Path '.venv\Scripts\python.exe')) {
    $python = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $python) {
        Write-Error "No system 'python' found on PATH. Install Python 3.10+ or set PATH and retry."
        exit 1
    }
    Write-Output "Creating virtual environment using: $python"
    & $python -m venv .venv
}

Write-Output "Activating virtualenv and installing requirements..."
& .venv\Scripts\Activate.ps1
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt

Write-Output "Starting Flask dev server (foreground). Use Ctrl+C to stop."
.venv\Scripts\python.exe app.py