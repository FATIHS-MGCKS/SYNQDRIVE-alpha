#!/usr/bin/env ts-node
/**
 * EXP021 supplement v3 — 45s PRESENT + NO_MOTION + null L3 cohort; 269 ROW_ABSENT audit (additive).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import { REF } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';
import { loadFullPositionSnapshotExport } from './exp021-ev-ground-truth-forensic-supplement-v2.lib';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import {
  buildContiguousGapEvents,
  buildL3SupportTriplet,
  buildRowAbsent269Audit,
  classifyAbcGroup,
  formulateGroupBExperimentHypothesis,
  isCohortPresentNoMotionNoL3,
  loadVideoComparisonByLabel,
  noNumericSpeedExplanation,
  videoTachoAttachment,
} from './exp021-ev-ground-truth-forensic-supplement-v3.lib';
import { supportWindowConditionLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { exportForensicBucket, verifyBaselineParity } from './exp021-ev-ground-truth-forensic-export.lib';

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
  const organizationId = process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId;
  const tripId = process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId;
  const workItemId = process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId;

  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });

    const perSecond = buildEvGroundTruthPerSecondReplay(ctx);
    const parity = verifyBaselineParity(perSecond);
    const cohortRows = perSecond.filter(isCohortPresentNoMotionNoL3);
    if (cohortRows.length !== 45) {
      throw new Error(`expected cohort size 45, got ${cohortRows.length}`);
    }

    const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
    const shadowMap = new Map<string, DiV0TripSpeedQualityShadowRow>();
    for (const r of ctx.shadowIntervals) {
      shadowMap.set(dateToBucketLabel(r.referenceTime), r);
    }

    const videoByLabel = loadVideoComparisonByLabel(repoRoot);
    const perSecondExports: Record<string, unknown>[] = [];
    const abcCounts = { A: 0, B: 0, C: 0 };
    const groupBSamples: Array<{
      label: string;
      support: ReturnType<typeof buildL3SupportTriplet>;
      center: ReturnType<typeof exportForensicBucket>;
    }> = [];

    for (const row of cohortRows) {
      const centerLabel = row.bucketLabelUtc;
      const shadow = shadowMap.get(centerLabel);
      const center = exportForensicBucket(centerLabel, ctx, shadow, posByLabel);
      const support = buildL3SupportTriplet(centerLabel, ctx, posByLabel, shadowMap);
      const supportCondition = shadow
        ? supportWindowConditionLabel(shadow, posByLabel, ctx.acquisitionWindow)
        : 'SHADOW_ROW_MISSING';
      const abc = classifyAbcGroup(center, supportCondition);
      abcCounts[abc.group] += 1;
      if (abc.group === 'B') {
        groupBSamples.push({ label: centerLabel, support, center });
      }

      perSecondExports.push({
        bucketLabelUtc: centerLabel,
        epistemic: 'CONFIRMED',
        source: 'pinned S4 replay + shadow intervals (Production read-only)',
        classificationGroup: abc.group,
        classificationRationale: abc.rationale,
        classificationEpistemic: abc.epistemic,
        l3SupportTriplet: support,
        centerForensics: center,
        freshnessHoldRelease: {
          centerPositionState: center.positionState,
          holdTransitionDetail: center.holdTransitionDetail,
          sourceQualityFlags: center.sourceQualityFlags,
        },
        qcProtection: {
          qcTrustLevel: center.qcTrustLevel,
          qcReasonCodes: center.qcReasonCodes,
          qcSupportCalendarComplete: center.qcSupportCalendarComplete,
          qcLegDistancesM: center.qcLegDistancesM,
          qcLegImpliedSpeedMps: center.qcLegImpliedSpeedMps,
        },
        noNumericSpeedExplanation: noNumericSpeedExplanation(center, supportCondition),
        videoTacho: videoTachoAttachment(centerLabel, videoByLabel),
      });
    }

    const gapEvents = buildContiguousGapEvents(
      cohortRows.map((r) => r.bucketLabelUtc),
      (label) => {
        const sh = shadowMap.get(label);
        return sh ? supportWindowConditionLabel(sh, posByLabel, ctx.acquisitionWindow) : 'UNKNOWN';
      },
    );

    for (const exp of perSecondExports) {
      const label = exp.bucketLabelUtc as string;
      const evt = gapEvents.find((e) => label >= e.fromUtc && label <= e.toUtc);
      exp.gapEventId = evt?.eventId ?? null;
      exp.gapEventSignature = evt?.signature ?? null;
    }

    const cohortArtifact = {
      schema: 'EXP021_PRESENT_NO_MOTION_NULL_L3_COHORT_V3',
      observedAtUtc,
      selectionCriteria: {
        positionAvailability: 'PRESENT',
        motionState: 'NO_MOTION_EVIDENCE',
        l3SpeedKmh: null,
      },
      cohortCount: cohortRows.length,
      baselineParityCheck: parity,
      abcSummary: abcCounts,
      contiguousGapEvents: gapEvents,
      perSecond: perSecondExports,
      groupBExperimentHypothesis: formulateGroupBExperimentHypothesis(groupBSamples),
    };

    const snapshotRows = await prisma.$queryRaw<
      Array<{
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        boundary_fingerprint: string;
        acquisition_window_start: Date;
        acquisition_window_end: Date;
        channel_manifest: unknown;
        payload_gzip: Buffer;
        uncompressed_bytes: number | bigint;
      }>
    >`
      SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint,
        acquisition_window_start, acquisition_window_end, channel_manifest,
        payload_gzip, uncompressed_bytes
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${organizationId} AND trip_id = ${tripId}
        AND snapshot_hash = ${ctx.pinnedSnapshotHash}
      LIMIT 1`;
    const snap = snapshotRows[0];
    if (!snap) throw new Error('pinned snapshot missing');

    const positionExport = loadFullPositionSnapshotExport(
      snap,
      ctx.pinnedSnapshotHash,
      ctx.workItem!.source_family as DiV0S4SourceFamily,
    );
    const rowAbsentLabels = positionExport.bucketsSummary
      .filter((b) => b.availability === 'ROW_ABSENT')
      .map((b) => b.bucketLabelUtc)
      .sort();
    if (rowAbsentLabels.length !== 269) {
      throw new Error(`expected 269 ROW_ABSENT buckets, got ${rowAbsentLabels.length}`);
    }
    const sumProviderOnAbsent = positionExport.bucketsSummary
      .filter((b) => b.availability === 'ROW_ABSENT')
      .reduce((s, b) => s + b.providerRowCount, 0);

    const rowAbsentArtifact = buildRowAbsent269Audit(
      rowAbsentLabels,
      positionExport.rejectedProviderRows.length,
      sumProviderOnAbsent,
    );
    (rowAbsentArtifact as Record<string, unknown>).overlapWithCohort45 = {
      cohortLabelsInsideRowAbsent: cohortRows.filter((r) => rowAbsentLabels.includes(r.bucketLabelUtc)).length,
      note: 'Cohort requires PRESENT center — must be 0 overlap.',
    };
    (rowAbsentArtifact as Record<string, unknown>).overlapWithVideoTachoZero135 = {
      count: rowAbsentLabels.filter((l) => {
        const v = videoByLabel.get(l);
        return v?.tachoKmh === 0;
      }).length,
      epistemic: 'CONFIRMED',
      source: 'comparison.json tachoKmh===0',
    };

    const summary = {
      schema: 'EXP021_SUPPLEMENT_V3_SUMMARY',
      observedAtUtc,
      cohort45_abc: abcCounts,
      rowAbsentCount: rowAbsentLabels.length,
      comparisonFetchPrepared: true,
      comparisonFetchExecuted: false,
      preDeployAndPriorSupplementsUnchanged: true,
    };

    const files: Record<string, string> = {
      'PRESENT_NO_MOTION_NULL_L3_COHORT_SUPPLEMENT_V3.json': JSON.stringify(cohortArtifact, null, 2),
      'ROW_ABSENT_269_AUDIT_SUPPLEMENT_V3.json': JSON.stringify(rowAbsentArtifact, null, 2),
      'SUMMARY_SUPPLEMENT_V3.json': JSON.stringify(summary, null, 2),
    };

    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(outDir, name), body, 'utf8');
    }

    const md = `# EXP021 supplement v3 — PRESENT / NO_MOTION / null L3 (45s)

**Observed at (UTC):** \`${observedAtUtc}\`

## Cohort ABC

| Group | Count | Meaning |
|-------|------:|---------|
| A | ${abcCounts.A} | Enthaltung wegen fehlender/kompromittierter Evidenz |
| B | ${abcCounts.B} | Verwertbare Evidenz möglicherweise ungenutzt |
| C | ${abcCounts.C} | Nicht entscheidbar mit Export |

## ROW_ABSENT 269

Separate audit in \`ROW_ABSENT_269_AUDIT_SUPPLEMENT_V3.json\`. Provider-Vergleichsabruf **vorbereitet, nicht ausgeführt**.

## Frozen artifacts

Does not modify \`pre-deploy/\`, supplement v1/v2 export directories, or baseline JSON checksums.
`;
    fs.writeFileSync(path.join(outDir, 'EXP021_EV_GROUND_TRUTH_FORENSIC_SUPPLEMENT_V3.md'), md, 'utf8');

    const shaLines: string[] = [];
    for (const name of [...Object.keys(files), 'EXP021_EV_GROUND_TRUTH_FORENSIC_SUPPLEMENT_V3.md'].sort()) {
      shaLines.push(`${sha256File(path.join(outDir, name))}  ${name}`);
    }
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${shaLines.join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({ ok: true, outDir, abcCounts, rowAbsent: rowAbsentLabels.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
