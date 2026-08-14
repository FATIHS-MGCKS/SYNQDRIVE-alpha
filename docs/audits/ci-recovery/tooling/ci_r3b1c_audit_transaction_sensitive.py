#!/usr/bin/env python3
"""Scan all migration SQL for transaction-sensitive statements."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from replay_evidence_lib import DATA, audit_transaction_sensitive_migrations


def main() -> int:
    result = audit_transaction_sensitive_migrations()
    out = DATA / "ci-r3b1c-transaction-sensitive-migration-inventory-2026-08.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in result if k != "records"}, indent=2))
    print(f"Wrote {out}")
    return 1 if result["unresolved_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
