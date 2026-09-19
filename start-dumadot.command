#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 20+ and run this file again."
  read -p "Press Enter to close..."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing Dumadot dependencies..."
  npm install || { read -p "Dependency installation failed. Press Enter to close..."; exit 1; }
fi
echo "Starting Dumadot at http://localhost:3000"
open "http://localhost:3000" 2>/dev/null || true
npm start
