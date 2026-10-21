/**
 * EXP-021D — Live DIMO telemetry qualification for operator-selected vehicle.
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DimoAuthService } from '../../src/modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '../../src/modules/dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '../../src/modules/dimo/provider/dimo-provider-request-context.util';
import { buildBroadReferenceSignalsLatestQuery } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder';
import { buildAvailableSignalsQuery } from '../../src/modules/dimo/queries/available-signals.query';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main(): Promise<void> {
  const tokenId = Number.parseInt(process.env.TOKEN_ID ?? '', 10);
  const organizationId = process.env.ORGANIZATION_ID ?? '';
  const vehicleId = process.env.VEHICLE_ID ?? '';
  const freshThresholdSec = Number.parseInt(process.env.FRESH_THRESHOLD_SEC ?? '600', 10);

  if (!Number.isFinite(tokenId) || !organizationId || !vehicleId) {
    throw new Error('ORGANIZATION_ID, VEHICLE_ID, TOKEN_ID required');
  }

  loadEnv();
  const wallClockNowUtc = new Date().toISOString();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error'] });

  try {
    const dimoAuth = app.get(DimoAuthService);
    const dimoTelemetry = app.get(DimoTelemetryService);
    const jwt = await dimoAuth.getVehicleJwt(tokenId);
    const providerContext = buildDimoProviderRequestContext(tokenId, {
      organizationId,
      vehicleId,
    });

    const avail = await dimoTelemetry.queryGraphQLWithIngressTiming(
      jwt,
      buildAvailableSignalsQuery(tokenId),
      undefined,
      providerContext,
      'REFERENCE_CAPTURE',
    );
    const signals: string[] = Array.isArray(avail.result?.data?.availableSignals)
      ? avail.result.data.availableSignals.filter((s: unknown): s is string => typeof s === 'string')
      : [];

    const latestQuery = buildBroadReferenceSignalsLatestQuery(tokenId, signals);
    const latest = await dimoTelemetry.queryGraphQLWithIngressTiming(
      jwt,
      latestQuery,
      undefined,
      providerContext,
      'REFERENCE_CAPTURE',
    );

    const signalsLatest = (latest.result?.data?.signalsLatest ?? {}) as Record<
      string,
      { timestamp?: string; value?: unknown }
    >;
    let latestProviderTimestamp: string | null = null;
    for (const entry of Object.values(signalsLatest)) {
      if (!entry?.timestamp) continue;
      if (!latestProviderTimestamp || entry.timestamp > latestProviderTimestamp) {
        latestProviderTimestamp = entry.timestamp;
      }
    }

    const latestIngestTimestamp = latest.synqReceivedAt?.toISOString() ?? null;
    const providerAgeSec = latestProviderTimestamp
      ? Math.round((Date.now() - Date.parse(latestProviderTimestamp)) / 1000)
      : null;
    const ingestAgeSec = latestIngestTimestamp
      ? Math.round((Date.now() - Date.parse(latestIngestTimestamp)) / 1000)
      : null;

    const freshForExp021 =
      providerAgeSec != null && providerAgeSec <= freshThresholdSec ? 'YES' : 'NO';
    let liveTelemetryReady: 'YES' | 'NO' | 'WAIT_FOR_VEHICLE_WAKE' = 'NO';
    if (freshForExp021 === 'YES') {
      liveTelemetryReady = 'YES';
    } else if (providerAgeSec != null && providerAgeSec > freshThresholdSec) {
      liveTelemetryReady = 'WAIT_FOR_VEHICLE_WAKE';
    }

    console.log(
      JSON.stringify(
        {
          WALL_CLOCK_NOW_UTC: wallClockNowUtc,
          TOKEN_ID: tokenId,
          VEHICLE_ID: vehicleId,
          ORGANIZATION_ID: organizationId,
          LATEST_PROVIDER_TIMESTAMP: latestProviderTimestamp,
          LATEST_INGEST_TIMESTAMP: latestIngestTimestamp,
          TELEMETRY_PROVIDER_AGE_SECONDS: providerAgeSec,
          TELEMETRY_INGEST_AGE_SECONDS: ingestAgeSec,
          FRESH_FOR_EXP021: freshForExp021,
          FRESH_THRESHOLD_SEC: freshThresholdSec,
          LIVE_TELEMETRY_READY: liveTelemetryReady,
          signalsLatestFieldCount: Object.keys(signalsLatest).length,
          dimoQuerySuccess: latest.result?.errors ? false : true,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('TELEMETRY_QUALIFY_FAILED', error);
  process.exit(1);
});
