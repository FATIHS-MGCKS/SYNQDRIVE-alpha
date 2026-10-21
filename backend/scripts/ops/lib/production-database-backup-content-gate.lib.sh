#!/usr/bin/env bash
# Validate pg_dump artifacts before deploy may continue (fail-closed).
set -euo pipefail

_BACKUP_GATE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=production-database-identity-guard.lib.sh
source "${_BACKUP_GATE_LIB_DIR}/production-database-identity-guard.lib.sh"

pdb_backup_gate_assert_dump_file() {
  local file="${1:-}"
  local contract="${SYNQDRIVE_PRODUCTION_DB_CONTRACT:-${_BACKUP_GATE_LIB_DIR}/../contracts/production-database-identity.v1.json}"
  [[ -f "$file" ]] || pdb_guard_die "$PDB_GUARD_EXIT_BACKUP" "backup file missing: ${file}"
  gzip -t "$file" 2>/dev/null || pdb_guard_die "$PDB_GUARD_EXIT_BACKUP" "backup gzip integrity failed: ${file}"

  local size
  size="$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")"
  python3 - "$size" "$contract" <<'PY'
import json, sys
size = int(sys.argv[1])
c = json.load(open(sys.argv[2]))["backupContentGate"]
if size < int(c["minCompressedBytes"]):
    raise SystemExit(f"compressed size {size} < min {c['minCompressedBytes']}")
PY

  local result
  result="$(python3 - "$file" "$contract" <<'PY'
import gzip, json, re, sys
path, contract_path = sys.argv[1], sys.argv[2]
c = json.load(open(contract_path))["backupContentGate"]
counts = {}
with gzip.open(path, "rt", errors="replace") as fh:
    table = None
    for line in fh:
        if line.startswith("COPY public."):
            m = re.match(r"COPY public\.(\w+)", line)
            if m:
                table = m.group(1)
                counts.setdefault(table, 0)
        elif table and line.strip() == "\\.":
            table = None
        elif table:
            counts[table] += 1
errors = []
for t in c["requiredCopyTables"]:
    if t not in counts:
        errors.append(f"missing COPY block for {t}")
for t in c.get("forbiddenEmptyCoreTables", []):
    if counts.get(t, 0) == 0:
        errors.append(f"empty COPY data for {t}")
for t, floor in c.get("copyRowFloors", {}).items():
    if counts.get(t, 0) < int(floor):
        errors.append(f"{t} rows {counts.get(t,0)} < floor {floor}")
if errors:
    print("FAIL|" + "; ".join(errors))
else:
    print("OK|" + ",".join(f"{k}={counts.get(k,0)}" for k in c["requiredCopyTables"]))
PY
)"
  case "${result%%|*}" in
    FAIL)
      pdb_guard_die "$PDB_GUARD_EXIT_BACKUP" "backup content gate: ${result#FAIL|}"
      ;;
    OK)
      echo "==> backup content gate OK (${result#OK|}) file=${file}"
      ;;
    *)
      pdb_guard_die "$PDB_GUARD_EXIT_BACKUP" "backup content gate internal error"
      ;;
  esac
}
