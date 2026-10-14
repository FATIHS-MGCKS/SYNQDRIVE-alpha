#!/usr/bin/env bash
# Node + SQL V3 raw-json parity and manifest/metadata checks (read-only).
set -eo pipefail

APPROVED_SQL_PATH="$1"
DRY_RUN_PATH="${2:-/tmp/vo-sig-b1-dry-run-live.json}"
BACKEND="${3:-$(readlink -f /opt/synqdrive/current/backend)}"
DBURL="${DATABASE_URL%%\?*}"

[[ -f "$APPROVED_SQL_PATH" && -f "$DRY_RUN_PATH" ]] || {
  echo "usage: vo-sig-b1-prod-readonly-parity.sh <approved-v3.sql> [dry-run.json] [backend-dir]" >&2
  exit 1
}

cd "$BACKEND"
export APPROVED_SQL_PATH DRY_RUN_PATH DBURL
node <<'NODE'
const { createRequire } = require('module');
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const req = createRequire(path.join(process.cwd(), 'package.json'));
const { PrismaClient } = req('@prisma/client');

const APPROVED_BY_LINK = {
  '6fcca9d4-99d5-4be8-8985-e9369c53b7f6': {
    rawJsonSha256: '05c3ee737aebde3e371bf0e5c948998dd2f5f289cfd4f4a13b92e49e14156758',
    priorLinkLastVerifiedAt: '2026-08-25T18:52:48.114Z',
    metadataFingerprint: '53ebd44ce1a8fab5f2e5073c9667fef3b2ae948aa36d366c55c18e535d76bc6f',
  },
  '9ff5e350-cd4b-4e3a-956a-4f1770b017f2': {
    rawJsonSha256: '9d8d09624ba6a091d53e38ae7768ae1e1da1b29775059378b15e050416f1f47c',
    priorLinkLastVerifiedAt: '2026-08-25T18:52:48.354Z',
    metadataFingerprint: '5033337d03382a38fb99a9e01260b8038ed2f228353436d387d7967a90d257e5',
  },
  '805b271c-ba87-4776-9e39-23e24d595c53': {
    rawJsonSha256: '7f28c8a06cabd670a27ee22efccaa869d24c6c35f8834956317f2a8bec635e86',
    priorLinkLastVerifiedAt: '2026-08-25T18:52:48.215Z',
    metadataFingerprint: '5ec4fb8e5a8060b6802104fc3e09bd8e148d70af4bc9869bfc94c66af8156e12',
  },
  '71b75519-3053-4836-8bcd-554680d592b2': {
    rawJsonSha256: 'c8c8fc45c68da72e287bf3a503c0c154e25522aaad8beb109d4106cc5f888ec0',
    priorLinkLastVerifiedAt: '2026-08-25T18:52:48.258Z',
    metadataFingerprint: '3d1709fae07f81c8ed33ca9d497e8f6e60107e3b3b695ebe093941469e50eb64',
  },
};

const sqlPath = process.env.APPROVED_SQL_PATH;
const dryRunPath = process.env.DRY_RUN_PATH;
const dbUrl = process.env.DBURL;
const v3 = readFileSync(sqlPath, 'utf8');
const start = v3.indexOf('CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_json_stringify_node');
const end = v3.indexOf('CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_merge_connection_identity');
const helpers = v3.slice(start, end);

function nodeSha256(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

(async () => {
  const prisma = new PrismaClient();
  let rawOk = 0;
  let lvOk = 0;
  for (const linkId of Object.keys(APPROVED_BY_LINK)) {
    const approved = APPROVED_BY_LINK[linkId];
    const rows = await prisma.$queryRaw`
      SELECT d.raw_json, l.last_verified_at
      FROM vehicle_data_source_links l
      JOIN dimo_vehicles d ON d.id = l.dimo_vehicle_id
      WHERE l.id = ${linkId}
    `;
    const row = rows[0];
    const nodeHash = nodeSha256(row.raw_json);
    const sqlOut = execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-f', '-'], {
      input: `${helpers}
SELECT pg_temp.vo_sig_b1_sha256_node_json(d.raw_json)
FROM dimo_vehicles d
INNER JOIN vehicle_data_source_links l ON l.dimo_vehicle_id = d.id
WHERE l.id = '${linkId}';
`,
      encoding: 'utf8',
    }).trim();
    const sqlHash = sqlOut.split('\n').filter((line) => /^[0-9a-f]{64}$/.test(line)).pop() || '';
    const lv = row.last_verified_at ? new Date(row.last_verified_at).toISOString() : null;
    if (nodeHash === sqlHash && nodeHash === approved.rawJsonSha256) rawOk += 1;
    if (lv === approved.priorLinkLastVerifiedAt) lvOk += 1;
    console.log(`link=${linkId} raw=${nodeHash === sqlHash && nodeHash === approved.rawJsonSha256} lv=${lv === approved.priorLinkLastVerifiedAt}`);
  }
  const dryRun = JSON.parse(readFileSync(dryRunPath, 'utf8'));
  let metaOk = 0;
  for (const row of dryRun.rows) {
    const approved = APPROVED_BY_LINK[row.sourceLinkId];
    if (row.currentMetadataFingerprint === approved.metadataFingerprint) metaOk += 1;
  }
  console.log(`RAW_JSON_HASH_4_OF_4=${rawOk === 4 ? 'YES' : `NO(${rawOk}/4)`}`);
  console.log(`LAST_VERIFIED_AT_4_OF_4=${lvOk === 4 ? 'YES' : `NO(${lvOk}/4)`}`);
  console.log(`METADATA_FINGERPRINT_4_OF_4=${metaOk === 4 ? 'YES' : `NO(${metaOk}/4)`}`);
  await prisma.$disconnect();
  if (rawOk !== 4 || lvOk !== 4 || metaOk !== 4) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE
