@echo off
setlocal
cd /d "%~dp0"

where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  echo pnpm.cmd was not found. Install pnpm before deploying.
  exit /b 1
)

if not exist "dist\server\wrangler.json" if not exist "config\deployment.json" (
  echo Deployment database configuration is missing.
  exit /b 1
)

set "APP_D1_DATABASE_ID="
for /f "usebackq delims=" %%I in (`node scripts/read-deployment-id.mjs`) do set "APP_D1_DATABASE_ID=%%I"
if not defined APP_D1_DATABASE_ID (
  echo D1 database ID is missing. No deployment was performed.
  exit /b 1
)
if "%APP_D1_DATABASE_ID%"=="00000000-0000-4000-8000-000000000000" (
  echo D1 database ID is a placeholder. No deployment was performed.
  exit /b 1
)

call pnpm.cmd run test:logic
if errorlevel 1 exit /b 1
call pnpm.cmd run test:diagnosis
if errorlevel 1 exit /b 1
call pnpm.cmd run test:search
if errorlevel 1 exit /b 1
call pnpm.cmd run test:interview-hypotheses
if errorlevel 1 exit /b 1
call pnpm.cmd run test:materials
if errorlevel 1 exit /b 1
call pnpm.cmd run test:records
if errorlevel 1 exit /b 1
call pnpm.cmd run test:panel
if errorlevel 1 exit /b 1
call pnpm.cmd run test:deploy-config
if errorlevel 1 exit /b 1
call pnpm.cmd run build
if errorlevel 1 exit /b 1

set "BUILT_D1_DATABASE_ID="
for /f "usebackq delims=" %%I in (`node scripts/read-deployment-id.mjs --built-only`) do set "BUILT_D1_DATABASE_ID=%%I"
if not "%BUILT_D1_DATABASE_ID%"=="%APP_D1_DATABASE_ID%" (
  echo D1 database ID changed during build. No deployment was performed.
  exit /b 1
)

call pnpm.cmd run db:migrate:remote
if errorlevel 1 exit /b 1
call pnpm.cmd exec wrangler deploy --config dist/server/wrangler.json --keep-vars
if errorlevel 1 (
  echo Deployment failed. Login tables were migrated; existing project records were preserved. Check the Wrangler output above.
  exit /b 1
)

powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'https://venture-mentor-team-test.jerry-mentor-test.workers.dev/' -TimeoutSec 20; if ($r.StatusCode -ne 200) { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo Deployment completed, but this computer could not verify the public page. Test it from an accessible network.
  exit /b 0
)
echo Deployment completed and the public page returned HTTP 200.
echo Sign in with your existing owner test code, then check an AI reply and Confirm Save.
