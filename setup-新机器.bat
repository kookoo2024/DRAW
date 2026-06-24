@echo off
chcp 65001 >nul
REM ============================================================
REM  Excalidraw 局域网版 - 新机器一键部署
REM  前提：已装 Node.js 18+ 和 Git
REM  用法：放到新机器上双击运行
REM ============================================================

setlocal

set "FIRE_DIR=D:\Fire"
set "EXCALI_DIR=%FIRE_DIR%\excalidraw"
set "APP_DIR=%EXCALI_DIR%\excalidraw-app"
set "DEPLOY_DIR=%FIRE_DIR%\draw"
set "LIB_DIR=%FIRE_DIR%\libraries"
set "REPO_URL=https://github.com/kookoo2024/DRAW.git"

echo ============================================================
echo   Excalidraw 局域网版 - 新机器部署
echo ============================================================
echo.

REM --- 检查 Node.js ---
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org
    pause
    exit /b 1
)
echo [√] Node.js 已安装
node --version

REM --- 检查 Git ---
where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Git，请先安装：https://git-scm.com
    pause
    exit /b 1
)
echo [√] Git 已安装
echo.

REM --- 第 1 步：拉取代码 ---
if exist "%EXCALI_DIR%\excalidraw-app\package.json" (
    echo [1/5] 代码已存在，跳过克隆（如需更新请手动 git pull）
) else (
    echo [1/5] 从 GitHub 拉取代码...
    git clone %REPO_URL% "%EXCALI_DIR%"
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 克隆失败。可能需要配代理：
        echo   git config --global http.proxy http://127.0.0.1:7890
        pause
        exit /b 1
    )
)
echo.

REM --- 第 2 步：安装依赖 ---
echo [2/5] 安装依赖（首次较慢，请等待）...
pushd "%EXCALI_DIR%"
call yarn install
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 依赖安装失败
    popd
    pause
    exit /b 1
)
popd
echo.

REM --- 第 3 步：构建前端 ---
echo [3/5] 构建前端...
pushd "%APP_DIR%"
call yarn build:local
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 构建失败
    popd
    pause
    exit /b 1
)
popd
echo.

REM --- 第 4 步：部署到 D:\Fire\draw ---
echo [4/5] 部署到 %DEPLOY_DIR% ...
if exist "%DEPLOY_DIR%" rd /s /q "%DEPLOY_DIR%"
mkdir "%DEPLOY_DIR%"
xcopy "%APP_DIR%\build\*" "%DEPLOY_DIR%\" /e /y /i /q >nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 部署失败
    pause
    exit /b 1
)
echo.

REM --- 第 5 步：确保素材库目录存在 ---
if not exist "%LIB_DIR%" (
    echo [5/5] 创建素材库目录 %LIB_DIR%
    mkdir "%LIB_DIR%"
    echo   请把旧的 .excalidrawlib 素材文件拷贝到此目录
) else (
    echo [5/5] 素材库目录已存在，跳过
)
echo.

REM --- 完成 ---
echo ============================================================
echo   部署完成！
echo ============================================================
echo.
echo  接下来：
echo   1. 启动 FireCloud.exe（含 /api/delete 的新版）
echo   2. 浏览器访问 http://localhost/draw/
echo   3. Ctrl+Shift+R 硬刷新
echo.
echo  以后改了代码，双击 deploy.bat 重新部署即可。
echo.
pause
