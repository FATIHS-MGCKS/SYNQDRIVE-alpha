#!/usr/bin/env python3
"""Verify backup capture sidecar + pg_dump \\connect target (no shell pipes)."""
import gzip
import json
import sys


def fail(msg: str) -> None:
    print(f"FAIL|{msg}", file=sys.stdout)
    sys.exit(0)


def main() -> None:
    if len(sys.argv) != 4:
        fail("usage: backup-capture-verify.py <capture.json> <dump.sql.gz> <expected_db>")
    capture_path, dump_path, expected_db = sys.argv[1], sys.argv[2], sys.argv[3]
    try:
        cap = json.load(open(capture_path, encoding="utf-8"))
    except OSError as e:
        fail(f"capture unreadable: {e}")
    for key in ("dbname", "db_oid", "server_port"):
        if key not in cap:
            fail(f"capture missing {key}")
    if cap["dbname"] != expected_db:
        fail(f"capture dbname {cap['dbname']} != expected {expected_db}")

    connect_targets: list[str] = []
    try:
        with gzip.open(dump_path, "rt", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if line.startswith("\\connect "):
                    parts = line.strip().split()
                    if len(parts) >= 2:
                        connect_targets.append(parts[1].strip('"'))
    except OSError as e:
        fail(f"dump unreadable: {e}")

    if not connect_targets:
        fail("no \\\\connect directives in dump (cannot prove database target)")
    if expected_db not in connect_targets:
        fail(f"dump \\\\connect targets {connect_targets!r} lack {expected_db}")
    if any(t for t in connect_targets if t != expected_db and t not in ("template1", "postgres")):
        fail(f"dump connects to foreign database(s): {connect_targets}")

    print(
        "OK|"
        + json.dumps(
            {
                "capture_db": cap["dbname"],
                "capture_oid": cap["db_oid"],
                "connect_targets": connect_targets,
            }
        )
    )


if __name__ == "__main__":
    main()
