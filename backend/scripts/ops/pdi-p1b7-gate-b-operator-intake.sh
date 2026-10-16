#!/usr/bin/env bash
# PDI P1B.7 Gate B — one authorized production manual intake (operator-controlled).
# Regular auth only: POST /api/v1/auth/login → Bearer → POST manual-intake.
# No secrets in this file. Do not log tokens, passwords, or full auth responses.
set -euo pipefail

API_BASE="${SYNQDRIVE_API_BASE:-https://app.synqdrive.eu/api/v1}"

DIMO_TOKEN="${PDI_DIMO_TOKEN:-192922}"
VEHICLE_ID="${PDI_VEHICLE_ID:-19fedd4b-c4e8-4de8-a125-dab293326e7e}"
ORG_ID="${PDI_ORG_ID:-faa710c9-6d91-4079-a7d5-91fdccdec14a}"
MODEL="${PDI_MODEL:-RUPTELA_R1}"
SERIAL="${PDI_SERIAL:-R1-865918076209847}"
WAREHOUSE="${PDI_WAREHOUSE_LOCATION:-Lager}"
IDEM_KEY="${PDI_IDEMPOTENCY_KEY:-p1b7-intake-token-192922}"

INTAKE_NOTES='PDI P1B.7 Gate B; DIMO 192922; IMEI null; warehouseLocation Lager = administratives Inventarlabel; Owner bestätigt physischen Einbau im VW Tiguan WOB L 7503 (19fedd4b-c4e8-4de8-a125-dab293326e7e)'

CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-15}"
CURL_MAX_TIME="${CURL_MAX_TIME:-120}"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

cleanup() {
  unset LOGIN_PASSWORD ACCESS_TOKEN 2>/dev/null || true
}
trap cleanup EXIT

require_cmd curl
require_cmd jq

echo "=== PDI P1B.7 Gate B operator intake ==="
echo "API base: ${API_BASE}"
echo "Target: DIMO ${DIMO_TOKEN}, serial ${SERIAL}"
echo ""

run_optional_ssh_preflight() {
  [[ -z "${SYNQDRIVE_SSH_HOST:-}" ]] && return 0
  local ssh_user="${SYNQDRIVE_SSH_USER:-synqdrive-admin}"
  echo "Optional SSH read-only preflight on ${SYNQDRIVE_SSH_HOST}..."
  if ! ssh -o BatchMode=yes -o ConnectTimeout=15 "${ssh_user}@${SYNQDRIVE_SSH_HOST}" bash -s \
    "$SERIAL" "$IDEM_KEY" "$DIMO_TOKEN" "$VEHICLE_ID" "$ORG_ID" <<'REMOTE'
set -euo pipefail
SERIAL="$1"
IDEM="$2"
TOKEN="$3"
VEH="$4"
ORG="$5"
echo "PRODUCTION_SHA=$(cd /opt/synqdrive/current && git rev-parse HEAD)"
grep -E '^PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED=|^PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED=' /opt/synqdrive/shared/backend.env || true
cd /opt/synqdrive/current/backend
set -a && source /opt/synqdrive/shared/backend.env && set +a
export PDI_S="$SERIAL" PDI_I="$IDEM" PDI_T="$TOKEN" PDI_V="$VEH" PDI_O="$ORG"
node <<'NODE'
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await c.connect();
  const identity = await c.query(
    `SELECT dv.token_id::text, dv.raw_json->'aftermarketDevice'->>'serial' AS raw_serial,
            v.id::text AS vehicle_id, v.organization_id::text AS org_id
     FROM dimo_vehicles dv
     JOIN vehicles v ON v.dimo_vehicle_id = dv.id
     WHERE dv.token_id = $1::int`,
    [process.env.PDI_T],
  );
  const dup = await c.query(
    `SELECT count(*)::int AS n FROM physical_devices WHERE upper(serial_number) = upper($1)`,
    [process.env.PDI_S],
  );
  const idem = await c.query(
    `SELECT count(*)::int AS n FROM physical_device_assignments WHERE idempotency_key = $1`,
    [process.env.PDI_I],
  );
  const row = identity.rows[0] ?? null;
  if (!row || row.raw_serial !== process.env.PDI_S || row.vehicle_id !== process.env.PDI_V || row.org_id !== process.env.PDI_O) {
    console.error('IDENTITY_MISMATCH');
    process.exit(2);
  }
  if (dup.rows[0].n > 0 || idem.rows[0].n > 0) {
    console.error('ALREADY_PRESENT');
    process.exit(3);
  }
  console.log(JSON.stringify({
    identity: row,
    physicalDeviceRowsForSerial: dup.rows[0].n,
    idempotencyAssignmentRows: idem.rows[0].n,
  }));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
NODE
REMOTE
  then
    die "SSH preflight failed. Aborting (cannot confirm idempotency/inventory state)."
  fi
}

