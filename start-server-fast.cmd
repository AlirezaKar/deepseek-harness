@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1

rem ===========================================================================
rem DeepSeek Harness / Aras Smart Assistant - Fast Direct Server Launcher
rem Skips all Node/pnpm/package/dependency checks and boots immediately.
rem Usage: start-server-fast.cmd [aras|dsh] [--port 3080] [--host 127.0.0.1] [--no-open]
rem ===========================================================================

pushd "%~dp0" >nul 2>&1
if errorlevel 1 exit /b 1

set "UI_MODE=aras"
set "HOST=127.0.0.1"
set "PORT=3080"
set "NO_OPEN=0"
set "ASK_UI=0"

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
if /i "%~1"=="--ask" set "ASK_UI=1" & shift & goto :parse_args
echo [ERROR] Unknown argument: %~1
goto :fail

:arg_ui
if "%~2"=="" goto :fail
if /i "%~2"=="aras" set "UI_MODE=aras" & shift & shift & goto :parse_args
if /i "%~2"=="dsh" set "UI_MODE=dsh" & shift & shift & goto :parse_args
echo [ERROR] Invalid --ui value "%~2". Expected "aras" or "dsh".
goto :fail

:arg_port
if "%~2"=="" goto :fail
set "PORT=%~2"
shift
shift
goto :parse_args

:arg_host
if "%~2"=="" goto :fail
set "HOST=%~2"
shift
shift
goto :parse_args

:args_done
if "%ASK_UI%"=="0" goto :start_now
echo Select UI: [1] Aras ^(default^)  [2] DSH
set "USER_CHOICE="
set /p "USER_CHOICE=Choice [1/2]: "
if "%USER_CHOICE%"=="2" set "UI_MODE=dsh"
if /i "%USER_CHOICE%"=="dsh" set "UI_MODE=dsh"

:start_now
if not defined NODE_COMPILE_CACHE (
    if defined LOCALAPPDATA (
        set "NODE_COMPILE_CACHE=%LOCALAPPDATA%\deepseek-harness\compile-cache"
    ) else (
        set "NODE_COMPILE_CACHE=%TEMP%\deepseek-harness-compile-cache"
    )
)
if not exist "%NODE_COMPILE_CACHE%" mkdir "%NODE_COMPILE_CACHE%" >nul 2>&1

if defined NO_PROXY (
    set "NO_PROXY=localhost,127.0.0.1,::1,[::1],%NO_PROXY%"
) else (
    set "NO_PROXY=localhost,127.0.0.1,::1,[::1]"
)
set "no_proxy=%NO_PROXY%"

set "BROWSER_HOST=%HOST%"
if "%HOST%"=="127.0.0.1" set "BROWSER_HOST=localhost"
if "%HOST%"=="::1" set "BROWSER_HOST=localhost"
if "%HOST%"=="0.0.0.0" set "BROWSER_HOST=localhost"
if "%HOST%"=="::" set "BROWSER_HOST=localhost"

echo ======================================================================
echo   Fast Start [%UI_MODE%] -^> http://%BROWSER_HOST%:%PORT%/  ^(bind %HOST%:%PORT%^)
echo   ^(Skipping all Node/pnpm/dependency checks — Ctrl+C to stop^)
echo ======================================================================

if /i "%UI_MODE%"=="dsh" goto :launch_dsh

:launch_aras
rem Initialize the isolated "aras" profile once, from the shipped "web" template.
rem $DSH_HOME is resolved exactly like @deepseek-ai/dsh-home-paths: blank -> %USERPROFILE%\.dsh,
rem leading "~" -> the user profile, and a relative path -> absolute from the current directory.
set "ARAS_PROFILE_INIT="
node -e "const fs=require('node:fs'),p=require('node:path'),os=require('node:os');let h=String(process.env.DSH_HOME||'').trim();if(!h){h=p.join(os.homedir(),'.dsh');}else if(h==='~'){h=os.homedir();}else if(h.indexOf('~/')===0||h.indexOf('~\\')===0){h=p.join(os.homedir(),h.slice(2));}process.exit(fs.existsSync(p.join(p.resolve(h),'profiles','aras','package.json'))?0:1);"
if errorlevel 1 set "ARAS_PROFILE_INIT=--from-default-profile web"

if "%NO_OPEN%"=="0" start "" /b node -e "const http=require('node:http'),cp=require('node:child_process'),u='http://%BROWSER_HOST%:%PORT%/';let n=0;const t=setInterval(function(){if(++n>=150)return clearInterval(t);const r=http.get({hostname:'%BROWSER_HOST%',port:%PORT%,path:'/',agent:false},function(res){if(res.statusCode===200){clearInterval(t);cp.exec('cmd /c start '+u);}res.resume();});r.on('error',function(){});},400);"

if "%HOST%"=="0.0.0.0" goto :launch_aras_standalone
if "%HOST%"=="::" goto :launch_aras_standalone

node --import tsx/esm apps/cli/src/bin.ts aras %ARAS_PROFILE_INIT% --patch ./packages/experimental/aras-ui/override-web.source.patch.yml --host "%HOST%" --port "%PORT%" --no-open
set "EXIT_CODE=%ERRORLEVEL%"
goto :finish

:launch_aras_standalone
set "ARAS_UI_HOST=%HOST%"
set "ARAS_UI_PORT=%PORT%"
node --import tsx/esm apps/cli/src/bin.ts aras %ARAS_PROFILE_INIT% --patch ./packages/experimental/aras-ui/standalone.source.patch.yml --no-open
set "EXIT_CODE=%ERRORLEVEL%"
goto :finish

:launch_dsh
set "DSH_OPEN_ARG="
if "%NO_OPEN%"=="1" set "DSH_OPEN_ARG=--no-open"
node --import tsx/esm apps/cli/src/bin.ts web --host "%HOST%" --port "%PORT%" %DSH_OPEN_ARG%
set "EXIT_CODE=%ERRORLEVEL%"
goto :finish

:show_help
echo Usage: %~nx0 [aras^|dsh] [--port 3080] [--host 127.0.0.1] [--no-open] [--ask]
echo   aras ^(default^)   Launch Aras Smart Assistant UI immediately
echo   dsh              Launch built-in DeepSeek Harness Web UI immediately
echo   --ask            Prompt interactively for aras vs dsh
popd >nul 2>&1
exit /b 0

:fail
set "EXIT_CODE=1"

:finish
if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] Server exited with code %EXIT_CODE%. ^(Run start-server.cmd if dependencies need setup^)
    pause
)
popd >nul 2>&1
exit /b %EXIT_CODE%
