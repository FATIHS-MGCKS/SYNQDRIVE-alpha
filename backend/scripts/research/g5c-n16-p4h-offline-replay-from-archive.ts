/**
 * G5C-N16 P4H — offline replay from sealed raw archives (no DIMO, no DB).
 *
 * P4H_RAW_ARCHIVE_DIR=/opt/cursor/artifacts/p4h/raw \
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/research/g5c-n16-p4h-offline-replay-from-archive.ts
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import type { P4hRawArchiveV1 } from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/p4h-raw-archive.v1';
import { evaluateP4hArchivedTrip } from '../../src/modules/vehicle-intelligence/battery-health/lv-start-proxy/research/p4h-offline-trip-evaluation';

const ARCHIVE_DIR =
  process.env.P4H_RAW_ARCHIVE_DIR ?? '/opt/cursor/artifacts/p4h/raw';
const OUT_DIR = process.env.P4H_OFFLINE_OUT_DIR ?? '/opt/cursor/artifacts/p4h';

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith('.p4h-raw.v1.json'));
  if (files.length === 0) {
    console.error(
      JSON.stringify({
        error: 'no_archives',
        archiveDir: ARCHIVE_DIR,
        hint: 'Run P4H benchmark with owner auth to populate raw JSON archives.',
      }),
    );
    process.exit(2);
  }

  const liveAt = process.env.P4H_LIVE_INGEST_AT_UTC
    ? new Date(process.env.P4H_LIVE_INGEST_AT_UTC)
    : new Date();

  const results = files.map((file) => {
    const archive = JSON.parse(
      readFileSync(join(ARCHIVE_DIR, file), 'utf8'),
    ) as P4hRawArchiveV1;
    return evaluateP4hArchivedTrip(archive, { liveIngestAt: liveAt });
  });

  writeFileSync(
    join(OUT_DIR, 'P4H_R2_OFFLINE_REPLAY.json'),
    JSON.stringify(results, null, 2),
  );

  const summary = {
    trips: results.length,
    integrity_ok: results.filter((r) => r.archiveIntegrityOk).length,
    historical_gate_ok: results.filter((r) =>
      r.evaluations.find((e) => e.mode === 'HISTORICAL_REPLAY')?.gateOk,
    ).length,
    validated_with_values: results.filter(
      (r) => r.evidence.validatedProxyWithValues,
    ).length,
  };

  writeFileSync(
    join(OUT_DIR, 'P4H_R2_OFFLINE_SUMMARY.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
}

main();
