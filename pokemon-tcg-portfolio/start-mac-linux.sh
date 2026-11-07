#!/usr/bin/env bash
# Start de TCG Portfolio app op macOS of Linux:  ./start-mac-linux.sh
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Installeer eerst Node.js (LTS) via https://nodejs.org"; exit 1; }
[ -f .env ] || cp .env.example .env
[ -d node_modules ] || npm install
npm run build
( sleep 2; (command -v open >/dev/null && open http://localhost:3001) || xdg-open http://localhost:3001 >/dev/null 2>&1 || true ) &
node server/index.js
