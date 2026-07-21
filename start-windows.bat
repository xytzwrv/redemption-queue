@echo off
REM ============================================================
REM  Channel Point Redemption Queue - local server for Windows
REM  Double-click this file to start. Keep the window open while
REM  you stream. Press Ctrl+C (or close the window) to stop.
REM ============================================================
cd /d "%~dp0"

echo.
echo   Starting local server...
echo.
echo   In OBS, use this URL for the Browser Source:
echo       http://localhost:8777/redemption-queue.html
echo.
echo   This same server hosts every overlay in the repo - see
echo       http://localhost:8777/dashboard.html
echo   for a full list with copy-pasteable URLs.
echo.
echo   Keep this window OPEN while streaming.
echo ============================================================
echo.

python -m http.server 8777
if %errorlevel% neq 0 py -m http.server 8777
if %errorlevel% neq 0 (
  echo.
  echo   Python was not found. Install it from https://www.python.org/downloads/
  echo   During install, tick "Add Python to PATH", then run this file again.
  echo.
  pause
)
