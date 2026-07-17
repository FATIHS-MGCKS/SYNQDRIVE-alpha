/**
 * Controlled historical backfill: battery_health_snapshots → battery_measurements (REST_60M).
 *
 * Pipeline: snapshot classification → REST_60M insert → LV assessment replay → optional publication replay.
 *
 * Usage (dry-run):
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-battery-snapshot-rest-measurements.ts \
 *     --organization-id=<uuid> --days=60
 *
 * Usage (apply + assessment replay):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-battery-snapshot-rest-measurements.ts \
 *     --organization-id=<uuid> --days=60 --apply --operator=ops@example --reason=option-b-backfill
 *
 * Usage (apply + publication replay — scoped to this process only):
 *   BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_REMOTE=1 \
 *   BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_PROD=1 \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-battery-snapshot-rest-measurements.ts \
 *     --organization-id=<uuid> --vehicle-id=<uuid> --days=60 --apply \
 *     --enable-publication-replay --operator=ops@example --reason=option-b-publication-replay
 *
 * Environment:
 *   BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_REMOTE=1
 *   BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_PROD=1
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — runtime / configuration error
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { BatterySnapshotRestBackfillService } from '../../src/modules/vehicle-intelligence/battery-health/backfill/battery-snapshot-rest-backfill.service';
import { assertSafeBatterySnapshotRestBackfillTarget } from '../../src/modules/vehicle-intelligence/battery-health/diagnostic/battery-data-diagnostic.safety.util';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const allowRemote = process.argv.includes('--allow-remote-db');
  const enablePublicationReplay = process.argv.includes('--enable-publication-replay');
  const skipAssessmentReplay = process.argv.includes('--skip-assessment-replay');
  const purgeBackfillMeasurements = process.argv.includes('--purge-backfill-measurements');
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim() ?? undefined;
  const vehicleId = parseArg('--vehicle-id');
  const daysRaw = parseArg('--days');
  const days = daysRaw ? Number(daysRaw) : undefined;
  if (days != null && (!Number.isFinite(days) || days < 1)) {
    throw new Error('--days must be a positive number');
  }
  const batchSizeRaw = parseArg('--batch-size');
  const batchSize = batchSizeRaw ? Number(batchSizeRaw) : undefined;
  if (batchSize != null && (!Number.isFinite(batchSize) || batchSize < 1)) {
    throw new Error('--batch-size must be a positive number');
  }
  const outputPath = parseArg('--output');
  const operator = parseArg('--operator');
  const reason = parseArg('--reason');

  assertSafeBatterySnapshotRestBackfillTarget({ allowRemote, apply });

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const backfill = app.get(BatterySnapshotRestBackfillService);
    const { plan, result } = await backfill.run({
      organizationId,
      vehicleId,
      days,
      apply,
      batchSize,
      replayAssessment: !skipAssessmentReplay,
      enablePublicationReplay,
      operator,
      reason,
      purgeBackfillMeasurements,
    });

    const report = { plan, result };
    const json = JSON.stringify(report, null, 2);
    if (outputPath) {
      const abs = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, json, 'utf8');
      console.log(`Wrote report to ${abs}`);
    }
    console.log(json);

    if (!apply) {
      console.error('\nDry-run only — pass --apply to execute backfill.');
    }
    if (enablePublicationReplay) {
      console.error(
        '\nPublication replay enabled for this process only (BATTERY_V2_PUBLICATION_ENABLED=true in script scope).',
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
