Write-Output "Stopping any process listening on port 5000..."
$net = netstat -ano | Select-String ":5000" | ForEach-Object { $_.ToString().Trim() }
if (-not $net) {
    Write-Output "No listener found on port 5000."
    exit 0
}

foreach ($line in $net) {
    # Split on whitespace; ensure we ignore empty entries
    $parts = ($line -split '\s+') | Where-Object { $_ -ne '' }
    $pidVal = $parts[-1]
    if ($pidVal -match '^[0-9]+$') {
        try {
            Stop-Process -Id ([int]$pidVal) -Force -ErrorAction Stop
            Write-Output ("Stopped PID: " + $pidVal)
        } catch {
            Write-Output ("Could not stop PID " + $pidVal + ": " + $_.Exception.Message)
        }
    }
}