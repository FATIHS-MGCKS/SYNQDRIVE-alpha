#!/usr/bin/env python3
"""Generate exactly ten post-vendor Prisma repair migrations (Slots 7-16)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1b_compile_repair_sql import compile_slot  # noqa: E402
from ci_r3b1e_constants import (  # noqa: E402
    MIG_ROOT,
    REMAINING_CONTRACTS,
    SLOT_MIGRATIONS,
    TOPOLOGY,
    VENDOR_CONTRACTS,
)


def load_contracts() -> dict[str, dict]:
    vendor = json.loads(VENDOR_CONTRACTS.read_text())
    remaining = json.loads(REMAINING_CONTRACTS.read_text())
    by_obj = {c["object"]: c for c in vendor["contracts"]}
    by_obj.update({c["object"]: c for c in remaining["contracts"]})
    return by_obj


def main() -> int:
    topology = json.loads(TOPOLOGY.read_text())
    contracts = load_contracts()
    generated = []
    for slot in topology["slots"]:
        slot_no = slot["slot"]
        if slot_no < 7 or slot_no > 16:
            continue
        mig_name = SLOT_MIGRATIONS[slot_no]
        sql = compile_slot(slot, contracts)
        out_dir = MIG_ROOT / mig_name
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "migration.sql"
        out_path.write_text(sql)
        generated.append({"slot": slot_no, "migration": mig_name, "path": str(out_path.relative_to(MIG_ROOT.parent.parent))})
        print(f"Wrote slot {slot_no}: {out_path}")
    if len(generated) != 10:
        print(f"FAIL: expected 10 migrations, got {len(generated)}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
