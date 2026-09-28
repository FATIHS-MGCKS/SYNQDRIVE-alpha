import type { PrismaClient } from '@prisma/client';
import {
  F45R1_COHORT_START_ISO,
  F4_6_T0_ISO,
  F_D3_T0_ISO,
  F_C3_T0_ISO,
  ACCEPTED_BATTERY_RUNTIME_SHA,
  M3_3F_F5_NATURAL_CALIBRATION_REPORT_CONTRACT_VERSION,
  F5_PRIMARY_COHORT_V1,
} from './f5-natural-calibration-report.constants';
import {
  computeF5CalibrationMaturityBlocks,
  computeF5NaturalEvidenceMaturity,
} from './f5-calibration-maturity';
import { computeNumericStats } from './f5-descriptive-statistics';
import { computeDefaultEligibleObservationPercent } from './f5-d4-metrics';
import type {
  F5ReportBuildOptions,
  M3_3F_F5_NaturalCalibrationReportV1,
} from './f5-natural-calibration-report.types';
import { F5ReportBoundExceededError, F5ReportTimeoutError } from './f5-natural-calibration-report.types';
import { LongitudinalIntegrityInspectionService } from '../longitudinal-integrity-inspection.service';
import { buildLongitudinalAssessmentInputV1 } from '../longitudinal-assessment-input.adapter';
import { evaluateM3_3E_LongitudinalHealthEvaluationV1 } from '../longitudinal-health-evaluation.policy';
import { M3_3E_CALIBRATION_UNSET_V1 } from '../longitudinal-health-calibration-profile';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from '../longitudinal-profile.constants';

export type F5RevisionCohort = 'F45R' | 'F45R1' | 'F46_SUSTAINED' | 'PRE_D3';

const F_C3_T0 = Date.parse(F_C3_T0_ISO);
const F_D3_T0 = Date.parse(F_D3_T0_ISO);
const F4_6_T0 = Date.parse(F4_6_T0_ISO);
const F45R1_START = Date.parse(F45R1_COHORT_START_ISO);

export function classifyRevisionCohort(materializedAt: Date): F5RevisionCohort {
  const t = materializedAt.getTime();
  if (t < F_D3_T0) return 'PRE_D3';
  if (t >= F4_6_T0) return 'F46_SUSTAINED';
  if (t >= F45R1_START) return 'F45R1';
  return 'F45R';
}

export function isPrimaryCohortRevision(
  cohort: F5RevisionCohort,
  materializedAt: Date,
  asOf: Date,
): boolean {
  if (materializedAt.getTime() > asOf.getTime()) return false;
  return cohort === 'F46_SUSTAINED';
}

type ReadOnlyTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function assertTransactionReadOnly(tx: ReadOnlyTx): Promise<void> {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const rows = await tx.$queryRaw<{ setting: string }[]>`
    SHOW transaction_read_only
  `;
  const value = rows[0]?.setting?.toLowerCase();
  if (value !== 'on') {
    throw new Error(`F5 read-only guard failed: transaction_read_only=${value ?? 'unknown'}`);
  }
}

