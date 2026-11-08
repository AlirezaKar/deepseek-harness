@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1

rem ===========================================================================
rem DeepSeek Harness / Aras Smart Assistant - Windows Setup & Server Launcher
rem Usage: start-server.cmd [aras|dsh] [--port 3080] [--host 127.0.0.1] [--no-open]
rem ===========================================================================

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul 2>&1
if errorlevel 1 goto :err_repo_dir

set "UI_MODE="
set "HOST=127.0.0.1"
set "PORT=3080"
set "NO_OPEN=0"
set "FORCE_INSTALL=0"
set "FORCE_REBUILD=0"
set "CHECK_ONLY=0"
set "INTERACTIVE_PROMPTED=0"

:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="-h" goto :show_help
if /i "%~1"=="--help" goto :show_help
if /i "%~1"=="/?" goto :show_help
if /i "%~1"=="aras" set "UI_MODE=aras" & shift & goto :parse_args
if /i "%~1"=="dsh" set "UI_MODE=dsh" & shift & goto :parse_args
if /i "%~1"=="--ui=aras" set "UI_MODE=aras" & shift & goto :parse_args
if /i "%~1"=="--ui=dsh" set "UI_MODE=dsh" & shift & goto :parse_args
if /i "%~1"=="--ui" goto :arg_ui
if /i "%~1"=="-u" goto :arg_ui
if /i "%~1"=="--port" goto :arg_port
if /i "%~1"=="-p" goto :arg_port
if /i "%~1"=="--host" goto :arg_host
if /i "%~1"=="--no-open" set "NO_OPEN=1" & shift & goto :parse_args
if /i "%~1"=="--install" set "FORCE_INSTALL=1" & shift & goto :parse_args
if /i "%~1"=="--rebuild" set "FORCE_REBUILD=1" & shift & goto :parse_args
if /i "%~1"=="--check-only" set "CHECK_ONLY=1" & shift & goto :parse_args
echo [ERROR] Unknown argument: %~1
echo Run "%~nx0 --help" for usage options.
goto :fail

:arg_ui
if "%~2"=="" goto :err_missing_val
if /i "%~2"=="aras" set "UI_MODE=aras" & shift & shift & goto :parse_args
if /i "%~2"=="dsh" set "UI_MODE=dsh" & shift & shift & goto :parse_args
echo [ERROR] Invalid --ui value "%~2". Expected "aras" or "dsh".
goto :fail

:arg_port
if "%~2"=="" goto :err_missing_val
set "PORT=%~2"
shift
shift
goto :parse_args

:arg_host
if "%~2"=="" goto :err_missing_val
set "HOST=%~2"
shift
shift
goto :parse_args

:args_done
echo.
echo ======================================================================
echo   DeepSeek Harness ^& Aras Smart Assistant - Server Launcher
echo ======================================================================
echo.

rem --- Interactive UI Selection when not passed on command line ---
if defined UI_MODE goto :ui_selected
set "INTERACTIVE_PROMPTED=1"
:ask_ui
echo Select which Web UI you want to start:
echo   [1] Aras Smart Assistant UI  - Persian RTL Web UI [aras] [Default]
echo   [2] DeepSeek Harness Web UI  - Built-in React Web UI [dsh]
echo.
set "USER_CHOICE="
set /p "USER_CHOICE=Enter choice [1/aras or 2/dsh, press Enter for 1]: "
if "%USER_CHOICE%"=="" set "UI_MODE=aras" & goto :ui_selected
if "%USER_CHOICE%"=="1" set "UI_MODE=aras" & goto :ui_selected
if /i "%USER_CHOICE%"=="aras" set "UI_MODE=aras" & goto :ui_selected
if "%USER_CHOICE%"=="2" set "UI_MODE=dsh" & goto :ui_selected
if /i "%USER_CHOICE%"=="dsh" set "UI_MODE=dsh" & goto :ui_selected
echo [WARN] Please enter 1, aras, 2, or dsh.
echo.
goto :ask_ui

:ui_selected
echo [INFO] Selected UI   : %UI_MODE%
echo [INFO] Listen target : http://%HOST%:%PORT%/
echo.

rem ===========================================================================
rem Step 1/4: Verify Repository Structure
rem ===========================================================================
echo [1/4] Checking repository layout...
if not exist "package.json" goto :err_repo_files
if not exist "apps\cli\src\bin.ts" goto :err_repo_files

