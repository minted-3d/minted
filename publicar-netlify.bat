@echo off
chcp 65001 >nul
setlocal
REM Publica o site da Minted no Netlify (calculadora + /api/makerworld + /api/market).
REM Sem argumento, publica o Worker antes. Passe "site" para publicar so o Netlify.
cd /d "%~dp0"

if /i not "%~1"=="site" (
  echo === 0/4 Worker Cloudflare ...
  call "%~dp0publicar-worker.bat" sozinho
  if errorlevel 1 goto erro
)

where npx >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org
  exit /b 1
)

if exist "cloudflare-worker\market.js" (
  copy /Y "cloudflare-worker\market.js" "netlify\functions\_market.mjs" >nul
)

set "DIST=%TEMP%\minted-deploy"
echo === 1/4 Separando os arquivos do site em %DIST% ...
if exist "%DIST%" rmdir /s /q "%DIST%"
robocopy "%~dp0." "%DIST%" /E /NFL /NDL /NJH /NJS /NP ^
  /XD studio cloudflare-worker __pycache__ .agents netlify .netlify .git node_modules ^
  /XF *.xlsx *.py *.pyc *.ps1 *.bat *.jsonl config.json skills-lock.json test-hero.html
if errorlevel 8 (
  echo [ERRO] Falha ao copiar os arquivos.
  goto erro
)

set "NPMG="
for /f "delims=" %%i in ('npm prefix -g') do set "NPMG=%%i"
set "NETLIFY=%NPMG%\netlify.cmd"
if not exist "%NETLIFY%" (
  echo === Instalando o Netlify CLI ...
  call npm install -g netlify-cli
)
if not exist "%NETLIFY%" (
  echo [ERRO] Netlify CLI nao encontrado em "%NETLIFY%".
  goto erro
)

call "%NETLIFY%" status >nul 2>nul
if errorlevel 1 (
  echo === Login no Netlify ...
  call "%NETLIFY%" login
  if errorlevel 1 goto erro
) else (
  echo Netlify: sessao ja aberta.
)

if not exist ".netlify\state.json" (
  echo === Ligando a pasta ao site ...
  call "%NETLIFY%" link --id "e1ec79ef-b81d-488e-840a-0e70145e6056"
  if errorlevel 1 goto erro
)

echo === Publicando em producao (site + funcoes makerworld e market) ...
call "%NETLIFY%" deploy --prod --dir "%DIST%" --functions "netlify\functions" --site "e1ec79ef-b81d-488e-840a-0e70145e6056"
if errorlevel 1 goto erro

echo.
echo Pronto. Calculadora: https://www.minted.com.br/calculadora/
echo Ficha completa:    https://www.minted.com.br/admin/
echo MakerWorld:         https://www.minted.com.br/api/makerworld?id=13284
echo Mercado:            https://www.minted.com.br/api/market?q=dragao+articulado
exit /b 0

:erro
echo.
echo [ERRO] Algo falhou acima.
exit /b 1
