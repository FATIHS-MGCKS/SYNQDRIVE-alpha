/**
 * Read-only probe for DIMO broad preflight 422 failures.
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DimoAuthService } from '../../src/modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '../../src/modules/dimo/dimo-telemetry.service';
import { buildAvailableSignalsQuery } from '../../src/modules/dimo/queries/available-signals.query';
import { buildDataSummaryQuery } from '../../src/modules/dimo/queries/data-summary.query';
import { buildDimoProviderRequestContext } from '../../src/modules/dimo/provider/dimo-provider-request-context.util';
import { buildBroadReferenceSignalsLatestQuery } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main(): Promise<void> {
  const tokenId = Number(process.argv[2] ?? '192922');
  loadEnv();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error'] });
  try {
    const dimoAuth = app.get(DimoAuthService);
    const dimoTelemetry = app.get(DimoTelemetryService);
    const jwt = await dimoAuth.getVehicleJwt(tokenId);
    const providerContext = buildDimoProviderRequestContext(tokenId, {
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    });

    const availTimed = await dimoTelemetry.queryGraphQLWithIngressTiming(
      jwt,
      buildAvailableSignalsQuery(tokenId),
      undefined,
      providerContext,
      'REFERENCE_CAPTURE',
    );
    const signals: string[] = Array.isArray(availTimed.result?.data?.availableSignals)
      ? availTimed.result.data.availableSignals.filter((s: unknown): s is string => typeof s === 'string')
      : [];
    console.log(JSON.stringify({ step: 'availableSignals', count: signals.length }, null, 2));

    try {
      const summaryTimed = await dimoTelemetry.queryGraphQLWithIngressTiming(
        jwt,
        buildDataSummaryQuery(tokenId),
        undefined,
        providerContext,
        'REFERENCE_CAPTURE',
      );
      console.log(JSON.stringify({ step: 'dataSummary', ok: true, hasData: !!summaryTimed.result?.data?.dataSummary }, null, 2));
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: unknown }; message?: string };
      console.log(JSON.stringify({ step: 'dataSummary', ok: false, status: err.response?.status, body: err.response?.data, message: err.message }, null, 2));
    }

    const query = buildBroadReferenceSignalsLatestQuery(tokenId, signals);
    console.log(JSON.stringify({ queryCharLength: query.length, selectionLineCount: query.split('\n').length }, null, 2));

    try {
      const res = await dimoTelemetry.queryGraphQLWithIngressTiming(
        jwt,
        query,
        undefined,
        providerContext,
        'REFERENCE_CAPTURE',
      );
      const keys = Object.keys((res.result?.data?.signalsLatest ?? {}) as Record<string, unknown>);
      console.log(JSON.stringify({ step: 'broadSignalsLatest', ok: true, signalsLatestFieldCount: keys.length }, null, 2));
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: unknown }; message?: string };
      console.log(
        JSON.stringify(
          {
            step: 'broadSignalsLatest',
            ok: false,
            status: err.response?.status ?? null,
            message: err.message ?? String(error),
            body: err.response?.data ?? null,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