rem ===========================================================================
rem Step 2/4: Verify Node.js (>= 24.9.0)
rem ===========================================================================
echo [2/4] Checking Node.js runtime...
where node >nul 2>&1
if errorlevel 1 goto :err_no_node

set "NODE_VER=unknown"
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
node -e "const p=process.versions.node.split('.').map(Number);process.exit(p[0]>24||(p[0]===24&&p[1]>=9)?0:1)"
if errorlevel 1 goto :err_old_node
echo       Node.js %NODE_VER% OK.

rem Validate port number using Node
node -e "const n=Number(process.argv[1]);process.exit(Number.isInteger(n)&&n>=1&&n<=65535?0:1)" "%PORT%"
if errorlevel 1 goto :err_bad_port

rem ===========================================================================
rem Step 3/4: Verify pnpm Package Manager
rem ===========================================================================
echo [3/4] Checking pnpm package manager...
where pnpm >nul 2>&1
if not errorlevel 1 goto :pnpm_ok

echo       pnpm not found in PATH. Attempting automatic setup via Corepack...
where corepack >nul 2>&1
if errorlevel 1 goto :try_npm_pnpm
call corepack enable
call corepack prepare pnpm@11.28.5 --activate
where pnpm >nul 2>&1
if not errorlevel 1 goto :pnpm_ok

:try_npm_pnpm
echo       Attempting global install of pnpm@11.28.5 via npm...
where npm >nul 2>&1
if errorlevel 1 goto :err_no_pnpm
call npm install -g pnpm@11.28.5
where pnpm >nul 2>&1
if errorlevel 1 goto :err_no_pnpm

:pnpm_ok
set "PNPM_VER=unknown"
for /f "delims=" %%p in ('call pnpm -v 2^>nul') do set "PNPM_VER=%%p"
echo       pnpm %PNPM_VER% OK.

rem ===========================================================================
rem Step 4/4: Fast Filesystem Check (Only runs pnpm install when missing)
rem ===========================================================================
echo [4/4] Checking workspace dependencies and %UI_MODE% UI readiness...
if "%FORCE_INSTALL%"=="1" goto :run_install
if not exist "node_modules\.modules.yaml" goto :run_install
if not exist "node_modules\tsx\package.json" goto :run_install
if /i "%UI_MODE%"=="aras" if not exist "packages\experimental\aras-ui\node_modules\@deepseek-ai\cordis\package.json" goto :run_install

rem Instant filesystem check for @earendil-works/pi-ai & its LLM SDK files (no package manager call)
call :probe_llm_sdks
if errorlevel 1 goto :repair_install
echo       Dependencies already installed ^(skipping pnpm install^).
goto :deps_ok

:run_install
call :resolve_pnpm_args
echo       Installing workspace dependencies ^(one-time setup^)...
call pnpm install %PNPM_EXTRA_ARGS%
if errorlevel 1 goto :err_install_failed
goto :deps_ok

:repair_install
echo       [WARN] Missing files detected in LLM SDK folder ^(e.g. openai/index.mjs^).
echo       Removing only incomplete SDK folders and restoring from local pnpm store...
node -e "const fs=require('node:fs'),p=require('node:path'),s=p.resolve('node_modules/.pnpm');if(fs.existsSync(s)){for(const d of fs.readdirSync(s)){if(/^openai@/.test(d)&&(!fs.existsSync(p.join(s,d,'node_modules/openai/package.json'))||!fs.existsSync(p.join(s,d,'node_modules/openai/index.mjs')))){try{fs.rmSync(p.join(s,d),{recursive:true,force:true});}catch{}}if(/^@earendil-works\+pi-ai@/.test(d)&&!fs.existsSync(p.join(s,d,'node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js'))){try{fs.rmSync(p.join(s,d),{recursive:true,force:true});}catch{}}}}"
call :resolve_pnpm_args
call pnpm install %PNPM_EXTRA_ARGS%
if errorlevel 1 goto :err_install_failed
echo       LLM SDK files verified.

:deps_ok
rem Ensure TypeScript workspace path aliases are up to date
node -e "const fs=require('node:fs');const s=fs.existsSync('tsconfig.base.json')?fs.readFileSync('tsconfig.base.json','utf8'):'';process.exit(s.includes('@deepseek-ai/dsh-aras-ui')?0:1)"
if errorlevel 1 call pnpm --config.verify-deps-before-run=false run gen-tsconfig-paths

