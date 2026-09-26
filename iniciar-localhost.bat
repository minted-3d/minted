@echo off
REM Inicia o site da Minted em http://localhost:8000
cd /d "%~dp0"
echo Abrindo o site da Minted em http://127.0.0.1:8000 ...
start "" http://127.0.0.1:8000/calculadora/
python servir.py
if %ERRORLEVEL% neq 0 (
  echo Python nao encontrado. Subindo servidor em PowerShell...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servir.ps1"
)
