@echo off
REM ============================================================
REM  Excalidraw deploy script: build + sync to FireCloud dir
REM  Usage: double-click after editing code
REM  Output: D:\Fire\draw  (served by FireCloud.exe)
REM ============================================================

setlocal
set "APP_DIR=D:\Fire\excalidraw\excalidraw-app"
set "DEPLOY_DIR=D:\Fire\draw"

echo.
echo [1/4] Type check (non-blocking)...
pushd D:\Fire\excalidraw
call yarn test:typecheck
popd

echo.
echo [2/4] Building production bundle...
pushd "%APP_DIR%"
call yarn build:local
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed. Aborting.
    popd
    pause
    exit /b 1
)
popd

echo.
echo [3/4] Cleaning old deploy dir...
if exist "%DEPLOY_DIR%" rd /s /q "%DEPLOY_DIR%"
mkdir "%DEPLOY_DIR%"

echo.
echo [4/4] Syncing to %DEPLOY_DIR% ...
xcopy "%APP_DIR%\build\*" "%DEPLOY_DIR%\" /e /y /i /q >nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Sync failed.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Deploy done!
echo  URL:  http://localhost/draw/   or   http://LAN_IP/draw/
echo  Hard refresh in browser (Ctrl+Shift+R) to clear SW cache.
echo ============================================================
echo.
pause