if /i "%UI_MODE%"=="aras" goto :check_aras
goto :check_dsh

:check_aras
if not exist "packages\experimental\aras-ui\src\index.ts" goto :err_missing_aras
if not exist "packages\experimental\aras-ui\override-web.source.patch.yml" goto :err_missing_aras
if not exist "packages\experimental\aras-ui\standalone.source.patch.yml" goto :err_missing_aras
echo       Aras Smart Assistant plugin ^& LLM SDKs ready.
goto :ready_to_start

:check_dsh
if "%FORCE_REBUILD%"=="1" goto :run_dsh_build
if not exist "apps\web\dist\index.html" goto :run_dsh_build
if not exist "packages\client\modules\lib\client.js" goto :run_dsh_build
if not exist "packages\llm\llm\lib\typert.host.js" goto :run_dsh_build
echo       Default DSH Web UI build artifacts verified.
goto :ready_to_start

:run_dsh_build
echo       Default DSH Web UI requires compiled client ^& TypeRT bundles.
echo       Running "pnpm run build" ^(first-time build may take a few minutes^)...
call pnpm run build
if errorlevel 1 goto :err_build_failed
echo       Build completed successfully.

:ready_to_start
if "%CHECK_ONLY%"=="1" goto :check_only_done

rem Enable Node 24 persistent on-disk V8 & tsx compile cache for much faster warm startups
if not defined NODE_COMPILE_CACHE (
    if defined LOCALAPPDATA (
        set "NODE_COMPILE_CACHE=%LOCALAPPDATA%\deepseek-harness\compile-cache"
    ) else (
        set "NODE_COMPILE_CACHE=%TEMP%\deepseek-harness-compile-cache"
    )
)
if not exist "%NODE_COMPILE_CACHE%" mkdir "%NODE_COMPILE_CACHE%" >nul 2>&1

echo.
echo ======================================================================
if /i "%UI_MODE%"=="aras" echo   Starting Aras Smart Assistant UI on http://%HOST%:%PORT%/
if /i "%UI_MODE%"=="dsh"  echo   Starting DeepSeek Harness Default Web UI on http://%HOST%:%PORT%/
echo   Compile cache : %NODE_COMPILE_CACHE%
echo   Booting TypeScript runtime ^(first run populates cache; next runs start much faster^)...
echo   Press Ctrl+C to stop the server.
echo ======================================================================
echo.

if /i "%UI_MODE%"=="aras" goto :launch_aras
goto :launch_dsh

:launch_aras
set "BROWSER_HOST=%HOST%"
if "%HOST%"=="0.0.0.0" set "BROWSER_HOST=127.0.0.1"
if "%HOST%"=="::" set "BROWSER_HOST=127.0.0.1"
if "%NO_OPEN%"=="0" start "" /b node -e "const http=require('node:http'),cp=require('node:child_process'),u='http://%BROWSER_HOST%:%PORT%/';let n=0;const t=setInterval(function(){if(++n>=150)return clearInterval(t);const r=http.get(u,function(res){if(res.statusCode===200){clearInterval(t);cp.exec('cmd /c start '+u);}res.resume();});r.on('error',function(){});},400);"

rem Wildcard 0.0.0.0 / :: uses standalone HTTP mode because dsh-host-webserver rejects wildcard binds
if "%HOST%"=="0.0.0.0" goto :launch_aras_standalone
if "%HOST%"=="::" goto :launch_aras_standalone

node --import tsx/esm apps/cli/src/bin.ts web --patch ./packages/experimental/aras-ui/override-web.source.patch.yml --host "%HOST%" --port "%PORT%" --no-open
set "EXIT_CODE=%ERRORLEVEL%"
goto :finish

:launch_aras_standalone
set "ARAS_UI_HOST=%HOST%"
set "ARAS_UI_PORT=%PORT%"
node --import tsx/esm apps/cli/src/bin.ts web --patch ./packages/experimental/aras-ui/standalone.source.patch.yml --no-open
set "EXIT_CODE=%ERRORLEVEL%"
goto :finish

:launch_dsh
set "DSH_OPEN_ARG="
if "%NO_OPEN%"=="1" set "DSH_OPEN_ARG=--no-open"
node --import tsx/esm apps/cli/src/bin.ts web --host "%HOST%" --port "%PORT%" %DSH_OPEN_ARG%
set "EXIT_CODE=%ERRORLEVEL%"
goto :finish

