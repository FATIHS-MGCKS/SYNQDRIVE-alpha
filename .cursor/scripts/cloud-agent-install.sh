#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

chmod +x .cursor/scripts/*.sh

echo "[cloud-agent] Installing backend dependencies..."
cd backend
npm ci
npx prisma generate

echo "[cloud-agent] Installing frontend dependencies..."
cd "$ROOT/frontend"
npm ci

echo "[cloud-agent] Install complete."
