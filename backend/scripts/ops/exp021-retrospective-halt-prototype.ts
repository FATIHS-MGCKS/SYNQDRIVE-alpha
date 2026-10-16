#!/usr/bin/env ts-node
/**
 * EXP021 retrospective halt / gap event detector (offline, post-trip).
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
import { buildMapReviewHtml, mapPayloadFromTrip } from './exp021-retrospective-halt-map.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function fetchOsmTrafficSignals(bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<{ signals: OsmSignal[]; source: string; fetchedAtUtc: string; error?: string }> {
  const fetchedAtUtc = new Date().toISOString();
  const query = `[out:json][timeout:25];node["highway"="traffic_signals"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out body;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        signals: [],
        source: 'OpenStreetMap Overpass API (highway=traffic_signals)',
        fetchedAtUtc,
        error: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { elements?: Array<{ id: number; lat: number; lon: number }> };
    const signals = (body.elements ?? []).map((e) => ({ id: e.id, lat: e.lat, lon: e.lon }));
    return { signals, source: 'OpenStreetMap Overpass API (highway=traffic_signals)', fetchedAtUtc };
  } catch (e) {
    return {
      signals: [],
      source: 'OpenStreetMap Overpass API',
      fetchedAtUtc,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
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
    const sortedLabels = [...ctx.shadowIntervals]
      .map((r) => dateToBucketLabel(r.referenceTime))
      .sort();
    const presentPoints = collectPresentPoints(ctx.evidence.positions);
    const r1ByLabel = new Map(ctx.evidence.r1Obd.map((r) => [r.bucketLabel, r.speedKmh]));
    const videoRaw = loadVideoComparisonByLabel(repoRoot);
    const videoByLabel = new Map(
      [...videoRaw.entries()].map(([k, v]) => [k, { tachoKmh: v.tachoKmh ?? null }]),
    );

    const geometryPerSecond = classifyAllPresentLegs(presentPoints, ctx.evidence.positions);
    const geometrySummary = {
      nearStop: geometryPerSecond.filter((g) => g.geometryClass === 'NEAR_STOP_GEOMETRY').length,
      slowRoll: geometryPerSecond.filter((g) => g.geometryClass === 'SLOW_ROLL_GEOMETRY').length,
      moving: geometryPerSecond.filter((g) => g.geometryClass === 'MOVING_GEOMETRY').length,
      scatter: geometryPerSecond.filter((g) => g.geometryClass === 'INCONCLUSIVE_SCATTER').length,
    };

    const gaps = findGapRuns(sortedLabels, posByLabel);
    const gapEvents = buildGapEvents(gaps, presentPoints, r1ByLabel);
    const slowSegments = buildSlowRollSegments(geometryPerSecond);

    const bracketMap = new Map<string, { before: typeof presentPoints; after: typeof presentPoints }>();
    for (const ev of gapEvents) {
      const g = gaps.find((x) => x.fromUtc === ev.consideredWindowUtc.from && x.toUtc === ev.consideredWindowUtc.to);
      if (!g) continue;
      const a = analyzeGapCandidate(g, presentPoints, r1ByLabel);
      bracketMap.set(ev.eventId, { before: a.bracketBefore, after: a.bracketAfter });
    }

    const lats = presentPoints.map((p) => p.lat);
    const lons = presentPoints.map((p) => p.lon);
    const bbox = {
      south: Math.min(...lats) - 0.002,
      north: Math.max(...lats) + 0.002,
      west: Math.min(...lons) - 0.002,
      east: Math.max(...lons) + 0.002,
    };
    const osm = await fetchOsmTrafficSignals(bbox);

    const gapEventsA = JSON.parse(JSON.stringify(gapEvents)) as typeof gapEvents;
    const gapEventsB = JSON.parse(JSON.stringify(gapEvents)) as typeof gapEvents;
    applyMapContextVariantB(gapEventsB, bracketMap, osm.signals);

    const abComparison = {
      variantA: { label: 'geometry + brackets only', classificationCounts: countByClass(gapEventsA) },
      variantB: {
        label: 'A + OSM traffic_signals proximity (context only; classification unchanged in v0_1)',
        classificationCounts: countByClass(gapEventsB),
        signalsInBbox: osm.signals.length,
        eventsWithSignalWithin30m: gapEventsB.filter(
          (e) =>
            e.mapContextVariantB &&
            typeof e.mapContextVariantB.nearestTrafficSignalM === 'number' &&
            e.mapContextVariantB.nearestTrafficSignalM <= 30,
        ).length,
        osmFetch: { source: osm.source, fetchedAtUtc: osm.fetchedAtUtc, error: osm.error ?? null },
      },
      measurableDifference:
        'v0_1: core explanation unchanged; B adds nearest-signal distance and count of halt-plausible contexts near signals.',
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

    const videoEval = evaluateAgainstVideo(allEvents, videoByLabel);
    const synthetic = syntheticGapStressTest(presentPoints, sortedLabels, posByLabel);

    const mapPayload = mapPayloadFromTrip({
      presentPoints,
      gapEvents: gapEventsB.map((e) => ({
        eventId: e.eventId,
        consideredWindowUtc: e.consideredWindowUtc,
        classification: e.classification,
        bracketBefore: bracketMap.get(e.eventId)?.before ?? [],
        bracketAfter: bracketMap.get(e.eventId)?.after ?? [],
      })),
      signals: osm.signals,
    });
    const mapHtml = buildMapReviewHtml(mapPayload);

    const summaryMd = buildSummaryMd(geometrySummary, gapEventsB, slowSegments, videoEval, abComparison, synthetic);

    const artifact = {
      schema: RETROSPECTIVE_HALT_PROTOTYPE_VERSION,
      observedAtUtc,
      tripScope: { organizationId: REF.organizationId, tripId: REF.tripId, workItemId: REF.workItemId },
      geometryClassificationSummary: geometrySummary,
      geometryPerSecondSample: geometryPerSecond.filter((_, i) => i % 20 === 0).slice(0, 50),
      gapRunsTotal: gaps.length,
      events: allEvents,
      abComparison,
      videoEvaluation: videoEval,
      syntheticGapStress: synthetic,
      mapArtifact: {
        htmlFile: 'MAP_REVIEW.html',
        osm: osm.error ? { error: osm.error } : { signalCount: osm.signals.length, ...osm },
        coordinateRounding: '4 decimal degrees in HTML payload',
      },
      rulesFrozenNote: 'Parameters fixed for this reference trip; re-validate on other drives before production use.',
    };

    const files: Record<string, string> = {
      'RETROSPECTIVE_HALT_EXPORT.json': JSON.stringify(artifact, null, 2),
      'EVENT_TABLE.json': JSON.stringify(allEvents, null, 2),
      'AB_COMPARISON.json': JSON.stringify(abComparison, null, 2),
      'VIDEO_EVALUATION.json': JSON.stringify(videoEval, null, 2),
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
          gapEvents: gapEvents.length,
          slowSegments: slowSegments.length,
          knownHaltsFound: videoEval.knownHaltsFoundCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

function countByClass(events: Array<{ classification: string }>) {
  const m: Record<string, number> = {};
  for (const e of events) {
    m[e.classification] = (m[e.classification] ?? 0) + 1;
  }
  return m;
}

function buildSummaryMd(
  geometrySummary: Record<string, number>,
  gapEvents: Array<{ classification: string; eventId: string; consideredWindowUtc: { from: string; to: string } }>,
  slowSegments: Array<{ seconds: number }>,
  videoEval: ReturnType<typeof evaluateAgainstVideo>,
  abComparison: Record<string, unknown>,
  synthetic: Record<string, unknown>,
): string {
  const haltLike = gapEvents.filter((e) => e.classification === 'LIKELY_HALT').length;
  const slowLike = gapEvents.filter((e) => e.classification === 'LIKELY_SLOW_ROLL_STOP_GO').length;
  const movingGap = gapEvents.filter((e) => e.classification === 'LIKELY_MOVING_WITH_GAP').length;
  const unknown = gapEvents.filter((e) => e.classification === 'NOT_DISTINGUISHABLE').length;

  return `# EXP021 — Rückblick-Halt-Prototyp (Kurzfassung)

## Zusätzlich erkannte Ereignisse (ohne Video-Eingabe)

- **Positionslücken ≥3s:** ${gapEvents.length} Kandidaten (${haltLike} wahrscheinlicher Halt · ${slowLike} langsam/Stop-go · ${movingGap} Weiterfahrt mit Lücke · ${unknown} nicht unterscheidbar)
- **Langsam-Roll-Geometrie-Segmente:** ${slowSegments.length} (Summe ${slowSegments.reduce((a, s) => a + s.seconds, 0)} gemessene Sekunden)

## Bekannte Video-Halte (5)

- Als überlappendes Detektor-Ereignis gefunden: **${videoEval.knownHaltsFoundCount}/${videoEval.knownHaltsTotal}**
- Details: \`VIDEO_EVALUATION.json\`

## Verwechslungen / Grenzen

- **Rollen vs. Stehen:** ${slowLike} Lücken + ${slowSegments.length} Geometrie-Segmente als langsam klassifiziert; Video-Tacho 1–3 km/h separat im Abgleich prüfen.
- **Fälschliche Halte bei Fahrt:** Synthetischer Stresstest in Bewegungsabschnitt: Klassifikation \`${(synthetic as { classification?: string }).classification}\` (Pass=${(synthetic as { pass?: boolean }).pass}).
- **Unentscheidbar:** ${unknown} Lücken — Lückendauer ≠ Stillstandsdauer.

## Geometrie (gesamte Fahrt, PRESENT)

| Klasse | Sekunden |
|--------|--------:|
| NEAR_STOP | ${geometrySummary.nearStop} |
| SLOW_ROLL | ${geometrySummary.slowRoll} |
| MOVING | ${geometrySummary.moving} |
| SCATTER | ${geometrySummary.scatter} |

## Karte A/B

- **A:** Fahrtverlauf + Lücken-Chords (ungemessen gestrichelt) — \`MAP_REVIEW.html\`
- **B:** + OSM Ampeln (${JSON.stringify(abComparison).includes('signalsInBbox') ? 'siehe AB_COMPARISON.json' : 'n/a'})

Entwicklungs-/Prüfmaterial — kein Blindtest. Produkt-L3 unverändert.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
