#!/usr/bin/env bash
# Clones Kronos (pinned commit), creates .venv and installs everything.
set -euo pipefail
cd "$(dirname "$0")"

KRONOS_COMMIT=67b630e67f6a18c9e9be918d9b4337c960db1e9a

if [ ! -d vendor/Kronos ]; then
  git clone https://github.com/shiyu-coder/Kronos.git vendor/Kronos
fi
git -C vendor/Kronos fetch --quiet origin "$KRONOS_COMMIT" || true
git -C vendor/Kronos checkout --quiet "$KRONOS_COMMIT"

python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo
echo "Klaar. Controleer de installatie met:"
echo "  .venv/bin/python -m kronos_trader check"
