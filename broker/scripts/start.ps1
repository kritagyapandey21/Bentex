# Start the Tanix Flask dev server from the project root
Param()

Write-Output "Activating venv and starting server..."
if (Test-Path -Path ".venv\Scripts\Activate.ps1") {
    & .venv\Scripts\Activate.ps1
}

Write-Output "Running: .venv\Scripts\python.exe app.py"
.venv\Scripts\python.exe app.py