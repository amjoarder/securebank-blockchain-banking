@echo off
rem Assignment 3 launcher: uses the project's portable Node.js (.tools\node) for this command only.
rem Usage:  a3 <npm-script> [args]      e.g.  a3 demo   a3 test   a3 benchmark   a3 stop
setlocal
if exist "%~dp0.tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>nul || (echo Node.js not found. See README.md "Prerequisites". & exit /b 1)
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: a3 ^<script^>   Scripts: setup demo blockchain deploy seed reset frontend build test benchmark charts status stop
  exit /b 1
)
npm run %*
