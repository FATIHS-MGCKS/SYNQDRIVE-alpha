#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ "${CHARGING_OSM_TESTS_REQUIRED:-}" == "1" ]]; then
  python3 -c "import osmium" 2>/dev/null || {
    echo "ERROR: pyosmium required when CHARGING_OSM_TESTS_REQUIRED=1" >&2
    exit 1
  }
fi

python3 -m unittest discover -s tests -p 'test_*.py' -v
