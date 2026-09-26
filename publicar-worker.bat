@echo off
chcp 65001 >nul
setlocal
REM Publica o Cloudflare Worker (MakerWorld + mercado) e, por padrao,
REM em seguida o site no Netlify. Passe "sozinho" para publicar so o worker.
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org
  exit /b 1
)

set "NPMG="
for /f "delims=" %%i in ('npm prefix -g') do set "NPMG=%%i"
set "WRANGLER=%NPMG%\wrangler.cmd"
if not exist "%WRANGLER%" (
  echo === Instalando o Wrangler ...
  call npm install -g wrangler
)
if not exist "%WRANGLER%" (
  echo [ERRO] Wrangler nao encontrado em "%WRANGLER%".
  goto erro
)

call "%WRANGLER%" whoami >nul 2>nul
if errorlevel 1 (
  echo === Login no Cloudflare ...
  call "%WRANGLER%" login
  if errorlevel 1 goto erro
) else (
  echo Cloudflare: sessao ja aberta.
)

echo === Conferindo o subdominio workers.dev ...
powershell -NoProfile -ExecutionPolicy Bypass -File "cloudflare-worker\subdominio.ps1"
if errorlevel 1 goto erro

echo === Publicando o Worker ...
set "LOG=%TEMP%\minted-worker-deploy.log"
pushd cloudflare-worker
call "%WRANGLER%" deploy > "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
popd
type "%LOG%"
if not "%RC%"=="0" goto erro

set "WURL="
for /f "delims=" %%u in ('powershell -NoProfile -Command "$m = Select-String -Path $env:LOG -Pattern 'https://[a-z0-9.-]+\.workers.dev' | Select-Object -First 1; if ($m) { $m.Matches[0].Value }"') do set "WURL=%%u"
if "%WURL%"=="" (
  echo [ERRO] Nao achei o endereco workers.dev na saida acima.
  goto erro
)

echo === Gravando o endereco na calculadora: %WURL%
> "calculadora\mw-worker.js" echo window.MW_WORKER = '%WURL%';
> "admin\mw-worker.js" echo window.MW_WORKER = '%WURL%';

echo.
echo Worker no ar:  %WURL%/?id=13284
echo Mercado:       %WURL%/market?q=dragao+articulado

if /i "%~1"=="sozinho" exit /b 0

echo.
echo === Publicando o site no Netlify ...
call "%~dp0publicar-netlify.bat" site
if errorlevel 1 goto erro
exit /b 0

:erro
echo.
echo [ERRO] Algo falhou acima.
exit /b 1
