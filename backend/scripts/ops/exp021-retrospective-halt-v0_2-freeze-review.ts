#!/usr/bin/env ts-node
/**
 * EXP021 v0_2 freeze manifest + honest evaluation (read-only DB, no threshold changes).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { REF } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';
import { loadVideoComparisonByLabel } from './exp021-ev-ground-truth-forensic-supplement-v3.lib';
import { collectPresentPoints, findGapRuns } from './exp021-retrospective-halt-prototype.lib';
import { buildGapEventsV2 } from './exp021-retrospective-halt-prototype-v2.lib';
import {
  buildDevelopmentStatusConsolidated,
  buildFreezeManifest,
  buildMainHaltHonestReview,
  buildPerEventDecisionRows,
  buildPositiveHaltIndications005to008,
  buildReviewMarkdownTable,
  buildTenEventReview,
  buildVideoABC005to008,
  classifyPossibleCauseContext,
  clipRequestsForVideoChat,
  GEOMETRY_NET_DISPLACEMENT_SEMANTICS,
  inputStandHash,
  naturalGapCounterReport,
  REFERENCE_LONG_HALT_SEMANTICS,
  slowRollVideoNumbers,
  syntheticCounterReport,
  V0_2_FREEZE_ID,
} from './exp021-retrospective-halt-v0_2-freeze-review.lib';
import {
  analyzeMapAssociation,
  MAP_DECISION_HYPOTHESIS_V1_STATUS,
} from './exp021-retrospective-halt-map-hypothesis-v1.lib';
import { buildGapBrackets } from './exp021-retrospective-halt-prototype-v2.lib';

function loadSignalsFromMapReviewHtml(htmlPath: string): Array<{ id: number; lat: number; lon: number }> {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('const payload = ');
  if (start < 0) return [];
  const jsonStart = start + 'const payload = '.length;
  const jsonEnd = html.indexOf(';\n', jsonStart);
  if (jsonEnd < 0) return [];
  const payload = JSON.parse(html.slice(jsonStart, jsonEnd)) as {
    trafficSignals?: Array<{ id: number; lat: number; lon: number }>;
  };
  return payload.trafficSignals ?? [];
}

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  fs.mkdirSync(outDir, { recursive: true });

  const freeze = buildFreezeManifest(repoRoot);
  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId: process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId,
      tripId: process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId,
      workItemId: process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId,
    });

    const inputHash = inputStandHash(ctx);
    const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
    const sortedLabels = [...ctx.shadowIntervals].map((r) => dateToBucketLabel(r.referenceTime)).sort();
    const presentPoints = collectPresentPoints(ctx.evidence.positions);
    const r1ByLabel = new Map(ctx.evidence.r1Obd.map((r) => [r.bucketLabel, r.speedKmh]));
    const videoRaw = loadVideoComparisonByLabel(repoRoot);
    const videoByLabel = new Map([...videoRaw.entries()].map(([k, v]) => [k, { tachoKmh: v.tachoKmh ?? null }]));

    const gaps = findGapRuns(sortedLabels, posByLabel).filter((g) => g.durationSec >= 3);
    const gapEventsV02 = buildGapEventsV2(gaps, presentPoints, posByLabel, r1ByLabel);

    const frozenExportPath = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-retrospective-halt-v2/EVENT_TABLE.json',
    );
    let mapFromFrozenExport: Array<{ eventId: string; mapContextVariantB?: Record<string, unknown> | null }> = gapEventsV02;
    if (fs.existsSync(frozenExportPath)) {
      const frozen = JSON.parse(fs.readFileSync(frozenExportPath, 'utf8')) as Array<{
        eventId: string;
        kind: string;
        mapContextVariantB?: Record<string, unknown> | null;
      }>;
      mapFromFrozenExport = gapEventsV02.map((e) => {
        const f = frozen.find((x) => x.eventId === e.eventId && x.kind === 'POSITION_GAP');
        return { eventId: e.eventId, mapContextVariantB: f?.mapContextVariantB ?? null };
      });
    }

    const tenEvents = buildTenEventReview({
      gaps,
      presentPoints,
      posByLabel,
      r1ByLabel,
      videoByLabel,
      gapEventsV02FromExport: mapFromFrozenExport,
    });

    const mainHalts = buildMainHaltHonestReview(tenEvents, videoByLabel);
    const sharedGapMainHalts: Record<string, string[]> = {};
    for (const h of mainHalts) {
      for (const ev of h.overlappingGapEvents) {
        if (!sharedGapMainHalts[ev.eventId]) sharedGapMainHalts[ev.eventId] = [];
        sharedGapMainHalts[ev.eventId].push(h.haltId);
      }
    }

    const natural = naturalGapCounterReport(tenEvents);
    const synthetic = syntheticCounterReport(presentPoints, sortedLabels, posByLabel);
    const slowRoll = slowRollVideoNumbers(presentPoints, ctx.evidence.positions, videoByLabel);
    const clips = clipRequestsForVideoChat(mainHalts, tenEvents);
    const haltIndications005to008 = buildPositiveHaltIndications005to008(tenEvents);
    const reviewTableMd = buildReviewMarkdownTable(tenEvents);

    const mapHtmlPath = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-retrospective-halt-v2/MAP_REVIEW.html',
    );
    const osmSignals = fs.existsSync(mapHtmlPath) ? loadSignalsFromMapReviewHtml(mapHtmlPath) : [];

    const mapContextByEvent = new Map<
      string,
      ReturnType<typeof classifyPossibleCauseContext> & {
        mapAnalysis: ReturnType<typeof analyzeMapAssociation>;
      }
    >();
    const mapContextOnlyResults = gaps.map((g, idx) => {
      const eventId = `GAP_EVT_${String(idx + 1).padStart(3, '0')}`;
      const brackets = buildGapBrackets(g, presentPoints, posByLabel);
      const mapAnalysis = analyzeMapAssociation({
        gapFromUtc: g.fromUtc,
        gapToUtc: g.toUtc,
        brackets,
        presentPoints,
        signals: osmSignals,
      });
      const causeContext = classifyPossibleCauseContext(mapAnalysis);
      mapContextByEvent.set(eventId, { ...causeContext, mapAnalysis });
      return { eventId, causeContext, mapAnalysis };
    });

    const perEventDecisions = buildPerEventDecisionRows({ tenEvents, mapContextByEvent });
    const videoABC005to008 = buildVideoABC005to008(tenEvents);
    const developmentStatus = buildDevelopmentStatusConsolidated({ natural, synthetic, tenEvents });

    const perEventTableMd = [
      '| Evt | Bewegung (v0_2) | Kontext Ursache | A Tacho-0-Abschnitt | B ganzes Fenster 0 | C Zeit bestimmt | Video prüfbar |',
      '|-----|-----------------|-----------------|---------------------|-------------------|-----------------|---------------|',
      ...perEventDecisions.map((r) => {
        const ax = r.videoAxesABC as {
          A_tachoZeroSectionInPredictedWindow: string;
          B_entireWindowContinuousTachoZero: string;
          C_haltBeginEndDurationDetermined: string;
        };
        return `| ${r.eventId} | ${r.movementEventV02} | ${r.possibleCauseContext} | ${ax.A_tachoZeroSectionInPredictedWindow} | ${ax.B_entireWindowContinuousTachoZero} | ${ax.C_haltBeginEndDurationDetermined} | ${r.videoValidatable} |`;
      }),
    ].join('\n');

    const videoAbcTableMd = [
      '| Evt | A | B | C |',
      '|-----|---|---|---|',
      ...videoABC005to008.map(
        (r) =>
          `| ${r.eventId} | ${r.videoAxes.A_tachoZeroSectionInPredictedWindow} | ${r.videoAxes.B_entireWindowContinuousTachoZero} | ${r.videoAxes.C_haltBeginEndDurationDetermined} |`,
      ),
    ].join('\n');

    const likelyHaltAudit = tenEvents
      .filter((e) => e.classificationV02 === 'LIKELY_HALT')
      .map((e) => ({
        eventId: e.eventId,
        overlappingMainHalts: e.overlappingAnnotatedMainHalts,
        canAssignVideoMainHalt: e.overlappingAnnotatedMainHalts.length > 0,
        sharedByMainHalts: sharedGapMainHalts[e.eventId] ?? [],
        videoVerdict: e.videoPostHocVerdict,
        riskNote:
          e.overlappingAnnotatedMainHalts.length === 0
            ? 'LIKELY_HALT ohne Haupthalt-Overlap — nur Chord/Lückenlänge, kein annotierter Video-Halt.'
            : null,
      }));

    const mapContribution = {
      v0_2FrozenClassifier: {
        decisionRuleIncludesMap: false,
        label: 'Kartenanreicherung (reine Kontextanzeige in MAP_REVIEW.html / mapContextVariantB)',
      },
      mapDecisionHypothesisV1: {
        ...MAP_DECISION_HYPOTHESIS_V1_STATUS,
        rejectionDoc: 'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/EXP021_MAP_DECISION_HYPOTHESIS_V1_REJECTED.md',
        appliedToClassificationInThisExport: false,
      },
      mapCauseContextEnrichment: {
        signalsLoadedFrom: 'frozen MAP_REVIEW.html trafficSignals',
        signalCount: osmSignals.length,
        perEvent: mapContextOnlyResults,
      },
    };

    const payload = {
      schema: V0_2_FREEZE_ID,
      freezeManifest: freeze,
      inputStandHash: inputHash,
      tripScope: { organizationId: REF.organizationId, tripId: REF.tripId, workItemId: REF.workItemId },
      tenGapEvents: tenEvents,
      sixLikelyHaltAudit: likelyHaltAudit,
      fiveMainHaltsHonest: mainHalts.map((h) => ({
        ...h,
        sharedGapEventIds: h.overlappingGapEvents.map((e) => e.eventId),
        coClaimedWithOtherMainHalts: h.overlappingGapEvents.flatMap((e) =>
          (sharedGapMainHalts[e.eventId] ?? []).filter((id) => id !== h.haltId),
        ),
      })),
      naturalGapCounter: natural,
      syntheticGapCounter: synthetic,
      slowRollVideo: slowRoll,
      referenceLongHaltSemantics: REFERENCE_LONG_HALT_SEMANTICS,
      geometryNetDisplacementSemantics: GEOMETRY_NET_DISPLACEMENT_SEMANTICS,
      mapContribution,
      videoAxesABC005to008: videoABC005to008,
      developmentStatusConsolidated: developmentStatus,
      haltPositiveIndications005to008: haltIndications005to008,
      perEventDecisions,
      videoClipRequestsForAnalysisChat: clips,
      videoVerdictRuleBook: tenEvents[0]?.videoDualAxis?.ruleBook,
      evaluationDisclaimer:
        'Post-hoc video tacho overlay only — no visual review performed in this export. Unknown seconds are neither hits nor errors.',
    };

    const summary = `# EXP021 v0_2 — eingefrorene Review-Auswertung

**Freeze:** \`${V0_2_FREEZE_ID}\`  
**Parameter-Hash:** \`${freeze.parameterSnapshotHash}\`  
**Input-Stand-Hash:** \`${inputHash}\`

## Referenz LONG_HALT
${REFERENCE_LONG_HALT_SEMANTICS.definition}  
Zeit: **05:xx Berlin = 03:xx UTC** (CEST). H4/H5 Annotationslücke 05:44:03–05:44:09 — physische Ereignisanzahl ungeklärt.

## Karte
v0_2: **reine Kontextanzeige**. **MAP_DECISION_HYPOTHESIS_V1 verworfen** (kein Karten-Veto). Kontext nur „mögliche Ursache“ in \`PER_EVENT_DECISIONS.md\`.

## Video ABC (005–008)
${videoAbcTableMd}

## Entwicklungsstand
Siehe \`DEVELOPMENT_STATUS_CONSOLIDATED.md\`

## Zehn Lückenereignisse

${reviewTableMd}

Details: \`TEN_GAP_EVENTS.json\`

## Fünf Haupthalte (getrennt, ohne Sammel „Halt/Slow-roll“)

| Halt | Berlin | Detektor-Ergebnis | Überlappende GAP_EVT | Tacho-0 s |
|------|--------|-------------------|----------------------|----------:|
${mainHalts
  .map(
    (h) =>
      `| ${h.haltId} | ${h.videoWindowBerlin.from}–${h.videoWindowBerlin.to} | ${h.detectorOutcome} | ${h.overlappingGapEvents.map((e) => e.eventId).join(', ') || '—'} | ${h.videoTacho0LabeledSeconds} |`,
  )
  .join('\n')}

**Hinweis:** \`PROBABLE_HALT_CLASSIFIED\` ≠ zeitliche Lokalisierung des Halts innerhalb des Kandidatenfensters.

## Sechs × LIKELY_HALT
${likelyHaltAudit.map((a) => `- **${a.eventId}**: Video-Haupthalt zuordenbar=${a.canAssignVideoMainHalt}; geteilt mit ${a.sharedByMainHalts.join(', ') || '—'}; Video=${a.videoVerdict.verdict}`).join('\n')}

## Gegenprüfung (Zahlen)

**Natürliche Lücken (${natural.caseCount}):** ${JSON.stringify(natural.predictedClassCounts)}  
Falsche-Halt-Signale: ${JSON.stringify(natural.falseHaltSignals)}  
Video nachträglich: gestützt ${natural.videoPostHoc.supported}, widersprochen ${natural.videoPostHoc.contradicted}, nicht entscheidbar ${natural.videoPostHoc.notDecisive}

**Synthetisch:** ${synthetic.syntheticCaseCount} Fälle, Pass ${synthetic.syntheticPassCount}, Fail ${synthetic.syntheticFailCount}; Klassen ${JSON.stringify(synthetic.syntheticByClass)}

## 52 SLOW_ROLL-Sekunden — Video
Alle: ${JSON.stringify(slowRoll.videoCrossTabAllSeconds)}  
Aggregat-fähig: ${JSON.stringify(slowRoll.videoCrossTabAggregateEligibleSeconds)}

## Haltindizien 005–008
Siehe \`HALT_INDICATIONS_005_008.json\` (Werte + explizit kein Beweis allein aus „keine Gegenargumente“).

## Video-Bewertungsregel
${tenEvents[0]?.videoDualAxis?.ruleBook ?? ''}

## Clip-Anfragen / Nicht prüfbar
${clips.map((c) => `- **${c.id}** [${c.action}] ${c.berlinFrom} – ${c.berlinTo}: ${c.reason}`).join('\n')}
`;

    const files: Record<string, string> = {
      'V0_2_FREEZE_MANIFEST.json': JSON.stringify(freeze, null, 2),
      'V0_2_FROZEN_REVIEW.json': JSON.stringify(payload, null, 2),
      'TEN_GAP_EVENTS.json': JSON.stringify(tenEvents, null, 2),
      'MAIN_HALTS_HONEST.json': JSON.stringify(payload.fiveMainHaltsHonest, null, 2),
      'REVIEW_TABLE.md': reviewTableMd,
      'REVIEW_SUMMARY.md': summary,
      'VIDEO_CLIP_REQUESTS.md': clips
        .map(
          (c) =>
            `## ${c.id} (${c.action})\n- Berlin / UTC: ${c.berlinFrom} – ${c.berlinTo}\n- ${c.reason}\n`,
        )
        .join('\n'),
      'PER_EVENT_DECISIONS.json': JSON.stringify(perEventDecisions, null, 2),
      'PER_EVENT_DECISIONS.md': perEventTableMd,
      'VIDEO_ABC_005_008.md': videoAbcTableMd,
      'VIDEO_ABC_005_008.json': JSON.stringify(videoABC005to008, null, 2),
      'HALT_INDICATIONS_005_008.json': JSON.stringify(haltIndications005to008, null, 2),
      'MAP_CAUSE_CONTEXT_ONLY.json': JSON.stringify(mapContextOnlyResults, null, 2),
      'MAP_HYPOTHESIS_V1_REJECTED.json': JSON.stringify(MAP_DECISION_HYPOTHESIS_V1_STATUS, null, 2),
      'REFERENCE_SEMANTICS.json': JSON.stringify(REFERENCE_LONG_HALT_SEMANTICS, null, 2),
      'GEOMETRY_SEMANTICS.json': JSON.stringify(GEOMETRY_NET_DISPLACEMENT_SEMANTICS, null, 2),
      'DEVELOPMENT_STATUS_CONSOLIDATED.md': `# EXP021 Entwicklungsstand (konsolidiert)\n\n${developmentStatus.v02OnThisTripTraceable.map((x) => `- ${x}`).join('\n')}\n\n## Gegenfälle bestanden\n${developmentStatus.counterCasesPassed.map((x) => `- ${x}`).join('\n')}\n\n## Fehlalarm-Risiken\n${developmentStatus.remainingFalseAlarmRisks.map((x) => `- ${x}`).join('\n')}\n\n## Nächste unabhängige Referenzfälle\n${developmentStatus.nextIndependentReferenceCasesNeeded.map((x) => `- ${x}`).join('\n')}\n`,
      'DEVELOPMENT_STATUS_CONSOLIDATED.json': JSON.stringify(developmentStatus, null, 2),
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

    console.log(JSON.stringify({ ok: true, freezeId: V0_2_FREEZE_ID, outDir, parameterHash: freeze.parameterSnapshotHash }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