export async function runF5NaturalCalibrationReport(
  prisma: PrismaClient,
  options: F5ReportBuildOptions,
): Promise<M3_3F_F5_NaturalCalibrationReportV1> {
  const started = Date.now();
  const deadline = started + options.timeoutMs;

  const assertDeadline = () => {
    if (Date.now() > deadline) {
      throw new F5ReportTimeoutError('F5 report timeout exceeded');
    }
  };

  return prisma.$transaction(
    async (tx) => {
      await assertTransactionReadOnly(tx as ReadOnlyTx);

      const fC3Date = new Date(F_C3_T0);
      const fD3Date = new Date(F_D3_T0);
      const f46Date = new Date(F4_6_T0);

      assertDeadline();

      const d3Total = await tx.batteryLongitudinalProfileRevision.count({
        where: { materializedAt: { lte: options.asOf } },
      });
      if (d3Total > options.maxRevisions) {
        throw new F5ReportBoundExceededError(
          `D3 revision count ${d3Total} exceeds maxRevisions=${options.maxRevisions}`,
        );
      }

      const revisions = await tx.batteryLongitudinalProfileRevision.findMany({
        where: { materializedAt: { lte: options.asOf } },
        orderBy: { materializedAt: 'asc' },
      });

      const c3Total = await tx.batteryRestSessionFeature.count({
        where: { createdAt: { lte: options.asOf } },
      });
      const c3PostFc3 = await tx.batteryRestSessionFeature.count({
        where: { createdAt: { gte: fC3Date, lte: options.asOf } },
      });
      const ackTotal = await tx.batteryLongitudinalSourceEvidenceAck.count();
      const d3PostFd3 = revisions.filter((r) => r.materializedAt >= fD3Date).length;
      const d3PostF46 = revisions.filter((r) => r.materializedAt >= f46Date).length;

      const partialRows = await tx.$queryRaw<{ c: bigint }[]>`
        SELECT count(*)::bigint AS c FROM battery_longitudinal_profile_revisions r
        LEFT JOIN battery_longitudinal_source_evidence_acks a ON a.revision_id = r.id
        WHERE a.id IS NULL AND r.materialized_at <= ${options.asOf}
      `;
      const crossRows = await tx.$queryRaw<{ c: bigint }[]>`
        SELECT count(*)::bigint AS c FROM battery_longitudinal_profile_revisions r
        JOIN battery_longitudinal_source_evidence_acks a ON a.revision_id = r.id
        WHERE (r.organization_id <> a.organization_id OR r.vehicle_id <> a.vehicle_id)
          AND r.materialized_at <= ${options.asOf}
      `;

      const vehicleSet = new Set(revisions.map((r) => r.vehicleId));
      const orgSet = new Set(revisions.map((r) => r.organizationId));
      const firstD3 = revisions[0]?.materializedAt ?? null;
      const lastD3 = revisions[revisions.length - 1]?.materializedAt ?? null;
      const evidenceSpanHours =
        firstD3 && lastD3
          ? (lastD3.getTime() - firstD3.getTime()) / 3_600_000
          : null;

      let f45r = 0;
      let f45r1 = 0;
      let f46 = 0;
      for (const r of revisions) {
        const c = classifyRevisionCohort(r.materializedAt);
        if (c === 'F45R') f45r += 1;
        if (c === 'F45R1') f45r1 += 1;
        if (c === 'F46_SUSTAINED') f46 += 1;
      }

      const primaryRevisions = revisions.filter((r) =>
        isPrimaryCohortRevision(classifyRevisionCohort(r.materializedAt), r.materializedAt, options.asOf),
      );

      const inspector = new LongitudinalIntegrityInspectionService(tx as never);

      let eligibleObservationCount = 0;
      let quarantinedCount = 0;
      let sourceEvidenceLimitedCount = 0;
      let provisionalSessionCount = 0;
      let excludedSessionCount = 0;
      let selfIntegrityFailedCount = 0;
      let defaultObservationTotal = 0;

      const obsCounts: number[] = [];
      const spanHoursList: number[] = [];
      const maxRestAgeValues: Array<number | null> = [];
      let tempKnown = 0;
      let tempMissing = 0;
      let chargeKnown = 0;
      let chargeUnknown = 0;
      const revisionsPerVehicle = new Map<string, number>();

      for (const rev of primaryRevisions) {
        assertDeadline();
        revisionsPerVehicle.set(
          rev.vehicleId,
          (revisionsPerVehicle.get(rev.vehicleId) ?? 0) + 1,
        );

        const d4 = await inspector.inspectRevision({
          revisionId: rev.id,
          organizationId: rev.organizationId,
          vehicleId: rev.vehicleId,
        });

        if (d4.status === 'REVISION_SELF_INTEGRITY_FAILED') {
          selfIntegrityFailedCount += 1;
          continue;
        }
        if (d4.status !== 'OK') continue;

        const profile = d4.inspection.profile;
        defaultObservationTotal += profile.defaultObservationCount;
        eligibleObservationCount += profile.integrityQualifiedDefaultCount;
        quarantinedCount += profile.quarantinedIntegrityWarningDefaultCount;
        sourceEvidenceLimitedCount += profile.sourceEvidenceLimitedDefaultCount;
        selfIntegrityFailedCount += profile.notEligibleRevisionSelfIntegrityFailedDefaultCount;

        for (const s of d4.inspection.perSession) {
          if (s.profileSlice === 'PROVISIONAL') provisionalSessionCount += 1;
          if (s.profileSlice === 'EXCLUDED') excludedSessionCount += 1;
        }

        const e1 = buildLongitudinalAssessmentInputV1({
          scientificProfile: rev.scientificProfileJson,
          revisionIdentity: {
            organizationId: rev.organizationId,
            vehicleId: rev.vehicleId,
            revisionId: rev.id,
            canonicalProfileFingerprint: rev.canonicalProfileFingerprint,
            longitudinalProfileContractVersion: REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
            profilePolicyVersion: REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
          },
          d4Outcome: d4,
        });

        if (e1.status !== 'OK') continue;

        evaluateM3_3E_LongitudinalHealthEvaluationV1({
          input: e1.input,
          calibrationProfileId: M3_3E_CALIBRATION_UNSET_V1,
        });

        obsCounts.push(e1.input.assessmentGradeObservations.length);
        const spanMs = e1.input.evidenceWindow.eligibleEvidenceSpanMs;
        if (spanMs !== null) spanHoursList.push(spanMs / 3_600_000);

        for (const o of e1.input.assessmentGradeObservations) {
          maxRestAgeValues.push(o.features.maxActualRestAgeMs ?? null);
          if (o.temperatureSource === 'TRIP_EXTERIOR' && o.temperatureC != null) tempKnown += 1;
          else tempMissing += 1;
          const cc = o.chargeOpportunityClass ?? 'UNKNOWN';
          if (cc === 'UNKNOWN') chargeUnknown += 1;
          else chargeKnown += 1;
        }
      }

      const eligibleObservationPercent = computeDefaultEligibleObservationPercent(
        eligibleObservationCount,
        defaultObservationTotal,
      );

      const f46Revs = primaryRevisions;
      const f46Span =
        f46Revs.length >= 2
          ? (f46Revs[f46Revs.length - 1]!.materializedAt.getTime() -
              f46Revs[0]!.materializedAt.getTime()) /
            3_600_000
          : null;

      const maxRevisionsPerVehicle = Math.max(0, ...revisionsPerVehicle.values());
      const maxRestStats = computeNumericStats(maxRestAgeValues);
      const repeatabilityPairCount = [...revisionsPerVehicle.values()].filter((n) => n >= 2).length;

      const chargeTotal = chargeKnown + chargeUnknown;
      const maturityInput = {
        primaryRevisionCount: f46Revs.length,
        primaryUniqueVehicles: new Set(f46Revs.map((r) => r.vehicleId)).size,
        primaryUniqueOrgs: new Set(f46Revs.map((r) => r.organizationId)).size,
        maxRevisionsPerVehicle,
        eligibleObservationCount,
        assessmentGradeObservationCount: obsCounts.reduce((a, b) => a + b, 0),
        chargeClassKnownPercent: chargeTotal ? (100 * chargeKnown) / chargeTotal : null,
        temperatureCoveragePercent:
          tempKnown + tempMissing ? (100 * tempKnown) / (tempKnown + tempMissing) : null,
        maxRestAgeNullShare:
          maxRestAgeValues.length > 0 ? maxRestStats.nullCount / maxRestAgeValues.length : 1,
        repeatabilityPairCount,
      };

      const calibration = computeF5CalibrationMaturityBlocks(maturityInput);
      const naturalEvidence = computeF5NaturalEvidenceMaturity(maturityInput);

      const runtime = options.runtimeAuthority ?? {};

      return {
        meta: {
          reportContractVersion: M3_3F_F5_NATURAL_CALIBRATION_REPORT_CONTRACT_VERSION,
          generatedAt: options.generatedAt,
          asOf: options.asOf.toISOString(),
          cohort: options.cohort,
          readOnly: true,
        },
        runtimeAuthority: {
          acceptedBatteryRuntimeSha: ACCEPTED_BATTERY_RUNTIME_SHA,
          observedProcessShaA: runtime.observedProcessShaA ?? null,
          observedProcessShaB: runtime.observedProcessShaB ?? null,
          d3EffectiveA: runtime.d3EffectiveA ?? null,
          d3EffectiveB: runtime.d3EffectiveB ?? null,
        },
        inventory: {
          c3RowsTotal: c3Total,
          d3RevisionRowsTotal: d3Total,
          ackRowsTotal: ackTotal,
          d3RevisionsPostFD3T0: d3PostFd3,
          d3RevisionsPostF46T0: d3PostF46,
          uniqueVehiclesWithD3: vehicleSet.size,
          evidenceSpanHours,
        },
        provenance: {
          f45rRevisionCount: f45r,
          f45r1RevisionCount: f45r1,
          f46SustainedRevisionCount: f46,
        },
        d4: {
          eligibleObservationCount,
          quarantinedCount,
          sourceEvidenceLimitedCount,
          provisionalSessionCount,
          excludedSessionCount,
          selfIntegrityFailedCount,
          eligibleObservationPercent,
        },
        primaryCohort: {
          revisionCount: f46Revs.length,
          uniqueVehicleCount: new Set(f46Revs.map((r) => r.vehicleId)).size,
          uniqueOrgCount: new Set(f46Revs.map((r) => r.organizationId)).size,
          evidenceSpanHours: f46Span,
        },
        calibration,
        naturalEvidence,
        groundTruth: {
          linkageAvailable: false,
          replacementLabelsAvailable: false,
          nat008Owner: 'M3.3G',
          nat009Owner: 'M3.3G',
        },
        safety: {
          crossTenantMismatchCount: Number(crossRows[0]?.c ?? 0),
          partialRevisionWithoutAckCount: Number(partialRows[0]?.c ?? 0),
          e3RuntimeCalls: 0,
          e3PersistenceWrites: 0,
          customerEffect: false,
        },
      };
    },
    { timeout: options.timeoutMs + 5_000 },
  );
}
