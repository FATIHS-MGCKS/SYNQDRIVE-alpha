#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3C.2 — recover Tesla POSITION fixture (read-only DB).
 */
import * as path from 'node:path';
import {
  recoverPositionFromProductionDb,
  writeFixturePackage,
} from './ldi10d-phase3c2-tesla-gps-fixture.lib';

async function main(): Promise<void> {
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const observedAtUtc = new Date().toISOString();
  const recovered = await recoverPositionFromProductionDb();
  const out = writeFixturePackage(repoRoot, recovered, observedAtUtc);
  console.log(
    JSON.stringify({
      ok: true,
      phase: '3C.2-recover',
      POSITION_RECOVERY_STATUS: 'SUCCESS',
      HASH_PARITY: out.hashParity,
      RECORDS_RECOVERED: out.recordsRecovered,
      fixtureDir: out.fixtureDir,
    }),
  );
  if (!out.hashParity) {
    console.error('POSITION payload sha256 mismatch vs pinned manifest');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }));
  process.exit(1);
});
