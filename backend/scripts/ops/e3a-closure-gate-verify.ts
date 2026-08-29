/**
 * READ-ONLY E3A post-mutation closure gate verification.
 * No writes — Prisma read queries only.
 */
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { captureEnergyEventsTableSnapshot } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-write-backfill';
import {
  validatePostMutationInvariants,
  type OperatorMutationManifest,
  type PersistedEnergyEventRow,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-operator-mutation-manifest';

const MANIFEST_PATH =
  process.argv.find((arg) => arg.startsWith('--manifest='))?.slice('--manifest='.length) ??
  '/tmp/e3a-operator-m1-manifest-post-deploy-20260829T004801Z.json';

async function main() {
  const wrap = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as {
    manifest: OperatorMutationManifest;
    populationProof?: { independentSessionsPreserved?: Array<{ rowId: string }> };
  };
  const manifest = wrap.manifest;
  const preserved =
    wrap.populationProof?.independentSessionsPreserved?.map((row) => row.rowId) ?? [];

  const prisma = new PrismaClient();
  const allRows = await prisma.vehicleEnergyEvent.findMany();
  const rowsById = new Map<string, PersistedEnergyEventRow>(
    allRows.map((row) => [row.id, row as PersistedEnergyEventRow]),
  );
  const snapshot = await captureEnergyEventsTableSnapshot(prisma);
  const violations = validatePostMutationInvariants(manifest, rowsById, snapshot);

  const m1Rows = allRows.filter((row) => row.dimoSegmentId === manifest.m1.dimoSegmentId);
  const pruneStillPresent = manifest.expectedPostMutation.expectedLegacyPruneRowIdsAbsent.filter(
    (id) => rowsById.has(id),
  );
  const tailId = manifest.invariants.expectedExcludedOverlapRowIds[0];
  const m1 = m1Rows[0];
  const fp = manifest.m1.fingerprint!;

  const m1Matches =
    m1 != null &&
    m1.durationSeconds === fp.durationSeconds &&
    Math.abs((m1.socDeltaPercent ?? 0) - (fp.socDeltaPercent ?? 0)) < 1e-9 &&
    Math.abs((m1.energyDeltaKwh ?? 0) - (fp.energyDeltaKwh ?? 0)) < 1e-9 &&
    m1.confidence === fp.confidence;

  console.log(
    JSON.stringify(
      {
        rowCount: snapshot.totalRows,
        expectedRowCount: manifest.expectedPostMutation.expectedFinalRowCount,
        tableDigest: snapshot.tableDigest,
        postMutationViolations: violations,
        m1Count: m1Rows.length,
        m1Canonical: m1
          ? {
              durationSeconds: m1.durationSeconds,
              socDeltaPercent: m1.socDeltaPercent,
              energyDeltaKwh: m1.energyDeltaKwh,
              confidence: m1.confidence,
              odometerStartKm: m1.odometerStartKm,
              odometerEndKm: m1.odometerEndKm,
              stationaryOdometer:
                m1.odometerStartKm != null &&
                m1.odometerEndKm != null &&
                Math.abs(m1.odometerStartKm - m1.odometerEndKm) < 0.01,
            }
          : null,
        m1MatchesManifest: m1Matches,
        legacy16Absent: pruneStillPresent.length === 0,
        legacyPruneStillPresentCount: pruneStillPresent.length,
        excludedTailPresent: tailId ? rowsById.has(tailId) : null,
        r1Present: preserved[0] ? rowsById.has(preserved[0]) : null,
        r2Present: preserved[1] ? rowsById.has(preserved[1]) : null,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
