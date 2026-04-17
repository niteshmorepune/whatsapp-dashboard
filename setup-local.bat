@echo off
setlocal enabledelayedexpansion

echo === WhatsApp Dashboard - Local Setup ===

REM 1. Install dependencies
echo.
echo [1/5] Installing npm dependencies...
call npm install
if errorlevel 1 ( echo ERROR: npm install failed & exit /b 1 )

REM 2. Generate Prisma client
echo.
echo [2/5] Generating Prisma client...
call npx prisma generate
if errorlevel 1 ( echo ERROR: prisma generate failed & exit /b 1 )

REM 3. Check for .env.local
echo.
echo [3/5] Checking .env.local...
if not exist ".env.local" (
  echo ERROR: .env.local not found.
  echo   Create it and fill in your values, then re-run this script.
  exit /b 1
)

REM 4. Warn about placeholders
echo.
echo [4/5] Checking for unfilled placeholders in .env.local...
findstr /C:"REPLACE_WITH" .env.local >nul 2>&1
if not errorlevel 1 (
  echo WARNING: Some values in .env.local still contain REPLACE_WITH_... placeholders.
  echo   Fill them before running the dev server if you need Meta API / QStash features.
)

REM 5. Run database migrations
echo.
echo [5/5] Running database migrations...
call npx prisma migrate deploy
if errorlevel 1 ( echo ERROR: prisma migrate deploy failed & exit /b 1 )

echo.
set /p SEED="Seed the database with an admin account and sample templates? [y/N] "
if /i "!SEED!"=="y" (
  call npm run db:seed
  if errorlevel 1 ( echo ERROR: seed failed & exit /b 1 )
)

echo.
echo === Setup complete! ===
echo.
echo Start the dev server with:
echo   npm run dev
echo.
echo Then open http://localhost:3000
echo Default admin credentials are in prisma/seed.ts

endlocal