:probe_llm_sdks
node -e "const fs=require('node:fs'),p=require('node:path');const piLink=p.resolve('packages/llm/llm-pi-ai/node_modules/@earendil-works/pi-ai');if(!fs.existsSync(p.join(piLink,'dist/api/openai-completions.js')))process.exit(1);let piReal=piLink;try{piReal=fs.realpathSync(piLink);}catch{}const nm=p.resolve(piReal,'..','..');const ok=(rel)=>fs.existsSync(p.join(nm,rel))||fs.existsSync(p.resolve('node_modules',rel));process.exit(ok('openai/package.json')&&ok('openai/index.mjs')&&ok('@anthropic-ai/sdk/package.json')&&ok('@google/genai/package.json')?0:1);" >nul 2>&1
exit /b %ERRORLEVEL%

:resolve_pnpm_args
set "PNPM_EXTRA_ARGS=--prefer-offline"
for /f "delims=" %%m in ('node -e "const fs=require('node:fs');if(fs.existsSync('node_modules/.modules.yaml')){const m=fs.readFileSync('node_modules/.modules.yaml','utf8').match(/^virtualStoreDirMaxLength:\s*(\d+)/m);if(m)process.stdout.write('--config.virtual-store-dir-max-length='+m[1]);}" 2^>nul') do set "PNPM_EXTRA_ARGS=--prefer-offline %%m"
exit /b 0

:check_only_done
echo.
echo [OK] All environment, dependency, and %UI_MODE% UI checks passed.
popd >nul 2>&1
exit /b 0

:show_help
echo Usage:
echo   %~nx0 [aras^|dsh] [options]
echo.
echo UI Modes:
echo   aras               Start Aras Smart Assistant ^(Persian RTL Web UI^)
echo   dsh                Start DeepSeek Harness Default React Web UI
echo   ^(omit to select interactively^)
echo.
echo Options:
echo   --ui ^<aras^|dsh^>    Select UI mode explicitly
echo   --port ^<port^>      HTTP listen port ^(default: 3080^)
echo   --host ^<address^>   Bind address ^(default: 127.0.0.1; 0.0.0.0 supported in aras mode^)
echo   --no-open          Do not open the browser automatically
echo   --install          Force running pnpm install before launch
echo   --rebuild          Force running pnpm run build ^(dsh mode^)
echo   --check-only       Run setup checks only without starting the server
echo   -h, --help, /?     Show this help text
echo.
echo Examples:
echo   %~nx0
echo   %~nx0 aras
echo   %~nx0 dsh --port 3090
echo   %~nx0 --ui aras --host 0.0.0.0 --port 3080 --no-open
popd >nul 2>&1
exit /b 0

:err_repo_dir
echo [ERROR] Could not switch to repository directory: %SCRIPT_DIR%
goto :fail

:err_repo_files
echo [ERROR] package.json or apps\cli\src\bin.ts not found in %CD%.
echo         Keep %~nx0 in the root of the deepseek-harness repository.
goto :fail

:err_missing_val
echo [ERROR] Option "%~1" requires a value. Run "%~nx0 --help" for usage.
goto :fail

:err_no_node
echo [ERROR] Node.js is not installed or not in PATH.
echo         Please install Node.js v24.9.0 or newer from https://nodejs.org/
goto :fail

:err_old_node
echo [ERROR] Detected Node.js %NODE_VER%, but DeepSeek Harness requires Node.js ^>= 24.9.0.
echo         Please upgrade Node.js v24 LTS from https://nodejs.org/
goto :fail

:err_bad_port
echo [ERROR] Invalid port "%PORT%". Expected an integer between 1 and 65535.
goto :fail

:err_no_pnpm
echo [ERROR] Could not find or install pnpm automatically.
echo         Run "corepack enable" or "npm install -g pnpm@11.28.5" and try again.
goto :fail

:err_install_failed
echo [ERROR] "pnpm install" failed. Check your network connection and error output above.
goto :fail

:err_missing_aras
echo [ERROR] Aras UI package files are missing under packages\experimental\aras-ui.
goto :fail

:err_build_failed
echo [ERROR] "pnpm run build" failed while preparing the default DSH Web UI.
goto :fail

:fail
set "EXIT_CODE=1"

:finish
if "%INTERACTIVE_PROMPTED%"=="1" if not "%EXIT_CODE%"=="0" pause
popd >nul 2>&1
exit /b %EXIT_CODE%
