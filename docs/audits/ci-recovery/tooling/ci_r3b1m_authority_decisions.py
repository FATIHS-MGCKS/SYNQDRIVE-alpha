"""Fresh R3B1M authority decisions from hardened preflight classification."""
from __future__ import annotations

import json
from typing import Any

from ci_r3b1l2_authority_decisions import build_authority_decisions as build_base_decisions
from ci_r3b1m_constants import DATA

PREFLIGHT_AUTHORITY_OUT = DATA / "ci-r3b1m-preflight-r3b-drift-authority-2026-08.json"


def build_preflight_authority_decisions(r3b_operations: list[dict[str, Any]]) -> dict[str, Any]:
    out = build_base_decisions(r3b_operations)
    out["phase"] = "CI-R3B1M"
    out["prefix_inference_acceptance"] = False
    out["source"] = "fresh R3B1M preflight classification — not copied from R3B1L21"
    PREFLIGHT_AUTHORITY_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out
