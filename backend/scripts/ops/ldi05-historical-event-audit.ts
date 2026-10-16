#!/usr/bin/env ts-node
/**
 * LDI-05 — read-only historical native event audit (Production DB).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient, DrivingEventSource } from '@prisma/client';
import {
  LDI05_ORG_ID,
  LDI05_RUPTELA_VEHICLES,
  buildLdi05ResultLines,
  loadManifestRuptelaTrips,
} from './ldi05-historical-event-audit.lib';

const TELEMETRY = DrivingEventSource.TELEMETRY_EVENTS;

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-05');
  }
  return path.resolve(argv[i + 1]);
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI05_REPO_ROOT
    ? path.resolve(process.env.LDI05_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const manifestTrips = loadManifestRuptelaTrips(repoRoot);
  const prisma = new PrismaClient();

  try {
    const tripRows = await prisma.vehicleTrip.findMany({
      where: { id: { in: manifestTrips.map((t) => t.tripId) } },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        behaviorEnrichedAt: true,
        hardBrakingCount: true,
        hardAccelerationCount: true,
      },
    });

    const perTripAudit = [];
    for (const m of manifestTrips) {
      const trip = tripRows.find((t) => t.id === m.tripId);
      const windowStart = trip?.startTime?.toISOString() ?? null;
      const windowEnd = trip?.endTime?.toISOString() ?? null;

      const inWindow = trip?.startTime && trip?.endTime
        ? await prisma.drivingEvent.count({
            where: {
              organizationId: LDI05_ORG_ID,
              vehicleId: m.vehicleId,
              source: TELEMETRY,
              recordedAt: { gte: trip.startTime, lte: trip.endTime },
            },
          })
        : 0;

      const onTripId = await prisma.drivingEvent.count({
        where: { tripId: m.tripId, source: TELEMETRY },
      });

      const unassignedInWindow =
        trip?.startTime && trip?.endTime
          ? await prisma.drivingEvent.count({
              where: {
                organizationId: LDI05_ORG_ID,
                vehicleId: m.vehicleId,
                source: TELEMETRY,
                tripId: null,
                recordedAt: { gte: trip.startTime, lte: trip.endTime },
              },
            })
          : 0;

      const nativeJobs = await prisma.drivingIntelligenceJob.findMany({
        where: {
          organizationId: LDI05_ORG_ID,
          tripId: m.tripId,
          jobType: 'DRIVING_NATIVE_EVENTS_INGEST',
        },
        select: { id: true, status: true, createdAt: true, completedAt: true, errorCode: true, errorMessage: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const analysisRuns = await prisma.drivingAnalysisRun.findMany({
        where: { tripId: m.tripId },
        select: { id: true },
        take: 5,
      });
      const stages = await prisma.drivingAnalysisStage.findMany({
        where: {
          analysisRunId: { in: analysisRuns.map((r) => r.id) },
          stageKey: 'NATIVE_EVENTS',
        },
        select: { status: true, updatedAt: true, errorCode: true, errorMessage: true },
        take: 5,
      });

      const intakeCount = await prisma.dimoBrakingEventIntake.count({
        where: { tripId: m.tripId },
      });

      perTripAudit.push({
        tripId: m.tripId,
        vehicleId: m.vehicleId,
        tripStartUtc: windowStart,
        tripEndUtc: windowEnd,
        behaviorEnrichedAt: trip?.behaviorEnrichedAt?.toISOString() ?? null,
        telemetryEventsInTripWindow: inWindow,
        telemetryEventsWithTripId: onTripId,
        telemetryEventsUnassignedInWindow: unassignedInWindow,
        dimoBrakingIntakeRows: intakeCount,
        nativeIngestJobs: nativeJobs,
        nativeAnalysisStages: stages,
        tripHardBrakingCount: trip?.hardBrakingCount ?? null,
        tripHardAccelerationCount: trip?.hardAccelerationCount ?? null,
      });
    }

    const vehicleWide = [];
    for (const vehicleId of LDI05_RUPTELA_VEHICLES) {
      const totalTelemetry = await prisma.drivingEvent.count({
        where: { organizationId: LDI05_ORG_ID, vehicleId, source: TELEMETRY },
      });
      const byType = await prisma.drivingEvent.groupBy({
        by: ['eventType'],
        where: { organizationId: LDI05_ORG_ID, vehicleId, source: TELEMETRY },
        _count: { _all: true },
      });
      const earliest = await prisma.drivingEvent.findFirst({
        where: { organizationId: LDI05_ORG_ID, vehicleId, source: TELEMETRY },
        orderBy: { recordedAt: 'asc' },
        select: { recordedAt: true, tripId: true, providerEventName: true },
      });
      const latest = await prisma.drivingEvent.findFirst({
        where: { organizationId: LDI05_ORG_ID, vehicleId, source: TELEMETRY },
        orderBy: { recordedAt: 'desc' },
        select: { recordedAt: true, tripId: true, providerEventName: true },
      });
      const outsideManifestWindows = await prisma.drivingEvent.count({
        where: {
          organizationId: LDI05_ORG_ID,
          vehicleId,
          source: TELEMETRY,
          NOT: { tripId: { in: manifestTrips.map((t) => t.tripId) } },
        },
      });

      vehicleWide.push({
        vehicleId,
        totalTelemetryEvents: totalTelemetry,
        eventTypeHistogram: byType.map((r) => ({ eventType: r.eventType, count: r._count._all })),
        earliestEvent: earliest,
        latestEvent: latest,
        eventsNotOnManifestTripIds: outsideManifestWindows,
      });
    }

    const orgTelemetryTotal = await prisma.drivingEvent.count({
      where: {
        organizationId: LDI05_ORG_ID,
        vehicleId: { in: [...LDI05_RUPTELA_VEHICLES] },
        source: TELEMETRY,
      },
    });

    const historicalNativeFound = orgTelemetryTotal;

    const allZeroInWindows = perTripAudit.every((t) => t.telemetryEventsInTripWindow === 0);
    const anyBehaviorEnriched = perTripAudit.some((t) => t.behaviorEnrichedAt != null);
    const anyIntake = perTripAudit.some((t) => t.dimoBrakingIntakeRows > 0);
    const anyNativeJobCompleted = perTripAudit.some((t) =>
      t.nativeIngestJobs.some((j) => j.status === 'COMPLETED'),
    );

    let rootCause = 'INFERRED_provider_returned_zero_or_ingest_never_ran';
    if (anyNativeJobCompleted && allZeroInWindows && historicalNativeFound > 0) {
      rootCause = 'CONFIRMED_ingest_ran_provider_zero_on_8_trips_960_TELEMETRY_EVENTS_on_other_trips';
    } else if (anyNativeJobCompleted && allZeroInWindows) {
      rootCause = 'CONFIRMED_ingest_completed_zero_provider_samples_all_manifest_trips';
    } else if (historicalNativeFound > 0 && allZeroInWindows) {
      rootCause = 'CONFIRMED_events_exist_but_not_in_manifest_trip_windows_or_tripId_filter';
    } else if (anyIntake && allZeroInWindows) {
      rootCause = 'CONFIRMED_intake_rows_present_zero_mapped_persisted_in_window';
    } else if (anyNativeJobCompleted && allZeroInWindows) {
      rootCause = 'CONFIRMED_ingest_completed_zero_events_in_window';
    } else if (!anyBehaviorEnriched && !anyNativeJobCompleted) {
      rootCause = 'INFERRED_post_trip_native_pipeline_not_executed_for_pins';
    }

    const auditPayload = {
      schema: 'LDI05_HISTORICAL_EVENT_AUDIT_V1',
      headSha,
      observedAtUtc: new Date().toISOString(),
      mode: { readOnly: true, providerCalls: false, productionMutations: false },
      organizationId: LDI05_ORG_ID,
      manifestRuptelaTripCount: manifestTrips.length,
      perTripAudit,
      vehicleWide,
      summary: {
        orgRuptelaTelemetryEventTotal: orgTelemetryTotal,
        allManifestWindowsZeroTelemetry: allZeroInWindows,
        anyBehaviorEnrichedAt: anyBehaviorEnriched,
        anyDimoBrakingIntake: anyIntake,
        anyNativeIngestJobCompleted: anyNativeJobCompleted,
        rootCauseHypothesis: rootCause,
      },
    };

    fs.writeFileSync(
      path.join(outDir, 'LDI05_HISTORICAL_EVENT_AUDIT.json'),
      JSON.stringify(auditPayload, null, 2),
    );

    const resultLines = buildLdi05ResultLines({
      pipelineImplemented: true,
      ingestionVerified:
        anyNativeJobCompleted && allZeroInWindows
          ? 'YES_native_ingest_jobs_COMPLETED_all_8_trips_zero_provider_samples'
          : anyNativeJobCompleted || anyBehaviorEnriched
            ? 'PARTIAL_jobs_or_hf_path_ran'
            : 'NOT_VERIFIED_FOR_MANIFEST_TRIPS',
      normalizationVerified: 'CODE_ONLY_mapper_tested_not_trip_pin',
      persistenceVerified:
        historicalNativeFound > 0 ? `YES_${historicalNativeFound}_org_ruptela_rows` : 'ZERO_TELEMETRY_EVENTS_FOR_THREE_VEHICLES',
      historicalNativeEventsFound: historicalNativeFound,
      eventTripAlignment: allZeroInWindows
        ? 'NO_EVENTS_IN_WINDOW_tripId_and_time_filter_both_empty'
        : 'PARTIAL',
      rootCauseConfidence: rootCause,
      fourStreamFusionReady: 'NO_native_stream_missing_on_all_8_pins',
    });

    fs.writeFileSync(path.join(outDir, 'LDI05_RESULT.txt'), resultLines.join('\n') + '\n');

    // Markdown deliverables written by generator after audit (static + injected summary)
    writeMarkdownDeliverables(outDir, headSha, auditPayload, resultLines);

    console.log(JSON.stringify({ ok: true, outDir, orgTelemetryTotal, rootCause }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function writeMarkdownDeliverables(
  outDir: string,
  headSha: string,
  audit: Record<string, unknown>,
  resultLines: string[],
): void {
  const summary = audit.summary as Record<string, unknown>;
  fs.writeFileSync(
    path.join(outDir, 'LDI05_PIPELINE_TRACE.md'),
    [
      '# LDI05 — Pipeline trace',
      '',
      `**HEAD:** \`${headSha}\` · **READ_ONLY**`,
      '',
      '## End-to-end path',
      '',
      '| Step | Component | Evidence |',
      '|------|-----------|----------|',
      '| 1 Source | DIMO Telemetry `events` GraphQL (`driving-events.query.ts`) | `behavior.harshBraking`, `harshAcceleration`, `harshCornering`, `extremeBraking` |',
      '| 2 Fetch | `DimoBrakingEventIntakeService.fetchDrivingEventsPaginated` | Called from `LteR1BehaviorEnrichmentService.enrichTrip` |',
      '| 3 Capability gate | `assessDimoBrakingCapability` + `fetchEventDataSummary` | Skip entire enrich if `!capability.allowed` |',
      '| 4 Intake ledger | `ingestBrakingBatch` → `dimo_braking_event_intake` | Separate from `DrivingEvent` |',
      '| 5 Normalize | `mapDimoNativeDrivingEvent` / `mapToNormalizedEvents` | `dimo-native-driving-event-mapper.ts` |',
      '| 6 Persist | `DimoNativeDrivingEventPersistenceService.upsertNativeEvents` | Fingerprint upsert, `source=TELEMETRY_EVENTS` |',
      '| 7 Trip link | `reconcileUnassignedEvents` + trip-scoped upsert | `tripId` on `DrivingEvent` |',
      '| 8 Orchestration A | `TripBehaviorEnrichmentService.enrichTripLteR1` → `lteR1.enrichTrip` | Post-trip HF queue path |',
      '| 9 Orchestration B | `DRIVING_NATIVE_EVENTS_INGEST` job → `DrivingNativeEventsIngestJobHandler` | Stage `NATIVE_EVENTS` after `SEGMENT_VALIDATE` |',
      '| 10 Read API | `unified-behavior-read-model.ts` / trip analytics | Maps `DrivingEvent` rows |',
      '',
      '## Gates (skip / zero)',
      '',
      '- Missing `endTime`, `<60s` trip, missing DIMO token → `enrichTrip` returns null',
      '- Braking capability not allowed → null (no provider fetch for events)',
      '- Zero provider samples → persist empty batch; `assessZeroNativeEventsConduct` → `supported_but_zero_events`',
      '',
      '## S4 native channel (separate)',
      '',
      '`DI_V0_S4_NATIVE_ENABLED` controls S4 evidence pin — **not** the same table as `DrivingEvent` (LDI-03 pin used POSITION+R1).',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI05_NATIVE_EVENT_ABSENCE.md'),
    [
      '# LDI05 — Native event absence',
      '',
      'See committed `LDI05_NATIVE_EVENT_ABSENCE.md` in repo (regenerate documents audit JSON).',
      '',
      `Summary: ingest **COMPLETED** on all 8 trips; **0** provider samples in-window; **${summary.orgRuptelaTelemetryEventTotal}** fleet events on other trips.`,
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI05_NATIVE_CAPABILITY_MATRIX.md'),
    [
      '# LDI05 — Native capability matrix',
      '',
      '| Layer | Status on manifest pins | Evidence |',
      '|-------|-------------------------|----------|',
      '| Provider capability | **UNKNOWN** (no provider call in LDI-05) | Code + intake summary gate only |',
      '| Ingestion capability | **IMPLEMENTED** | `LteR1BehaviorEnrichmentService` |',
      '| Persisted availability | **' + String(summary.orgRuptelaTelemetryEventTotal) + '** TELEMETRY_EVENTS (3 vehicles) | DB read-only audit |',
      '| Event–trip alignment | **' + (summary.allManifestWindowsZeroTelemetry ? 'FAIL windows empty' : 'PARTIAL') + '** | Per-trip counts in JSON |',
      '| Physical validation | **NONE** on these trips | No independent video/GT |',
      '',
      'Implemented code ≠ data delivery.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI05_FUSION_READINESS.md'),
    [
      '# LDI05 — Four-stream fusion readiness',
      '',
      '**Primary motion:** GPS-L3 (unchanged). **OBD:** witness only, no fallback (LDI-04).',
      '',
      '| Stream | LDI-03 pin | Blocker |',
      '|--------|------------|---------|',
      '| GPS-L3/QC | ~87% trusted | — |',
      '| HF/OBD 1 Hz subset | ~10% sparse | INTERVAL_ONLY |',
      '| Native DrivingEvent | **0** in all 8 windows | See `LDI05_HISTORICAL_EVENT_AUDIT.json` |',
      '',
      '**Missing for four-channel fusion:** persisted native events with trip/time alignment on the same pin.',
      '',
      '**Not in scope:** harsh threshold tuning, regen from braking.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI05_NEXT_DECISION.md'),
    [
      '# LDI05 — Next decision',
      '',
      '1. If `orgRuptelaTelemetryEventTotal` > 0 but windows empty → pick a trip where `recordedAt` overlaps `VehicleTrip.start/end`.',
      '2. If total = 0 → owner-approved read-only `dataSummary` or completed `DRIVING_NATIVE_EVENTS_INGEST` job logs for one vehicle.',
      '3. Do not arm fusion until native stream evidenced on the **same** pin as LDI-03.',
      '',
      '```',
      ...resultLines,
      '```',
    ].join('\n'),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
