#!/usr/bin/env bash
# Install Playwright Chromium for CI. ubuntu-latest may ship a broken Microsoft apt source
# (403 on packages.microsoft.com) that makes `playwright install --with-deps` fail before tests run.
set -euo pipefail

if [[ -f /etc/apt/sources.list.d/microsoft-prod.list ]]; then
  sudo rm -f /etc/apt/sources.list.d/microsoft-prod.list
fi

npx playwright install --with-deps chromium
