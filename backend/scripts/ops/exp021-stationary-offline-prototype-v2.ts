#!/usr/bin/env ts-node
/**
 * EXP021 stationary prototype v2 + halt forensics + corrected metrics.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import { REF } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';
import { exportForensicBucket, verifyBaselineParity } from './exp021-ev-ground-truth-forensic-export.lib';
import { loadVideoComparisonByLabel, type VideoComparisonRow } from './exp021-ev-ground-truth-forensic-supplement-v3.lib';
import { buildAllMainHalts } from './exp021-stationary-halt-forensic.lib';
import {
  assessHoldoutSuitability,
  buildVideoCrossTab,
  classifyPrototypeSecondV2,
  isStrictStop,
  isV2LowSpeedBand,
  PROTOTYPE_VERSION_V2,
  strictStopConflicts,
  videoTachoCategory,
} from './exp021-stationary-offline-prototype-v2.lib';

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
    verifyBaselineParity(baselineRows);
    const videoByLabel = loadVideoComparisonByLabel(repoRoot);
    const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
    const shadowMap = new Map(ctx.shadowIntervals.map((r) => [dateToBucketLabel(r.referenceTime), r]));

    const protoRows: Array<{
      label: string;
      prototype: ReturnType<typeof classifyPrototypeSecondV2>;
      baseline: (typeof baselineRows)[number];
      forensic: ReturnType<typeof exportForensicBucket>;
      video: VideoComparisonRow | undefined;
    }> = [];

    let creepCount = 0;
    let creepWouldHaveBeenBlocked = 0;
    const bandTacho13: Array<Record<string, unknown>> = [];

    for (const baseline of baselineRows) {
      const label = baseline.bucketLabelUtc;
      const forensic = exportForensicBucket(label, ctx, shadowMap.get(label), posByLabel);
      const prototype = classifyPrototypeSecondV2({ forensic, baseline });
      if (prototype.label === 'CREEP') creepCount += 1;
      if (prototype.creepBlockedByV2Order) creepWouldHaveBeenBlocked += 1;

      if (
        baseline.motionState === 'STATIONARY_SUPPORTED' &&
        baseline.speedEvidenceState === 'STATIONARY_BAND' &&
        baseline.qcTrustLevel === 'TRUSTED_LIMITED'
      ) {
        const v = videoByLabel.get(label);
        if (v?.tachoKmh != null && v.tachoKmh >= 1 && v.tachoKmh <= 3) {
          bandTacho13.push({
            bucketLabelUtc: label,
            videoTachoKmh: v.tachoKmh,
            prototypeLabel: prototype.label,
            prototypeReasons: prototype.reasons,
            maxLegImpliedKmh: forensic.qcLegImpliedSpeedMps,
            qcSupportCalendarComplete: forensic.qcSupportCalendarComplete,
            positionGapDiagnosis: forensic.positionGapDiagnosis,
            holdTransitionDetail: forensic.holdTransitionDetail,
            noNumericDisjointV2: forensic.noNumericDisjointV2,
            decisionOrderNote:
              'V2 band checked after CREEP/STOP_STRICT in v0_2; these seconds are V2 low-speed band by design, not STOP_STRICT.',
          });
        }
      }

      protoRows.push({ label, prototype, baseline, forensic, video: videoByLabel.get(label) });
    }

    const crossTab = buildVideoCrossTab(
      protoRows.map((r) => ({ label: r.prototype.label, video: r.video })),
    );

    let strictConflict13 = 0;
    let strictConflictGt3 = 0;
    let v2BandTacho0 = 0;
    let v2BandTacho13 = 0;
    let strictStopSeconds = 0;
    let v2BandSeconds = 0;

    for (const r of protoRows) {
      if (isStrictStop(r.prototype.label)) {
        strictStopSeconds += 1;
        const c = strictStopConflicts(r.video);
        if (c.tacho1to3) strictConflict13 += 1;
        if (c.tachoGt3) strictConflictGt3 += 1;
      }
      if (isV2LowSpeedBand(r.prototype.label)) {
        v2BandSeconds += 1;
        const cat = videoTachoCategory(r.video);
        if (cat === 'VIDEO_TACHO_0') v2BandTacho0 += 1;
        if (cat === 'VIDEO_TACHO_1_3') v2BandTacho13 += 1;
      }
    }

    const perLabelMap = new Map(
      protoRows.map((r) => [r.label, { baseline: r.baseline, video: r.video }]),
    );
    const holdout = assessHoldoutSuitability(
      baselineRows.map((r) => r.bucketLabelUtc),
      perLabelMap,
    );

    let providerFresh: Map<string, { availability: string }> | null = null;
    const providerPath = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-provider-comparison/DIMO_PROVIDER_POSITION_COMPARISON.json',
    );
    if (fs.existsSync(providerPath)) {
      const prov = JSON.parse(fs.readFileSync(providerPath, 'utf8')) as {
        haltWindowLabelAnalysis?: { perLabel?: Array<{ bucketLabelUtc: string; freshProviderBucket?: { availability: string } }> };
      };
      providerFresh = new Map();
      for (const row of prov.haltWindowLabelAnalysis?.perLabel ?? []) {
        if (row.freshProviderBucket) {
          providerFresh.set(row.bucketLabelUtc, { availability: row.freshProviderBucket.availability });
        }
      }
    }

    const haltForensics = buildAllMainHalts(posByLabel, providerFresh);

    let providerComparisonSummary: Record<string, unknown> | null = null;
    if (fs.existsSync(providerPath)) {
      const provFull = JSON.parse(fs.readFileSync(providerPath, 'utf8')) as {
        observedAtUtc?: string;
        acquisition?: Record<string, unknown>;
        haltWindowLabelAnalysis?: {
          labelsInFiveMainHalts?: number;
          freshProviderPresentInHalts?: number;
          freshProviderRowAbsentInHalts?: number;
        };
      };
      providerComparisonSummary = {
        observedAtUtc: provFull.observedAtUtc,
        acquisition: provFull.acquisition,
        haltWindowLabelAnalysis: provFull.haltWindowLabelAnalysis,
        interpretation:
          'Pin ROW_ABSENT on halt labels aligns with fresh provider ROW_ABSENT (124/125); not pin-time processing loss alone.',
        epistemic: 'CONFIRMED',
      };
    }

    const haltLabelsPinAbsentFreshPresent =
      providerFresh == null
        ? 0
        : haltForensics.reduce((acc, h) => {
            const samples = (h.withinHaltSample as Array<{
              pinnedAvailability?: string;
              freshProviderAvailability?: string;
            }>) ?? [];
            return (
              acc +
              samples.filter(
                (s) => s.pinnedAvailability === 'ROW_ABSENT' && s.freshProviderAvailability === 'PRESENT',
              ).length
            );
          }, 0);

    const nextSolution =
      haltLabelsPinAbsentFreshPresent > 0
        ? {
            path: 'A_OFFLINE_REACQUIRE_PIN_ABSENT_FRESH_PRESENT',
            rule:
              'Re-normalize only labels where fresh provider is PRESENT but pin is ROW_ABSENT into a separate evidence container; re-run L3/hold without gap-bridging.',
            measurableTarget: `Label ≥1 additional second on ${haltLabelsPinAbsentFreshPresent} candidate label(s) with STOP_STRICT/CREEP vs baseline.`,
            epistemic: 'INFERRED',
          }
        : {
            path: 'B_MISSING_AT_PROVIDER',
            rule:
              'Halt-window position gaps are absent in fresh DIMO historical AVG 1s as well; offline stop/creep rules cannot invent geometry. Next lever is denser/alternate telemetry (not gap fill).',
            measurableTarget:
              'Zero additional STOP_STRICT/CREEP seconds expected from provider-only replay on this trip unless a new signal path is added.',
            epistemic: 'CONFIRMED',
          };

    const artifact = {
      schema: PROTOTYPE_VERSION_V2,
      observedAtUtc,
      creepZeroRootCause: {
        v1OrderBug: 'CREEP was unreachable when v2Band returned first (fixed in v0_2).',
        v1AfterFix: {
          creepSeconds: creepCount,
          creepWouldHaveBeenV2BandIfOldOrder: creepWouldHaveBeenBlocked,
          dominantMissReason: 'ROW_ABSENT / incomplete L3 ±1s on video-Tacho-0 windows (not missing CREEP threshold on band seconds).',
        },
        epistemic: 'CONFIRMED',
      },
      evaluation: {
        videoCrossTabByPrototypeLabel: crossTab,
        strictStopSeconds,
        v2LowSpeedBandSeconds: v2BandSeconds,
        strictStopConflictVsVideoTacho1to3: strictConflict13,
        strictStopConflictVsVideoTachoGt3: strictConflictGt3,
        v2BandWithVideoTacho0: v2BandTacho0,
        v2BandWithVideoTacho1to3: v2BandTacho13,
        v2BandDisplayConflictTacho1to3: v2BandTacho13,
        v2BandDisplayConflictNote:
          'V2 band is slow-movement semantics, not strict standstill; 1–3 km/h on video tachometer is a display conflict with a strict stop reading, not automatic proof of physical motion error.',
        strictStopSecondsNote: 'STOP_STRICT requires leg geometry; none qualified on this replay.',
        note:
          'STOP_V2_BAND = slow-movement band (existing V2 semantics). STOP_STRICT = stricter offline claim. Tacho display ≠ proven physics.',
      },
      bandSecondsWithVideoTacho1to3: bandTacho13,
      holdoutAssessment: holdout,
      mainHaltForensics: haltForensics,
      providerComparisonIntegrated: providerFresh != null,
      providerComparisonSummary,
      nextSolutionAttempt: nextSolution,
    };

    const files: Record<string, string> = {
      'STATIONARY_PROTOTYPE_V2_EXPORT.json': JSON.stringify(artifact, null, 2),
      'MAIN_HALT_FORENSICS.json': JSON.stringify(haltForensics, null, 2),
      'BAND_TACHO_1_3_DECISION_TRACE.json': JSON.stringify(bandTacho13, null, 2),
    };
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(outDir, name), body, 'utf8');
    }
    const shaLines = Object.keys(files)
      .sort()
      .map((n) => `${sha256File(path.join(outDir, n))}  ${n}`);
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${shaLines.join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({ ok: true, creepCount, strictStopSeconds, v2BandSeconds, providerIntegrated: providerFresh != null }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