run_optional_ssh_preflight

DEFAULT_EMAIL="${SYNQDRIVE_MASTER_ADMIN_EMAIL:-admin@synqdrive.de}"
read -r -p "Master admin email [${DEFAULT_EMAIL}]: " LOGIN_EMAIL
LOGIN_EMAIL="${LOGIN_EMAIL:-$DEFAULT_EMAIL}"

read -r -s -p "Password (no echo): " LOGIN_PASSWORD
echo ""

LOGIN_BODY=$(jq -n --arg email "$LOGIN_EMAIL" --arg password "$LOGIN_PASSWORD" \
  '{email:$email,password:$password}')

LOGIN_HTTP_FILE=$(mktemp)
LOGIN_CODE=$(curl -sS -o "$LOGIN_HTTP_FILE" -w '%{http_code}' \
  --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
  -X POST "${API_BASE}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$LOGIN_BODY") || {
  rm -f "$LOGIN_HTTP_FILE"
  die "Login request failed (network/timeout). No intake attempted."
}
unset LOGIN_PASSWORD LOGIN_BODY

if [[ "$LOGIN_CODE" != "200" ]]; then
  rm -f "$LOGIN_HTTP_FILE"
  die "Login HTTP ${LOGIN_CODE}. No intake attempted (response not logged)."
fi

LOGIN_JSON=$(cat "$LOGIN_HTTP_FILE")
rm -f "$LOGIN_HTTP_FILE"

if [[ "$(echo "$LOGIN_JSON" | jq -r '.requiresMfa // false')" == "true" ]]; then
  die "Login requires MFA. Aborting."
fi

ACCESS_TOKEN=$(echo "$LOGIN_JSON" | jq -r '.accessToken // .token // empty')
if [[ -z "$ACCESS_TOKEN" || "$ACCESS_TOKEN" == "null" ]]; then
  die "Login succeeded but no access token (not logged)."
fi

PLATFORM_ROLE=$(echo "$LOGIN_JSON" | jq -r '.user.platformRole // empty')
if [[ "$PLATFORM_ROLE" != "MASTER_ADMIN" ]]; then
  die "Authenticated user is not MASTER_ADMIN. Aborting."
fi

AUTH_USER_ID=$(echo "$LOGIN_JSON" | jq -r '.user.id // empty')
echo "AUTH OK: MASTER_ADMIN user id ${AUTH_USER_ID}"

ENC_SERIAL=$(printf '%s' "$SERIAL" | jq -sRr @uri)
LIST_HTTP=$(mktemp)
LIST_CODE=$(curl -sS -o "$LIST_HTTP" -w '%{http_code}' \
  --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${API_BASE}/admin/physical-device-inventory/devices?search=${ENC_SERIAL}&limit=50") || {
  rm -f "$LIST_HTTP"
  die "Preflight list failed (network). Cannot confirm prior intake. Aborting."
}

if [[ "$LIST_CODE" != "200" ]]; then
  rm -f "$LIST_HTTP"
  die "Preflight list HTTP ${LIST_CODE}. Cannot confirm inventory state. Aborting."
fi

LIST_JSON=$(cat "$LIST_HTTP")
rm -f "$LIST_HTTP"

TOTAL=$(echo "$LIST_JSON" | jq '.total // 0')
if [[ "$TOTAL" != "0" ]]; then
  die "Preflight: inventory search returned total=${TOTAL} for serial. Aborting — intake may already exist."
fi

echo ""
echo "=== Planned mutation (redacted preview) ==="
jq -n \
  --arg model "$MODEL" \
  --arg serial "$SERIAL" \
  --arg org "$ORG_ID" \
  --arg wh "$WAREHOUSE" \
  --arg key "$IDEM_KEY" \
  --arg notes "$INTAKE_NOTES" \
  '{
    endpoint: "POST /admin/physical-device-inventory/devices/manual-intake",
    body: {
      modelCode: $model,
      serialNumber: $serial,
      warehouseLocation: $wh,
      ownerOrganizationId: $org,
      intakeNotes: $notes,
      idempotencyKey: $key,
      imei: null
    },
    dimoToken: 192922,
    vehicleId: "19fedd4b-c4e8-4de8-a125-dab293326e7e",
    physicalInstallOwnerConfirmed: "intakeNotes only (Owner)",
    warehouseSemantics: "administrative Lagerort label, not physical depot"
  }'

