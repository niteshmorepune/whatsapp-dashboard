#!/usr/bin/env bash
set -e

echo "=== WhatsApp Dashboard — Local Setup ==="

# 1. Install dependencies
echo ""
echo "[1/5] Installing npm dependencies..."
npm install

# 2. Generate Prisma client
echo ""
echo "[2/5] Generating Prisma client..."
npx prisma generate

# 3. Check for .env.local
echo ""
echo "[3/5] Checking .env.local..."
if [ ! -f ".env.local" ]; then
  echo "ERROR: .env.local not found."
  echo "  Copy the template and fill in your values:"
  echo "  cp .env.local.example .env.local   # if template exists"
  echo "  Then edit .env.local and re-run this script."
  exit 1
fi

# 4. Warn about placeholders
echo ""
echo "[4/5] Checking for unfilled placeholders in .env.local..."
if grep -q "REPLACE_WITH" .env.local; then
  echo "WARNING: Some values in .env.local still contain REPLACE_WITH_... placeholders."
  echo "  Fill them before running the dev server if you need Meta API / QStash features."
fi

# 5. Run database migrations and seed
echo ""
echo "[5/5] Running database migrations..."
npx prisma migrate deploy

echo ""
read -rp "Seed the database with an admin account and sample templates? [y/N] " SEED
if [[ "$SEED" =~ ^[Yy]$ ]]; then
  npm run db:seed
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Start the dev server with:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000"
echo "  Default admin credentials are in prisma/seed.ts"
