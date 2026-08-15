#!/usr/bin/env python3
"""Migration order proof for CI-R3B1I IAM repair."""
from __future__ import annotations

import json

from ci_r3b1i_constants import DATA, IAM_CONSUMER, IAM_PREDECESSOR, IAM_REPAIR_MIGRATION, evidence_input_sha
from replay_evidence_lib import migration_dirs

OUT = DATA / "ci-r3b1i-migration-order-proof-2026-08.json"


def main() -> int:
    dirs = migration_dirs()
    idx_pre = dirs.index(IAM_PREDECESSOR)
    idx_new = dirs.index(IAM_REPAIR_MIGRATION)
    idx_consumer = dirs.index(IAM_CONSUMER)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1I",
        "evidence_input_sha": evidence_input_sha(),
        "authorized_predecessor": IAM_PREDECESSOR,
        "new_migration": IAM_REPAIR_MIGRATION,
        "first_consumer": IAM_CONSUMER,
        "lexical_ordering_pass": idx_pre < idx_new < idx_consumer,
        "indices": {"predecessor": idx_pre, "repair": idx_new, "consumer": idx_consumer},
        "pass": idx_pre < idx_new < idx_consumer,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"pass": out["pass"], "lexical_ordering_pass": out["lexical_ordering_pass"]}, indent=2))
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
