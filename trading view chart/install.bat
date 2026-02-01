@echo off
echo Installing dependencies...
cd server
call npm install
echo.
echo Running database migration...
call npm run migrate
echo.
echo Installation complete!
echo.
echo To start the server, run: npm start
pause
