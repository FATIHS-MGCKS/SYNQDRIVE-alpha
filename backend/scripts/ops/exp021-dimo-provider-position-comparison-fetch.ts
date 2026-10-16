#!/usr/bin/env ts-node
/**
 * One-shot DIMO historical position fetch for EXP021 (separate from pinned snapshot).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { acquireDiV0HistoricalPositions } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition';
import { DimoTelemetryDiV0HistoricalPositionTransport } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/dimo-telemetry-di-v0-position.transport';
import { DimoAuthService } from '../../src/modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '../../src/modules/dimo/dimo-telemetry.service';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';

/** Pinned EXP021 reference trip (read-only forensic; not env-overridable for provider comparison reproducibility). */
const REF = {
  organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
  vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
  tripId: '358d0158-b2a9-47ed-af26-33926c5770b4',
  workItemId: '99fe9d1b-5cb6-4cbb-ba0c-e5f27a5cd50a',
} as const;

const EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC = [
  { from: '2026-10-16T03:40:19Z', to: '2026-10-16T03:40:49Z' },
  { from: '2026-10-16T03:41:50Z', to: '2026-10-16T03:42:29Z' },
  { from: '2026-10-16T03:42:50Z', to: '2026-10-16T03:42:57Z' },
  { from: '2026-10-16T03:43:43Z', to: '2026-10-16T03:44:02Z' },
  { from: '2026-10-16T03:44:10Z', to: '2026-10-16T03:44:35Z' },
] as const;

function enumerateInclusive(fromUtc: string, toUtc: string): string[] {
  const out: string[] = [];
  for (let ms = bucketLabelToMs(fromUtc); ms <= bucketLabelToMs(toUtc); ms += 1000) {
    out.push(new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  }
  return out;
}

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const observedAtUtc = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });

  const fromUtc = '2026-10-16T03:36:00Z';
  const toUtc = '2026-10-16T03:54:56Z';
  const dimoTokenId = 186946;
  const vehicleId = process.env.EXP021_EV_GT_VEHICLE_ID ?? REF.vehicleId;
  const organizationId = process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId;

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });
  const prisma = new PrismaClient();
  try {
    const auth = app.get(DimoAuthService);
    const telemetry = app.get(DimoTelemetryService);
    const transport = new DimoTelemetryDiV0HistoricalPositionTransport(auth, telemetry);

    const tripId = process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId;
    const workItemId = process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId;

    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });
    const pinnedByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p.availability]));

    const dimoVehicle = await prisma.dimoVehicle.findFirst({
      where: { tokenId: dimoTokenId },
      select: { rawJson: true },
    });
    if (!dimoVehicle?.rawJson) throw new Error('dimoVehicle rawJson missing');

    const outcome = await acquireDiV0HistoricalPositions(
      {
        organizationId,
        vehicleId,
        dimoTokenId,
        dimoDeviceIdentity: dimoVehicle.rawJson,
        fromUtc,
        toUtc,
      },
      transport,
    );

    if (outcome.status !== 'ACQUIRED') {
      throw new Error(`acquisition failed: ${JSON.stringify(outcome)}`);
    }

    const result = outcome.result;
    const providerRowsByLabel = new Map<string, { availability: string; providerRowCount: number }>();
    for (const b of result.buckets) {
      providerRowsByLabel.set(b.bucketLabel, {
        availability: b.availability,
        providerRowCount: b.providerRowCount,
      });
    }

    const haltLabels: string[] = [];
    for (const w of EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC) {
      haltLabels.push(...enumerateInclusive(w.from, w.to));
    }

    const haltComparison = haltLabels.map((label) => ({
      bucketLabelUtc: label,
      pinnedSnapshotAvailability: pinnedByLabel.get(label) ?? null,
      freshProviderBucket: providerRowsByLabel.get(label) ?? null,
    }));

    const payload = {
      schema: 'EXP021_DIMO_PROVIDER_POSITION_COMPARISON_V1',
      observedAtUtc,
      query: {
        dimoTokenId,
        fromUtc,
        toUtcExclusive: toUtc,
        signal: 'currentLocationCoordinates',
        interval: '1s',
        aggregation: 'AVG',
        providerCalls: 1,
        retryPolicy: 'none (single acquireDiV0HistoricalPositions)',
      },
      acquisition: {
        providerRowCount: result.providerRowCount,
        presentCount: result.presentCount,
        rowAbsentCount: result.rowAbsentCount,
        signalNullCount: result.signalNullCount,
        qualityFlags: result.qualityFlags,
        rejectedProviderRowCount: result.rejectedProviderRows.length,
      },
      haltWindowLabelAnalysis: {
        labelsInFiveMainHalts: haltLabels.length,
        freshProviderPresentInHalts: haltComparison.filter((h) => h.freshProviderBucket?.availability === 'PRESENT')
          .length,
        freshProviderRowAbsentInHalts: haltComparison.filter(
          (h) => h.freshProviderBucket?.availability === 'ROW_ABSENT',
        ).length,
        perLabel: haltComparison,
      },
      note:
        'Fresh provider response only; pinned S4 snapshot unchanged. Later provider delivery must not be equated with pin-time processing failure.',
    };

    const body = JSON.stringify(payload, null, 2);
    const outPath = path.join(outDir, 'DIMO_PROVIDER_POSITION_COMPARISON.json');
    fs.writeFileSync(outPath, body, 'utf8');
    const sha = createHash('sha256').update(body).digest('hex');
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${sha}  DIMO_PROVIDER_POSITION_COMPARISON.json\n`, 'utf8');
    console.log(JSON.stringify({ ok: true, outPath, sha256: sha, ...payload.acquisition }, null, 2));
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
