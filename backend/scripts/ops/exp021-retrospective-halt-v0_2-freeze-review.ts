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
  buildFreezeManifest,
  buildMainHaltHonestReview,
  buildReviewMarkdownTable,
  buildTenEventReview,
  clipRequestsForVideoChat,
  inputStandHash,
  naturalGapCounterReport,
  slowRollVideoNumbers,
  syntheticCounterReport,
  V0_2_FREEZE_ID,
} from './exp021-retrospective-halt-v0_2-freeze-review.lib';

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
    const reviewTableMd = buildReviewMarkdownTable(tenEvents);

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
      decisionRuleIncludesMap: false,
      label: 'Kartenanreicherung (Anzeige/Protokoll), kein Wirksamkeitsvergleich zweier Detektoren',
      evidence: 'applyMapContextVariantBEnhanced mutiert nur mapContextVariantB; gapEventsA/B classificationCounts identisch in v0_2 export.',
      signalCountInBbox: gapEventsV02[0]?.mapContextVariantB?.available ? 'see per-event mapContext' : 'varies',
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
      mapContribution,
      videoClipRequestsForAnalysisChat: clips,
      evaluationDisclaimer:
        'Post-hoc video tacho overlay only — no visual review performed in this export. Unknown seconds are neither hits nor errors.',
    };

    const summary = `# EXP021 v0_2 — eingefrorene Review-Auswertung

**Freeze:** \`${V0_2_FREEZE_ID}\`  
**Parameter-Hash:** \`${freeze.parameterSnapshotHash}\`  
**Input-Stand-Hash:** \`${inputHash}\`

## Karte
${mapContribution.label}. \`decisionRuleIncludesMap: false\`

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

## Clip-Anfragen (Video-Chat, keine visuelle Prüfung hier)
${clips.map((c) => `- **${c.id}** ${c.berlinFrom}–${c.berlinTo} (${c.utcFrom} … ${c.utcTo}): ${c.reason}`).join('\n')}
`;

    const files: Record<string, string> = {
      'V0_2_FREEZE_MANIFEST.json': JSON.stringify(freeze, null, 2),
      'V0_2_FROZEN_REVIEW.json': JSON.stringify(payload, null, 2),
      'TEN_GAP_EVENTS.json': JSON.stringify(tenEvents, null, 2),
      'MAIN_HALTS_HONEST.json': JSON.stringify(payload.fiveMainHaltsHonest, null, 2),
      'REVIEW_TABLE.md': reviewTableMd,
      'REVIEW_SUMMARY.md': summary,
      'VIDEO_CLIP_REQUESTS.md': clips.map((c) => `## ${c.id}\n- Berlin: ${c.berlinFrom} – ${c.berlinTo}\n- UTC: ${c.utcFrom} – ${c.utcTo}\n- ${c.reason}\n`).join('\n'),
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