echo ""
read -r -p "Type exactly YES to execute ONE production manual-intake POST: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
  die "Confirmation declined. No POST sent."
fi

INTAKE_BODY=$(jq -n \
  --arg model "$MODEL" \
  --arg serial "$SERIAL" \
  --arg org "$ORG_ID" \
  --arg wh "$WAREHOUSE" \
  --arg key "$IDEM_KEY" \
  --arg notes "$INTAKE_NOTES" \
  '{
    modelCode: $model,
    serialNumber: $serial,
    warehouseLocation: $wh,
    ownerOrganizationId: $org,
    intakeNotes: $notes,
    idempotencyKey: $key
  }')

INTAKE_HTTP=$(mktemp)
set +e
INTAKE_CODE=$(curl -sS -o "$INTAKE_HTTP" -w '%{http_code}' \
  --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
  -X POST "${API_BASE}/admin/physical-device-inventory/devices/manual-intake" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "$INTAKE_BODY")
CURL_EXIT=$?
set -e

INTAKE_JSON=$(cat "$INTAKE_HTTP")
rm -f "$INTAKE_HTTP"

if [[ "$CURL_EXIT" -ne 0 ]]; then
  die "Intake curl exit ${CURL_EXIT} (timeout/network). Do NOT retry — inspect read-only."
fi

if [[ "$INTAKE_CODE" != "200" && "$INTAKE_CODE" != "201" ]]; then
  echo "Intake HTTP ${INTAKE_CODE}. Error summary:" >&2
  echo "$INTAKE_JSON" | jq '{message, code, statusCode}' 2>/dev/null || true
  die "Intake failed. Do NOT retry without read-only inspection."
fi

DEVICE_ID=$(echo "$INTAKE_JSON" | jq -r '.id // empty')
INTERNAL_NO=$(echo "$INTAKE_JSON" | jq -r '.internalInventoryNumber // empty')
DEVICE_STATUS=$(echo "$INTAKE_JSON" | jq -r '.status // empty')
IDENTITY_STATUS=$(echo "$INTAKE_JSON" | jq -r '.identityStatus // empty')

echo ""
echo "=== Intake response (safe fields) ==="
echo "$INTAKE_JSON" | jq '{
  id,
  internalInventoryNumber,
  modelCode,
  status,
  identityStatus,
  ownerOrganizationId,
  warehouseLocation,
  serialNumberMasked,
  imeiMasked,
  currentVehicleId
}'

if [[ -z "$DEVICE_ID" ]]; then
  die "Ambiguous success: missing device id. Do NOT retry."
fi

echo ""
echo "=== Read-only postcheck (API) ==="
DETAIL_HTTP=$(mktemp)
DETAIL_CODE=$(curl -sS -o "$DETAIL_HTTP" -w '%{http_code}' \
  --connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${API_BASE}/admin/physical-device-inventory/devices/${DEVICE_ID}")

if [[ "$DETAIL_CODE" != "200" ]]; then
  rm -f "$DETAIL_HTTP"
  die "Postcheck detail HTTP ${DETAIL_CODE}. Intake may have succeeded — verify read-only in UI/DB."
fi

ASSIGNMENT_COUNT=$(jq '[.assignmentHistory[]? | select(.vehicleId != null and (.effectiveTo == null or .effectiveTo == ""))] | length' "$DETAIL_HTTP")
AUDIT_KINDS=$(jq '[.auditHistory[]?.eventKind] | join(",")' "$DETAIL_HTTP")

jq '{
  id,
  status,
  identityStatus,
  imeiMasked,
  currentVehicleId,
  warehouseLocation,
  assignmentHistory: [.assignmentHistory[]? | {assignmentKind, vehicleId, effectiveTo}],
  auditHistory: [.auditHistory[]? | {eventKind, createdAt}]
}' "$DETAIL_HTTP"

rm -f "$DETAIL_HTTP"
unset ACCESS_TOKEN

echo ""
echo "POST_COUNT=1"
echo "DEVICE_ID=${DEVICE_ID}"
echo "INTERNAL_INVENTORY_NUMBER=${INTERNAL_NO}"
echo "DEVICE_STATUS=${DEVICE_STATUS}"
echo "IDENTITY_STATUS=${IDENTITY_STATUS}"
echo "ACTIVE_VEHICLE_ASSIGNMENT_COUNT=${ASSIGNMENT_COUNT}"
echo "AUDIT_EVENTS=${AUDIT_KINDS}"
echo "Done. No verify/install. Gate C remains locked."
