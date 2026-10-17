#!/usr/bin/env ts-node
/**
 * EXP021 retrospective halt / gap event detector (offline, post-trip).
 * Default: v0_2. Pass --v0-1 for legacy export shape.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { REF } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';
import { loadVideoComparisonByLabel } from './exp021-ev-ground-truth-forensic-supplement-v3.lib';
import {
  analyzeGapCandidate,
  applyMapContextVariantB,
  buildGapEvents,
  buildSlowRollSegments,
  classifyAllPresentLegs,
  collectPresentPoints,
  evaluateAgainstVideo,
  findGapRuns,
  RETROSPECTIVE_HALT_PROTOTYPE_VERSION,
  syntheticGapStressTest,
  type OsmSignal,
} from './exp021-retrospective-halt-prototype.lib';
import {
  analyzeGapCandidateV2,
  applyMapContextVariantBEnhanced,
  buildGapEventsV2,
  buildMainHaltClassificationTable,
  buildSlowRollSegmentsV2,
  classifyAllPresentLegsV2,
  evaluateNaturalMovementGaps,
  evaluateVideoCoverageVsClassification,
  HOLD_NOISE_DISPLACEMENT_DOCUMENTATION,
  RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
  runSyntheticGapBattery,
  slowRollVideoCrossTab,
  V0_1_MISCLASSIFICATION_ROOT_CAUSE,
  type GapBracketStructure,
} from './exp021-retrospective-halt-prototype-v2.lib';
import { fetchOsmTrafficSignalsPost } from './exp021-retrospective-halt-overpass.lib';
import { buildMapReviewHtml, mapPayloadFromTrip } from './exp021-retrospective-halt-map.lib';

function parseArgs(argv: string[]): { outDir: string; useV01: boolean } {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory> [--v0-1]');
  return {
    outDir: path.resolve(argv[i + 1]),
    useV01: argv.includes('--v0-1'),
  };
}

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function main(): Promise<void> {
  const { outDir, useV01 } = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const observedAtUtc = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId: process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId,
      tripId: process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId,
      workItemId: process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId,
    });

    const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
    const sortedLabels = [...ctx.shadowIntervals].map((r) => dateToBucketLabel(r.referenceTime)).sort();
    const presentPoints = collectPresentPoints(ctx.evidence.positions);
    const r1ByLabel = new Map(ctx.evidence.r1Obd.map((r) => [r.bucketLabel, r.speedKmh]));
    const videoRaw = loadVideoComparisonByLabel(repoRoot);
    const videoByLabel = new Map([...videoRaw.entries()].map(([k, v]) => [k, { tachoKmh: v.tachoKmh ?? null }]));

    const gaps = findGapRuns(sortedLabels, posByLabel);

    const lats = presentPoints.map((p) => p.lat);
    const lons = presentPoints.map((p) => p.lon);
    const bbox = {
      south: Math.min(...lats) - 0.002,
      north: Math.max(...lats) + 0.002,
      west: Math.min(...lons) - 0.002,
      east: Math.max(...lons) + 0.002,
    };
    const osm = await fetchOsmTrafficSignalsPost(bbox);

    if (useV01) {
      await writeV01Export({
        outDir,
        observedAtUtc,
        presentPoints,
        positions: ctx.evidence.positions,
        posByLabel,
        sortedLabels,
        r1ByLabel,
        videoByLabel,
        gaps,
        osm,
      });
      return;
    }

    const geometryPerSecond = classifyAllPresentLegsV2(presentPoints, ctx.evidence.positions);
    const geometrySummary = {
      nearStop: geometryPerSecond.filter((g) => g.geometryClass === 'NEAR_STOP_GEOMETRY').length,
      slowRoll: geometryPerSecond.filter((g) => g.geometryClass === 'SLOW_ROLL_GEOMETRY').length,
      slowRollAggregateEligible: geometryPerSecond.filter((g) => g.countsForSlowRollAggregate).length,
      presentChainSlowRoll: geometryPerSecond.filter(
        (g) => g.geometryClass === 'SLOW_ROLL_GEOMETRY' && g.legBasis === 'PRESENT_CHAIN',
      ).length,
      moving: geometryPerSecond.filter((g) => g.geometryClass === 'MOVING_GEOMETRY').length,
      scatter: geometryPerSecond.filter((g) => g.geometryClass === 'INCONCLUSIVE_SCATTER').length,
    };

    const gapEvents = buildGapEventsV2(gaps, presentPoints, posByLabel, r1ByLabel);
    const slowSegments = buildSlowRollSegmentsV2(geometryPerSecond);

    const bracketMap = new Map<string, GapBracketStructure>();
    for (const ev of gapEvents) {
      const g = gaps.find((x) => x.fromUtc === ev.consideredWindowUtc.from && x.toUtc === ev.consideredWindowUtc.to);
      if (!g) continue;
      const a = analyzeGapCandidateV2(g, presentPoints, posByLabel, r1ByLabel);
      bracketMap.set(ev.eventId, a.brackets);
    }

    const gapEventsA = JSON.parse(JSON.stringify(gapEvents)) as typeof gapEvents;
    const gapEventsB = JSON.parse(JSON.stringify(gapEvents)) as typeof gapEvents;
    const osmMeta = { fetchedAtUtc: osm.fetchedAtUtc, source: osm.source, requestMethod: osm.requestMethod };
    if (osm.error) {
      for (const ev of gapEventsB) {
        ev.mapContextVariantB = {
          available: false,
          reason: 'overpass_fetch_failed',
          error: osm.error,
          httpStatus: osm.httpStatus ?? null,
          responseSnippet: osm.responseSnippet ?? null,
          osmMeta,
        };
      }
    } else {
      applyMapContextVariantBEnhanced(gapEventsB, bracketMap, osm.signals, osmMeta);
    }

    const mapBTested = !osm.error && osm.signals.length >= 0;
    const abComparison = {
      variantA: { label: 'geometry + calendar-adjacent brackets (v0_2)', classificationCounts: countByClass(gapEventsA) },
      variantB: mapBTested
        ? {
            label: 'A + OSM traffic_signals proximity/bearing (classification unchanged)',
            classificationCounts: countByClass(gapEventsB),
            signalsInBbox: osm.signals.length,
            eventsWithSignalWithin30m: gapEventsB.filter(
              (e) =>
                e.mapContextVariantB &&
                typeof e.mapContextVariantB.nearestTrafficSignalM === 'number' &&
                (e.mapContextVariantB.nearestTrafficSignalM as number) <= 30,
            ).length,
            osmFetch: {
              source: osm.source,
              fetchedAtUtc: osm.fetchedAtUtc,
              requestMethod: osm.requestMethod,
              httpStatus: osm.httpStatus ?? null,
              error: osm.error ?? null,
            },
          }
        : {
            label: 'NOT_TESTED — Overpass fetch failed; not equivalent A/B',
            classificationCounts: null,
            signalsInBbox: 0,
            osmFetch: {
              source: osm.source,
              fetchedAtUtc: osm.fetchedAtUtc,
              requestMethod: osm.requestMethod,
              httpStatus: osm.httpStatus ?? null,
              error: osm.error ?? null,
              responseSnippet: osm.responseSnippet ?? null,
            },
          },
      measurableDifference: mapBTested
        ? 'v0_2: core explanation unchanged; B adds signal proximity + bearing delta metadata.'
        : 'Map variant B not executed successfully — report A-only.',
    };

    const allEvents = [
      ...gapEventsB,
      ...slowSegments.map((s) => ({
        eventId: s.eventId,
        kind: s.kind,
        consideredWindowUtc: { from: s.fromUtc, to: s.toUtc },
        gapDurationSec: null,
        standstillDurationSec: null,
        durationUncertainty: s.durationUncertainty,
        classification: s.classification,
        rulesApplied: s.rulesApplied,
        measurementsUsed: ['pinned POSITION leg geometry'],
        supportingAndContradicting: [],
        metrics: { segmentSeconds: s.seconds },
        retrospectiveStatementPossibleAtUtc: s.toUtc,
        mapContextVariantB: null,
      })),
    ];

    const videoEval = evaluateVideoCoverageVsClassification(gapEvents, videoByLabel);
    const mainHaltTable = buildMainHaltClassificationTable(gapEvents, videoByLabel);
    const naturalGapEval = evaluateNaturalMovementGaps(gapEvents, videoByLabel);
    const slowRollCross = slowRollVideoCrossTab(geometryPerSecond, videoByLabel);
    const syntheticBattery = runSyntheticGapBattery(presentPoints, sortedLabels, posByLabel);

    const mapPayload = mapPayloadFromTrip({
      presentPoints,
      gapEvents: gapEventsB.map((e) => {
        const br = bracketMap.get(e.eventId);
        return {
          eventId: e.eventId,
          consideredWindowUtc: e.consideredWindowUtc,
          classification: e.classification,
          bracketBefore: br?.calendarBracketBefore.length ? br.calendarBracketBefore : br?.distantContextBefore ?? [],
          bracketAfter: br?.calendarBracketAfter.length ? br.calendarBracketAfter : br?.distantContextAfter ?? [],
        };
      }),
      signals: osm.signals,
    });
    const mapHtml = buildMapReviewHtml(mapPayload);

    const summaryMd = buildSummaryMdV02(
      geometrySummary,
      gapEventsB,
      slowSegments,
      videoEval,
      abComparison,
      syntheticBattery,
      mainHaltTable,
    );

    const artifact = {
      schema: RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
      observedAtUtc,
      tripScope: { organizationId: REF.organizationId, tripId: REF.tripId, workItemId: REF.workItemId },
      geometryDocumentation: HOLD_NOISE_DISPLACEMENT_DOCUMENTATION,
      v01MisclassificationRootCause: V0_1_MISCLASSIFICATION_ROOT_CAUSE,
      geometryClassificationSummary: geometrySummary,
      gapRunsTotal: gaps.length,
      events: allEvents,
      abComparison,
      videoEvaluation: videoEval,
      naturalMovementGapEvaluation: naturalGapEval,
      slowRollVideoCrossTab: slowRollCross,
      syntheticGapBattery: syntheticBattery,
      mapArtifact: {
        htmlFile: 'MAP_REVIEW.html',
        osm: osm.error
          ? { error: osm.error, httpStatus: osm.httpStatus, responseSnippet: osm.responseSnippet }
          : { signalCount: osm.signals.length, ...osm },
        coordinateRounding: '4 decimal degrees in HTML payload',
      },
      rulesFrozenNote: 'Parameters fixed for this reference trip; re-validate on other drives before production use.',
    };

    const slowRollFull = geometryPerSecond
      .filter((r) => r.geometryClass === 'SLOW_ROLL_GEOMETRY')
      .map((r) => ({
        label: r.bucketLabelUtc,
        tacho: videoByLabel.get(r.bucketLabelUtc)?.tachoKmh ?? null,
        legBasis: r.legBasis,
        presentChainSpanSec: r.presentChainSpanSec,
        aggregateEligible: r.countsForSlowRollAggregate,
      }));

    const files: Record<string, string> = {
      'RETROSPECTIVE_HALT_EXPORT.json': JSON.stringify(artifact, null, 2),
      'EVENT_TABLE.json': JSON.stringify(allEvents, null, 2),
      'MAIN_HALT_CLASSIFICATION_TABLE.json': JSON.stringify(mainHaltTable, null, 2),
      'AB_COMPARISON.json': JSON.stringify(abComparison, null, 2),
      'VIDEO_EVALUATION.json': JSON.stringify(videoEval, null, 2),
      'NATURAL_GAP_EVALUATION.json': JSON.stringify(naturalGapEval, null, 2),
      'SLOW_ROLL_VIDEO_CROSS_TAB.json': JSON.stringify(slowRollFull, null, 2),
      'SYNTHETIC_GAP_BATTERY.json': JSON.stringify(syntheticBattery, null, 2),
      'SUMMARY.md': summaryMd,
      'MAP_REVIEW.html': mapHtml,
    };
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(outDir, name), body, 'utf8');
    }
    fs.writeFileSync(
      path.join(outDir, 'SHA256SUMS'),
      `${Object.keys(files)
        .sort()
        .map((n) => `${sha256File(path.join(outDir, n))}  ${n}`)
        .join('\n')}\n`,
      'utf8',
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          version: RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
          gapEvents: gapEvents.length,
          slowSegments: slowSegments.length,
          candidateCoverage: videoEval.knownHaltsCandidateCoverageCount,
          classificationAligned: videoEval.knownHaltsClassificationAlignedCount,
          mapBTested,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function writeV01Export(args: {
  outDir: string;
  observedAtUtc: string;
  presentPoints: ReturnType<typeof collectPresentPoints>;
  positions: import('../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types').DiV0SpeedQcPositionSample[];
  posByLabel: Map<string, import('../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types').DiV0SpeedQcPositionSample>;
  sortedLabels: string[];
  r1ByLabel: Map<string, number | null>;
  videoByLabel: Map<string, { tachoKmh: number | null }>;
  gaps: ReturnType<typeof findGapRuns>;
  osm: Awaited<ReturnType<typeof fetchOsmTrafficSignalsPost>>;
}): Promise<void> {
  const geometryPerSecond = classifyAllPresentLegs(args.presentPoints, args.positions);
  const gapEvents = buildGapEvents(args.gaps, args.presentPoints, args.r1ByLabel);
  const slowSegments = buildSlowRollSegments(geometryPerSecond);
  const bracketMap = new Map();
  for (const ev of gapEvents) {
    const g = args.gaps.find((x) => x.fromUtc === ev.consideredWindowUtc.from && x.toUtc === ev.consideredWindowUtc.to);
    if (!g) continue;
    const a = analyzeGapCandidate(g, args.presentPoints, args.r1ByLabel);
    bracketMap.set(ev.eventId, { before: a.bracketBefore, after: a.bracketAfter });
  }
  const gapEventsB = JSON.parse(JSON.stringify(gapEvents));
  applyMapContextVariantB(gapEventsB, bracketMap, args.osm.signals as OsmSignal[]);
  const allEvents = [...gapEventsB, ...slowSegments];
  const videoEval = evaluateAgainstVideo(allEvents, args.videoByLabel);
  const synthetic = syntheticGapStressTest(args.presentPoints, args.sortedLabels, args.posByLabel);
  const artifact = {
    schema: RETROSPECTIVE_HALT_PROTOTYPE_VERSION,
    observedAtUtc: args.observedAtUtc,
    videoEvaluation: videoEval,
    syntheticGapStress: synthetic,
  };
  fs.writeFileSync(path.join(args.outDir, 'RETROSPECTIVE_HALT_EXPORT.json'), JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ ok: true, version: RETROSPECTIVE_HALT_PROTOTYPE_VERSION }, null, 2));
}

function countByClass(events: Array<{ classification: string }>) {
  const m: Record<string, number> = {};
  for (const e of events) {
    m[e.classification] = (m[e.classification] ?? 0) + 1;
  }
  return m;
}

function buildSummaryMdV02(
  geometrySummary: Record<string, number>,
  gapEvents: Array<{ classification: string }>,
  slowSegments: Array<{ seconds: number }>,
  videoEval: ReturnType<typeof evaluateVideoCoverageVsClassification>,
  abComparison: Record<string, unknown>,
  syntheticBattery: ReturnType<typeof runSyntheticGapBattery>,
  mainHaltTable: ReturnType<typeof buildMainHaltClassificationTable>,
): string {
  const haltLike = gapEvents.filter((e) => e.classification === 'LIKELY_HALT').length;
  const slowLike = gapEvents.filter((e) => e.classification === 'LIKELY_SLOW_ROLL_STOP_GO').length;
  const movingGap = gapEvents.filter((e) => e.classification === 'LIKELY_MOVING_WITH_GAP').length;
  const unknown = gapEvents.filter((e) => e.classification === 'NOT_DISTINGUISHABLE').length;
  const haltRows = mainHaltTable
    .map(
      (r) =>
        `| ${r.knownHaltId} | ${r.videoTachoZeroDurationSec}s | ${r.predictedClass ?? '—'} | ${r.videoComparisonOutcome} |`,
    )
    .join('\n');

  return `# EXP021 — Rückblick-Halt-Prototyp v0_2

## Kandidaten vs. Klassifikation (5 Haupthalte)

Referenzlängen **31, 40, 8, 20, 26** Sekunden (Video Tacho 0) — nicht pauschal „31–40 s“.

| Halt | Video s | Vorhersage | Video-Abgleich |
|------|--------:|------------|----------------|
${haltRows}

- **Kandidatenabdeckung (Overlap):** ${videoEval.knownHaltsCandidateCoverageCount}/${videoEval.knownHaltsTotal}
- **Klassifikation video-konsistent (Halt/Slow-roll):** ${videoEval.knownHaltsClassificationAlignedCount}/${videoEval.knownHaltsTotal}
- Detailzeilen: \`MAIN_HALT_CLASSIFICATION_TABLE.json\`

## Positionslücken ≥3s

${gapEvents.length} Kandidaten (${haltLike} Halt · ${slowLike} langsam/Stop-go · ${movingGap} Weiterfahrt mit Lücke · ${unknown} nicht unterscheidbar)

## Langsam-Roll-Geometrie

- Alle SLOW_ROLL-Sekunden: ${geometrySummary.slowRoll} (davon Present-Kette: ${geometrySummary.presentChainSlowRoll})
- Für Aggregat zählfähig (Kalender 1s, Kette ≤2s): ${geometrySummary.slowRollAggregateEligible}
- Video-Kreuztabelle: \`SLOW_ROLL_VIDEO_CROSS_TAB.json\`

## Synthetische vs. natürliche Lücken

- Synthetische Fälle: ${syntheticBattery.cases.filter((c) => c.synthetic).length} (\`SYNTHETIC_GAP_BATTERY.json\`)
- Natürliche Lücken: \`NATURAL_GAP_EVALUATION.json\`

## Karte A/B

${JSON.stringify(abComparison).includes('NOT_TESTED') ? '**B nicht ausgeführt** — siehe AB_COMPARISON.json' : 'A + B ausgeführt — siehe AB_COMPARISON.json'}

## v0_1 Fehlklassifikation

Bracket-Mittelgeschwindigkeit und Chord-Kontradikt → \`LIKELY_MOVING_WITH_GAP\`; v0_2 ersetzt durch Kalender-Kanten und Composite-Scoring (siehe Export).

Entwicklungs-/Prüfmaterial — kein Blindtest. Produkt-L3 unverändert.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
