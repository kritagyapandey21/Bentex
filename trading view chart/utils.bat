@echo off
REM Utility script for common development tasks

:menu
cls
echo ========================================
echo   TradingView Chart System - Utilities
echo ========================================
echo.
echo 1. Install dependencies
echo 2. Run database migration
echo 3. Start server
echo 4. Run tests
echo 5. Clean database (delete all candles)
echo 6. View database stats
echo 7. Generate sample candles
echo 8. Exit
echo.
set /p choice="Select option (1-8): "

if "%choice%"=="1" goto install
if "%choice%"=="2" goto migrate
if "%choice%"=="3" goto start
if "%choice%"=="4" goto test
if "%choice%"=="5" goto clean
if "%choice%"=="6" goto stats
if "%choice%"=="7" goto generate
if "%choice%"=="8" goto end
goto menu

:install
echo.
echo Installing dependencies...
cd server
call npm install
echo.
echo Done!
pause
goto menu

:migrate
echo.
echo Running database migration...
cd server
call npm run migrate
echo.
echo Done!
pause
goto menu

:start
echo.
echo Starting server...
cd server
call npm start
goto end

:test
echo.
echo Running tests...
cd server
call npm test
pause
goto menu

:clean
echo.
echo WARNING: This will delete ALL candles from the database!
set /p confirm="Are you sure? (y/n): "
if /i "%confirm%"=="y" (
  cd server
  if exist data\candles.db (
    del data\candles.db
    echo Database deleted!
    call npm run migrate
    echo Database recreated!
  ) else (
    echo Database not found.
  )
)
pause
goto menu

:stats
echo.
echo Database Statistics:
cd server
if exist data\candles.db (
  echo Database exists: data\candles.db
  for %%A in (data\candles.db) do echo Size: %%~zA bytes
) else (
  echo Database not found. Run migration first.
)
echo.
pause
goto menu

:generate
echo.
echo This would generate sample candles...
echo (Feature not implemented in this script)
echo Use the demo.html interface to save candles.
pause
goto menu

:end
exit
