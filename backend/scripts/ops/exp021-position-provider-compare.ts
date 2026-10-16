#!/usr/bin/env ts-node
/**
 * EXP021 bounded historical POSITION provider compare (read-only product state).
 * Uses Nest DIMO gateway + budget; max 3 HTTP attempts; artifacts outside release tree.
 */
import { createHash } from 'crypto';
import * as fssync from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DimoAuthService } from '../../src/modules/dimo/dimo-auth.service';
import { DimoTelemetryService, type DimoGraphQLIngressTimingResult } from '../../src/modules/dimo/dimo-telemetry.service';
import { DimoProviderBudgetService } from '../../src/modules/dimo/provider-budget/dimo-provider-budget.service';
import { DimoProviderBudgetError } from '../../src/modules/dimo/provider-budget/dimo-http-error.util';
import { runWithDimoRequestContext } from '../../src/modules/dimo/provider-budget/dimo-request-context';
import { buildDimoProviderRequestContext } from '../../src/modules/dimo/provider/dimo-provider-request-context.util';
import { PrismaService } from '@shared/database/prisma.service';
import { buildDiV0HistoricalPositionQuery } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-query';
import {
  validateDiV0PositionAcquisitionRequest,
  validateDiV0PositionWindow,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-window';
import { normalizeDiV0PositionResponse } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-normalizer';
import { resolveDiV0SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-source-family';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  comparePinToProviderBuckets,
  sha256CanonicalJson,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-exp021-position-provider-compare';
import { DI_V0_S4C_DIMO_REQUEST_CONTEXT } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4c-executor/di-v0-s4c-dimo-ports';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const TRIP = '533b2bf8-fa07-4f0b-bc40-d540447a1542';
const WI = '339856c6-a4af-43f8-aecd-07baacec3d22';
const VEHICLE = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const TOKEN_ID = 192922;
const FROM = '2026-10-14T14:47:05Z';
const TO = '2026-10-14T16:05:19Z';
const MAX_HTTP_ATTEMPTS = 3;

function countRawSignalDuplicates(rows: Array<{ timestamp?: unknown }>): {
  uniqueTimestampLabels: number;
  duplicateRows: number;
} {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (typeof r.timestamp !== 'string') continue;
    counts.set(r.timestamp, (counts.get(r.timestamp) ?? 0) + 1);
  }
  let dup = 0;
  for (const c of counts.values()) {
    if (c > 1) dup += c - 1;
  }
  return { uniqueTimestampLabels: counts.size, duplicateRows: dup };
}

async function main(): Promise<void> {
  process.env.DIMO_GLOBAL_MAX_RETRIES = String(MAX_HTTP_ATTEMPTS - 1);
  const executedAtUtc = new Date().toISOString();
  const analysisSha = process.env.EXP021_ANALYSIS_GIT_SHA ?? 'workspace';
  const outJson =
    process.env.EXP021_PROVIDER_COMPARE_OUT ?? '/tmp/exp021-provider-position-compare-533b2bf8.json';
  const outRaw =
    process.env.EXP021_PROVIDER_COMPARE_RAW ?? '/tmp/exp021-provider-position-compare-533b2bf8.raw.json';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const auth = app.get(DimoAuthService);
  const telemetry = app.get(DimoTelemetryService);
  const budget = app.get(DimoProviderBudgetService);
  const report: Record<string, unknown> = {
    kind: 'EXP021_POSITION_PROVIDER_COMPARE_V1',
    executedAtUtc,
    analysisGitSha: analysisSha,
    scope: { org: ORG, trip: TRIP, workItem: WI, vehicle: VEHICLE, tokenId: TOKEN_ID, from: FROM, to: TO },
  };

  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId: ORG,
      tripId: TRIP,
      workItemId: WI,
    });
    const wi = ctx.workItem;
    if (!wi) {
      report.providerComparisonResult = 'ABORTED_WORK_ITEM_MISSING';
      fssync.writeFileSync(outJson, JSON.stringify(report, null, 2));
      process.exit(2);
    }

    const linkRows = await prisma.$queryRaw<
      Array<{
        provider: string;
        source_type: string;
        is_active: boolean;
        dimo_vehicle_id: string | null;
      }>
    >`
      SELECT vdl.provider, vdl.source_type, vdl.is_active, vdl.dimo_vehicle_id
      FROM vehicle_data_source_links vdl
      INNER JOIN vehicles v ON v.id = vdl.vehicle_id
      WHERE v.organization_id = ${ORG}
        AND vdl.vehicle_id::text = ${VEHICLE}
      ORDER BY vdl.activated_at DESC
      LIMIT 5`;

    const budgetConfig = budget.getConfig();
    report.gatewayBudgetAdmission = {
      globalBudgetEnabled: budgetConfig.globalBudgetEnabled,
      globalMaxInFlight: budgetConfig.globalMaxInFlight,
      globalMaxRetriesConfigured: budgetConfig.globalMaxRetries,
      compareRunMaxHttpAttempts: MAX_HTTP_ATTEMPTS,
      dimoGlobalMaxRetriesEnv: process.env.DIMO_GLOBAL_MAX_RETRIES,
      category: DI_V0_S4C_DIMO_REQUEST_CONTEXT.category,
      priority: DI_V0_S4C_DIMO_REQUEST_CONTEXT.priority,
      preflightPermitProbe: null as Record<string, unknown> | null,
    };

    let jwtPreflightOk = false;
    let jwtError: string | null = null;
    try {
      const jwt = await auth.getVehicleJwt(TOKEN_ID);
      jwtPreflightOk = typeof jwt === 'string' && jwt.length > 0;
    } catch (e) {
      jwtError = e instanceof Error ? e.message : String(e);
    }

    let budgetPreflightOk = false;
    let budgetPreflightError: string | null = null;
    if (budgetConfig.globalBudgetEnabled) {
      try {
        const probe = await budget.acquirePermit({
          category: DI_V0_S4C_DIMO_REQUEST_CONTEXT.category,
          priority: DI_V0_S4C_DIMO_REQUEST_CONTEXT.priority,
        });
        await budget.releasePermit(probe);
        budgetPreflightOk = true;
        (report.gatewayBudgetAdmission as Record<string, unknown>).preflightPermitProbe = {
          admitted: true,
          acquiredAtMs: probe.acquiredAt,
        };
      } catch (e) {
        budgetPreflightError =
          e instanceof DimoProviderBudgetError
            ? `${e.code}:${e.message}`
            : e instanceof Error
              ? e.message
              : String(e);
        (report.gatewayBudgetAdmission as Record<string, unknown>).preflightPermitProbe = {
          admitted: false,
          error: budgetPreflightError,
        };
      }
    } else {
      budgetPreflightOk = true;
      (report.gatewayBudgetAdmission as Record<string, unknown>).preflightPermitProbe = {
        admitted: true,
        note: 'global budget disabled — executor runs without Redis permit',
      };
    }

    report.identityAndAccessVerified = {
      dimoTokenId: TOKEN_ID,
      vehicleJwtAvailable: jwtPreflightOk,
      jwtError,
      budgetPreflightOk,
      budgetPreflightError,
      vehicleDataSourceLinks: linkRows,
      pinnedSnapshotHash: ctx.pinnedSnapshotHash,
      originalFetchProxyUtc: wi.completed_at?.toISOString() ?? null,
      sealedSourceFamily: wi.source_family,
    };
    if (!jwtPreflightOk) {
      report.providerComparisonResult = 'ABORTED_IDENTITY_OR_ACCESS';
      fssync.writeFileSync(outJson, JSON.stringify(report, null, 2));
      process.exit(2);
    }
    if (!budgetPreflightOk) {
      report.providerComparisonResult = 'ABORTED_GATEWAY_BUDGET';
      fssync.writeFileSync(outJson, JSON.stringify(report, null, 2));
      process.exit(2);
    }

    const window = validateDiV0PositionWindow(FROM, TO);
    const query = buildDiV0HistoricalPositionQuery(TOKEN_ID, window);
    const deviceIdentity = { sourceFamily: wi.source_family };
    const validatedRequest = validateDiV0PositionAcquisitionRequest({
      organizationId: ORG,
      vehicleId: VEHICLE,
      tripId: TRIP,
      dimoTokenId: TOKEN_ID,
      dimoDeviceIdentity: deviceIdentity,
      fromUtc: FROM,
      toUtc: TO,
    });
    const sourceFamilyResolution = resolveDiV0SourceFamily(deviceIdentity);

    report.logicalQueriesAndHttpAttempts = {
      logicalGraphqlQueries: 1,
      queryShapeHash: createHash('sha256').update(query).digest('hex'),
      httpAttemptsCapIncludingGatewayRetries: MAX_HTTP_ATTEMPTS,
      note: 'Single logical query; DimoRequestExecutor may perform up to DIMO_GLOBAL_MAX_RETRIES+1 HTTP posts.',
    };

    let ingress: DimoGraphQLIngressTimingResult | null = null;
    let lastError: string | null = null;
    const httpStartedAt = new Date().toISOString();

    try {
      await runWithDimoRequestContext(DI_V0_S4C_DIMO_REQUEST_CONTEXT, async () => {
        const jwt = await auth.getVehicleJwt(TOKEN_ID);
        ingress = await telemetry.queryGraphQLWithIngressTiming(
          jwt,
          query,
          undefined,
          buildDimoProviderRequestContext(TOKEN_ID, {
            vehicleId: VEHICLE,
            organizationId: ORG,
          }),
          DI_V0_S4C_DIMO_REQUEST_CONTEXT.category,
        );
      });
    } catch (e) {
      lastError =
        e instanceof DimoProviderBudgetError
          ? `BUDGET:${e.code}:${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
    }

    if (!ingress) {
      report.providerComparisonResult = lastError?.startsWith('BUDGET:')
        ? 'ABORTED_GATEWAY_BUDGET'
        : 'FAILED_PROVIDER_HTTP';
      report.lastError = lastError;
      fssync.writeFileSync(outJson, JSON.stringify(report, null, 2));
      process.exit(3);
    }

    const ingressResult = ingress;
    const signals = ingressResult.result?.data?.signals;
    const signalRows = Array.isArray(signals) ? (signals as Array<Record<string, unknown>>) : [];
    const rawDup = countRawSignalDuplicates(signalRows);
    const redactedRaw = {
      data: {
        signals: signalRows.map((r) => ({
          timestamp: r.timestamp,
          hasCoordinates:
            r.currentLocationCoordinates != null && typeof r.currentLocationCoordinates === 'object',
        })),
      },
      errors: ingressResult.result?.errors ?? null,
    };
    fssync.writeFileSync(outRaw, JSON.stringify(ingressResult.result?.data ?? ingressResult.result, null, 2));
    const rawHash = sha256CanonicalJson(redactedRaw);

    const normalized = normalizeDiV0PositionResponse({
      request: validatedRequest,
      sourceFamilyResolution,
      responseBody: ingressResult.result?.data ?? ingressResult.result,
      acquiredAt: new Date(),
    });

    if (!normalized.ok) {
      report.providerComparisonResult = 'FAILED_NORMALIZATION';
      report.normalizationFailure = normalized.failure;
      fssync.writeFileSync(outJson, JSON.stringify(report, null, 2));
      process.exit(4);
    }

    const comparison = comparePinToProviderBuckets({
      pinPositions: ctx.evidence.positions,
      providerBuckets: normalized.result.buckets,
      acquisitionWindow: ctx.acquisitionWindow,
      subWindowInclusiveEnd: {
        startInclusive: '2026-10-14T14:55:43Z',
        endInclusive: '2026-10-14T15:21:52Z',
      },
    });
    comparison.providerRejectedRows = normalized.result.rejectedProviderRows.length;

    const matrixSum = Object.values(comparison.matrix).reduce((a, b) => a + b, 0);
    const pinPresent =
      ctx.evidence.positions.filter((p) => p.availability !== 'ROW_ABSENT' && p.availability !== 'SIGNAL_NULL')
        .length;
    const completeness =
      normalized.result.providerRowCount < normalized.result.expectedBucketCount
        ? 'SPARSE_PROVIDER_ROWS_HTTP_OK'
        : normalized.result.providerRowCount === normalized.result.expectedBucketCount
          ? 'DENSE_ROW_COUNT_MATCHES_GRID'
          : 'OVERFULL_ROW_COUNT';

    report.providerComparisonResult = 'COMPLETE';
    report.responseCompletenessStatus = {
      httpSuccess: true,
      graphqlErrorsPresent:
        Array.isArray(ingressResult.result?.errors) && ingressResult.result.errors.length > 0,
      providerRowCount: normalized.result.providerRowCount,
      expectedBucketCount: normalized.result.expectedBucketCount,
      completenessInterpretation: completeness,
      note: 'HTTP 200 does not prove full-window delivery when provider returns sparse signals[].',
    };
    report.originalVsCurrentRowCounts = {
      pinRowAbsent: ctx.evidence.positions.filter((p) => p.availability === 'ROW_ABSENT').length,
      pinPresentValidish: pinPresent,
      currentProviderRowsMatched: normalized.result.providerRowCount,
      currentProviderRowAbsentBuckets: normalized.result.rowAbsentCount,
      rawSignalsArrayLength: signalRows.length,
      rawUniqueTimestampLabels: rawDup.uniqueTimestampLabels,
      rawDuplicateTimestampRows: rawDup.duplicateRows,
    };
    report.bucketMatrixAndReconciliation = {
      matrix: comparison.matrix,
      matrixSum,
      expectedBucketCount: comparison.expectedBucketCount,
      reconciled: matrixSum === comparison.expectedBucketCount,
    };
    report.bothPresentCoordinateChanges = {
      unchanged: comparison.bothPresentCoordinateUnchanged,
      changed: comparison.bothPresentCoordinateChanged,
    };
    report.longestWindowComparison = comparison.subWindow;
    report.temporalDistribution = {
      pinAbsentRuns: comparison.pinAbsentRunSummary,
      providerAbsentRuns: comparison.providerAbsentRunSummary,
    };
    report.providerSignalStats = {
      providerUniqueTimestampLabels: comparison.providerUniqueTimestampLabels,
      providerDuplicateTimestampLabels: comparison.providerDuplicateTimestampLabels,
      rejectedProviderRows: comparison.providerRejectedRows,
      rejectedReasons: normalized.result.rejectedProviderRows.reduce<Record<string, number>>((acc, r) => {
        acc[r.reason] = (acc[r.reason] ?? 0) + 1;
        return acc;
      }, {}),
    };
    report.logicalQueriesAndHttpAttempts = {
      ...(report.logicalQueriesAndHttpAttempts as object),
      requestStartedAtUtc: httpStartedAt,
      requestCompletedAtUtc: ingressResult.requestCompletedAt.toISOString(),
      estimatedHttpPostsOnSuccessPath: 1,
    };
    report.timing = {
      acquisitionRequestedAt: ingressResult.timing.acquisitionRequestedAt.toISOString(),
      httpRequestStartedAt: ingressResult.timing.httpRequestStartedAt.toISOString(),
      httpResponseReceivedAt: ingressResult.timing.httpResponseReceivedAt.toISOString(),
      processingCompletedAt: ingressResult.timing.processingCompletedAt.toISOString(),
    };
    report.artifacts = {
      compareJson: outJson,
      rawResponsePath: outRaw,
      redactedResponseHash: rawHash,
    };
    report.gatewayAccountingSideEffects = {
      dimoBudgetPreflightPermitProbe: true,
      dimoBudgetPermitAcquiredForGraphqlCall: budgetConfig.globalBudgetEnabled,
      dimoRequestExecutorRetriesCapped: MAX_HTTP_ATTEMPTS - 1,
      productPinsProjectionsOutboxQc: 'UNCHANGED',
    };
    report.domainDataMutations = 'NONE';
    report.confirmedFindings = [];
    report.unresolvedCauses = [];
    if (comparison.matrix.PIN_ABSENT_PROVIDER_PRESENT > 0) {
      (report.confirmedFindings as string[]).push(
        `${comparison.matrix.PIN_ABSENT_PROVIDER_PRESENT} buckets ROW_ABSENT in pin but provider returned coordinates on ${executedAtUtc} compare run`,
      );
    }
    if (comparison.matrix.PIN_ABSENT_PROVIDER_ABSENT > 0) {
      (report.confirmedFindings as string[]).push(
        `${comparison.matrix.PIN_ABSENT_PROVIDER_ABSENT} buckets absent in both pin and current provider normalization`,
      );
    }
    if (comparison.matrix.PIN_PRESENT_PROVIDER_ABSENT > 0) {
      (report.confirmedFindings as string[]).push(
        `${comparison.matrix.PIN_PRESENT_PROVIDER_ABSENT} buckets present in pin but absent in current provider normalization`,
      );
    }
    (report.unresolvedCauses as string[]).push(
      'Whether pin/provider gaps imply original fetch fault vs later data availability vs sparse provider response',
    );
    if (completeness === 'SPARSE_PROVIDER_ROWS_HTTP_OK') {
      (report.unresolvedCauses as string[]).push(
        'Provider returned fewer matched rows than grid bucket count without transport failure',
      );
    }
    report.nextSmallestExperiment =
      comparison.matrix.PIN_ABSENT_PROVIDER_PRESENT > 0
        ? 'Optional: DIMO support ticket with query window + tokenId + sparse row count (no auto window split)'
        : 'Review pin sealed rejected-row audit before another provider call';

    fssync.writeFileSync(outJson, JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify(
        { ok: true, outJson, matrixSum, reconciled: matrixSum === comparison.expectedBucketCount },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
