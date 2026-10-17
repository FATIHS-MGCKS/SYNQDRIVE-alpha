#!/usr/bin/env ts-node
/**
 * EXP021 stationary / creep / gap — offline prototype + baseline evaluation (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import { REF } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';
import {
  exportForensicBucket,
  EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC,
  verifyBaselineParity,
} from './exp021-ev-ground-truth-forensic-export.lib';
import {
  loadVideoComparisonByLabel,
  type VideoComparisonRow,
} from './exp021-ev-ground-truth-forensic-supplement-v3.lib';
import {
  buildReferenceCases,
  classifyPrototypeSecond,
  DEV_HOLDOUT_SPLIT,
  evaluateReferenceCase,
  explainV2StationaryDetection,
  findShortTachoZeroHalts,
  formulateGroupBExperimentFromCreep,
  isBaselineV2Stop,
  isPrototypeStopLabel,
  PROTOTYPE_LIMITS,
  PROTOTYPE_VERSION,
  videoStopProxy,
  type PrototypeMotionLabel,
} from './exp021-stationary-offline-prototype.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const observedAtUtc = new Date().toISOString();
  const repoRoot = path.resolve(__dirname, '../../..');
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId: process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId,
      tripId: process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId,
      workItemId: process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId,
    });

    const baselineRows = buildEvGroundTruthPerSecondReplay(ctx);
    const parity = verifyBaselineParity(baselineRows);
    const videoByLabel = loadVideoComparisonByLabel(repoRoot);
    const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
    const shadowMap = new Map(ctx.shadowIntervals.map((r) => [dateToBucketLabel(r.referenceTime), r]));

    const shortHalts = findShortTachoZeroHalts(videoByLabel, EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC);
    const referenceCases = buildReferenceCases(shortHalts);

    const perLabel = new Map<
      string,
      {
        prototype: PrototypeMotionLabel;
        baseline: (typeof baselineRows)[number];
        forensic: ReturnType<typeof exportForensicBucket>;
        video: VideoComparisonRow | undefined;
      }
    >();

    const labelCreepCount = { creep: 0 };
    for (const baseline of baselineRows) {
      const label = baseline.bucketLabelUtc;
      const forensic = exportForensicBucket(label, ctx, shadowMap.get(label), posByLabel);
      const proto = classifyPrototypeSecond({ forensic, baseline });
      if (proto.label === 'CREEP') labelCreepCount.creep += 1;
      perLabel.set(label, {
        prototype: proto.label,
        baseline,
        forensic,
        video: videoByLabel.get(label),
      });
    }

    const caseEvals = referenceCases.map((c) => evaluateReferenceCase(c, perLabel));

    let globalVideoStop = 0;
    let globalBaselineV2Stop = 0;
    let globalProtoStop = 0;
    let globalMissed = 0;
    let globalFalseStop = 0;
    let globalUnknown = 0;
    let globalMovingFalseStop = 0;

    for (const [label, row] of perLabel) {
      const v = videoStopProxy(row.video);
      if (v.isAnnotatedStop) globalVideoStop += 1;
      if (isBaselineV2Stop(row.baseline)) globalBaselineV2Stop += 1;
      if (isPrototypeStopLabel(row.prototype)) globalProtoStop += 1;
      if (row.prototype.startsWith('UNKNOWN')) globalUnknown += 1;
      if (v.isAnnotatedStop && !isPrototypeStopLabel(row.prototype)) globalMissed += 1;
      if (isPrototypeStopLabel(row.prototype) && row.video?.tachoKmh != null && row.video.tachoKmh >= 4) {
        globalFalseStop += 1;
      }
      if (
        isPrototypeStopLabel(row.prototype) &&
        row.baseline.l3SpeedKmh != null &&
        row.baseline.l3SpeedKmh >= 5
      ) {
        globalMovingFalseStop += 1;
      }
    }

    const rowAbsentLabels = baselineRows
      .filter((r) => r.positionAvailability === 'ROW_ABSENT')
      .map((r) => r.bucketLabelUtc);

    const gapDuringMotionCase = {
      id: 'GAP_ROW_ABSENT_MOVING_PROXY',
      category: 'gap_during_motion' as const,
      fromUtc: '2026-10-16T03:45:00Z',
      toUtc: '2026-10-16T03:46:00Z',
      epistemic: 'INFERRED' as const,
      source: 'Sample minute with mixed ROW_ABSENT outside halt windows',
      videoNote: 'Illustrative window for ROW_ABSENT during driving (not all seconds moving).',
    };
    referenceCases.push(gapDuringMotionCase);
    caseEvals.push(evaluateReferenceCase(gapDuringMotionCase, perLabel));

    const chatGptReturn = referenceCases.flatMap((c) => c.chatGptReturn ?? []);

    const prototypeArtifact = {
      schema: PROTOTYPE_VERSION,
      observedAtUtc,
      frozenBaselineUnchanged: true,
      providerComparisonFetchExecuted: false,
      providerComparisonNote:
        'Supplement v2 ROW_ABSENT fetch plan remains prepared only; not required to answer stationary-focus questions.',
      limits: PROTOTYPE_LIMITS,
      devHoldout: DEV_HOLDOUT_SPLIT,
      v2Semantics: explainV2StationaryDetection(),
      decisionRules: {
        stopConfirmed: 'L3 triplet calendar-complete + max leg implied < 1.5 km/h → STOP_STRICT (no numeric speed emitted).',
        stopV2Aligned: 'Existing STATIONARY_SUPPORTED + STATIONARY_BAND + TRUSTED_LIMITED → STOP_V2_BAND (extends V2, not parallel product path).',
        creep: 'Leg implied 1.5–5 km/h without V2 band — CREEP (never upgraded to STOP).',
        unknownGap: 'ROW_ABSENT / incomplete ±1s / NO_MOTION_EVIDENCE — UNKNOWN_GAP; max 2s gap bridging not applied across absent runs.',
        moving: 'Numeric L3 ≥ 5 km/h or S1 MOVING_SPEED_ESTIMATED.',
        persistence:
          'Repeated coordinates in hold runs do not refresh stop evidence (hold-release classifier); missing rows do not extend stop claims.',
      },
      globalMetrics: {
        tripSeconds: baselineRows.length,
        videoAnnotatedTachoZeroSeconds: globalVideoStop,
        baselineV2TrustedLimitedStopSeconds: globalBaselineV2Stop,
        prototypeStopSeconds: globalProtoStop,
        missedStopVsVideoAnnotatedZero: globalMissed,
        falseStopVsVideoTachoGte4: globalFalseStop,
        falseStopVsBaselineNumericGte5: globalMovingFalseStop,
        unknownOrGapSeconds: globalUnknown,
        creepSeconds: labelCreepCount.creep,
        rowAbsentSeconds: rowAbsentLabels.length,
        numericCoverageSeparate: {
          numericL3: baselineRows.filter((r) => r.l3SpeedKmh != null).length,
          trustedNumeric: baselineRows.filter((r) => r.qcTrustLevel === 'TRUSTED' && r.l3SpeedKmh != null).length,
        },
      },
      referenceCaseEvaluations: caseEvals,
      groupBExperiment: formulateGroupBExperimentFromCreep(labelCreepCount.creep),
      chatGptVisualReturnLabels: chatGptReturn,
      boundaryCases: {
        cohort45PresentNoMotion: 'See supplement v3 — neighbor ROW_ABSENT; not re-exported here.',
        stationaryBand14s: '14× TRUSTED_LIMITED STATIONARY_SUPPORTED in baseline (unchanged).',
      },
    };

    const files: Record<string, string> = {
      'STATIONARY_OFFLINE_PROTOTYPE_EXPORT.json': JSON.stringify(prototypeArtifact, null, 2),
      'REFERENCE_CASES.json': JSON.stringify(referenceCases, null, 2),
    };

    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(outDir, name), body, 'utf8');
    }

    const md = `# EXP021 — Stillstand / Kriechen / Lücken (Offline-Prototyp)

Siehe auch [EXP021_STATIONARY_CREEP_GAP_FOCUS.md](../EXP021_STATIONARY_CREEP_GAP_FOCUS.md).

**Prototype:** \`${PROTOTYPE_VERSION}\`  
**Global:** video-annotiert Tacho 0: **${globalVideoStop}s**; Baseline V2 Stop: **${globalBaselineV2Stop}s**; Prototyp Stop: **${globalProtoStop}s**; verpasst vs Video: **${globalMissed}s**; falsch vs Tacho≥4: **${globalFalseStop}s**.
`;
    fs.writeFileSync(path.join(outDir, 'STATIONARY_OFFLINE_PROTOTYPE.md'), md, 'utf8');

    const shaLines: string[] = [];
    for (const name of [...Object.keys(files), 'STATIONARY_OFFLINE_PROTOTYPE.md'].sort()) {
      shaLines.push(`${sha256File(path.join(outDir, name))}  ${name}`);
    }
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${shaLines.join('\n')}\n`, 'utf8');

    console.log(
      JSON.stringify(
        {
          ok: true,
          outDir,
          globalMetrics: prototypeArtifact.globalMetrics,
          caseCount: caseEvals.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
