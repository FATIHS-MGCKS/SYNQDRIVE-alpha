import { BatteryMeasurementQuality, BatteryMeasurementType } from '@prisma/client';
import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import { BatteryChemistry, BatteryDriveProfile } from '../battery-v2-domain';
import {
  computeLvEstimatedHealthAssessment,
  type LvEstimatedHealthAssessment,
} from '../lv-assessment/lv-estimated-health-assessment.policy';
import type { LvAssessmentEvidenceCandidate } from '../lv-assessment/lv-evidence-selection.policy';
import {
  evaluateLvPublicationPolicy,
  type LvPublicationDecision,
} from '../lv-assessment/lv-publication.policy';
import { BatteryPublicationService } from '../battery-publication.service';
import {
  isCanonicalRestAssessmentHandoffEligible,
  isRestAssessmentHandoffReconciliationTerminalCandidate,
  restTargetTypeForMeasurementType,
} from './lv-rest-assessment-handoff.policy';

export type Pkg01IdentitySafetyCategory =
  | 'SAFE_TERMINAL'
  | 'SAFE_REPAIR_NO_PUBLICATION'
  | 'SAFE_REPAIR_PUBLICATION_ELIGIBLE'
  | 'UNSAFE_PRE_T0_PUBLICATION_POSSIBLE'
  | 'UNRESOLVED';

export interface Pkg01EnqueuedIdentityRecord {
  measurementId: string;
  vehicleId: string;
  organizationId: string;
  sessionId: string;
  type: BatteryMeasurementType;
  quality: BatteryMeasurementQuality;
  observedAt: string;
  sourceObservationId: string;
  handoffStatus: string;
  enqueuedAt: string;
  lastAttemptAt: string;
}

export interface Pkg01VehicleMeasurementSnapshot {
  vehicleId: string;
  organizationId: string;
  measurements: Array<{
    id: string;
    type: BatteryMeasurementType;
    quality: BatteryMeasurementQuality;
    observedAt: string;
    numericValue: number | null;
    sessionId: string | null;
    provenance: Record<string, unknown> | null;
    context: Record<string, unknown> | null;
    idempotencyKey: string;
    providerTimestamp: string | null;
    receivedAt: string | null;
  }>;
}

export interface Pkg01ReactivationSimulationResult {
  wouldRepairCount: number;
  wouldTerminalizeCount: number;
  wouldAssessCount: number;
  wouldCreatePublicationHandoffCount: number;
  wouldCreateCustomerPublicationCount: number;
  wouldSkipCount: number;
  unresolvedCount: number;
  perIdentity: Array<{
    measurementId: string;
    category: Pkg01IdentitySafetyCategory;
    expectedTerminalOutcome: string;
  }>;
  customerPublicationCandidates: Array<{
    measurementId: string;
    vehicleId: string;
    decision: LvPublicationDecision;
    assessment: LvEstimatedHealthAssessment;
  }>;
}

function iceGasolinePolicy() {
  return resolveBatteryPolicy({
    driveProfile: BatteryDriveProfile.ICE,
    chemistry: BatteryChemistry.AGM,
    lvSignalPresent: true,
  });
}

function toCandidate(
  row: Pkg01VehicleMeasurementSnapshot['measurements'][number],
): LvAssessmentEvidenceCandidate {
  return {
    measurementId: row.id,
    type: row.type,
    quality: row.quality,
    observedAt: row.observedAt,
    sessionId: row.sessionId,
    sessionType: null,
    numericValue: row.numericValue,
    context: row.context,
    provenance: row.provenance
      ? {
          providerTimestamp: row.provenance.providerTimestamp as string | undefined,
          receivedAt: row.provenance.receivedAt as string | undefined,
          sourceType: row.provenance.sourceType as string | undefined,
          measurementKind: row.provenance.measurementKind as string | undefined,
          tripId: row.provenance.tripId as string | undefined,
          restWindowId: row.provenance.restWindowId as string | undefined,
        }
      : {
          providerTimestamp: row.providerTimestamp,
          receivedAt: row.receivedAt,
        },
    cycleKey: null,
  };
}

function simulateVehicleAssessAndPublication(input: {
  vehicle: Pkg01VehicleMeasurementSnapshot;
  now: Date;
  publicationEnabled: boolean;
}): {
  assessment: LvEstimatedHealthAssessment | null;
  publicationDecision: LvPublicationDecision | null;
} {
  const policy = iceGasolinePolicy();
  const computed = computeLvEstimatedHealthAssessment({
    vehicleId: input.vehicle.vehicleId,
    policy,
    candidates: input.vehicle.measurements.map(toCandidate),
    assessmentMode: 'CANONICAL',
    now: input.now,
  });

  if (!computed.ok || computed.assessments.length === 0) {
    return { assessment: null, publicationDecision: null };
  }

  const assessment =
    computed.assessments.find((row) => row.assessmentTrack === 'TELEMETRY') ??
    computed.assessments[0];

  const evidenceBuilder = new BatteryPublicationService(
    { resolveForVehicle: async () => policy } as never,
    {} as never,
  );
  const evidence = evidenceBuilder.buildEvidenceSummaryFromAssessment(
    assessment,
    input.now,
  );

  const publicationDecision = evaluateLvPublicationPolicy({
    publicationEnabled: input.publicationEnabled,
    policy,
    assessment,
    evidence,
    previous: null,
    now: input.now,
  });

  return { assessment, publicationDecision };
}

export function classifyPkg01EnqueuedIdentity(input: {
  identity: Pkg01EnqueuedIdentityRecord;
  vehicleSnapshot: Pkg01VehicleMeasurementSnapshot;
  now?: Date;
  publicationEnabled?: boolean;
}): {
  category: Pkg01IdentitySafetyCategory;
  expectedTerminalOutcome: string;
  wouldRepair: boolean;
  wouldTerminalize: boolean;
  wouldAssess: boolean;
  wouldCreateCustomerPublication: boolean;
} {
  const now = input.now ?? new Date();
  const publicationEnabled = input.publicationEnabled ?? true;
  const measurement = {
    type: input.identity.type,
    quality: input.identity.quality,
    provenance: { sourceObservationId: input.identity.sourceObservationId },
  };

  const handoffEligible = isCanonicalRestAssessmentHandoffEligible(measurement);
  const terminalCandidate =
    isRestAssessmentHandoffReconciliationTerminalCandidate(measurement);

  if (terminalCandidate) {
    return {
      category: 'SAFE_TERMINAL',
      expectedTerminalOutcome: 'EXECUTED/POLICY_SKIPPED via reconciliation terminalization',
      wouldRepair: false,
      wouldTerminalize: true,
      wouldAssess: false,
      wouldCreateCustomerPublication: false,
    };
  }

  if (!handoffEligible) {
    return {
      category: 'UNRESOLVED',
      expectedTerminalOutcome: 'ineligible_without_terminal_candidate',
      wouldRepair: false,
      wouldTerminalize: false,
      wouldAssess: false,
      wouldCreateCustomerPublication: false,
    };
  }

  const vehicleOutcome = simulateVehicleAssessAndPublication({
    vehicle: input.vehicleSnapshot,
    now,
    publicationEnabled,
  });

  const wouldCreateCustomerPublication =
    vehicleOutcome.publicationDecision?.shouldPersistPublication === true &&
    vehicleOutcome.publicationDecision.userFacingPublished === true;

  if (wouldCreateCustomerPublication) {
    return {
      category: 'UNSAFE_PRE_T0_PUBLICATION_POSSIBLE',
      expectedTerminalOutcome: 'assess_enqueue_then_customer_publication',
      wouldRepair: true,
      wouldTerminalize: false,
      wouldAssess: true,
      wouldCreateCustomerPublication: true,
    };
  }

  if (vehicleOutcome.assessment?.publicationEligible) {
    return {
      category: 'SAFE_REPAIR_PUBLICATION_ELIGIBLE',
      expectedTerminalOutcome: 'assess_persist_publication_policy_blocked',
      wouldRepair: true,
      wouldTerminalize: false,
      wouldAssess: true,
      wouldCreateCustomerPublication: false,
    };
  }

  return {
    category: 'SAFE_REPAIR_NO_PUBLICATION',
    expectedTerminalOutcome: vehicleOutcome.assessment
      ? 'assess_persist_no_customer_publication'
      : 'assess_skip_or_policy_skipped',
    wouldRepair: true,
    wouldTerminalize: false,
    wouldAssess: Boolean(vehicleOutcome.assessment),
    wouldCreateCustomerPublication: false,
  };
}

export function simulatePkg01Reactivation(input: {
  identities: Pkg01EnqueuedIdentityRecord[];
  vehicleSnapshots: Pkg01VehicleMeasurementSnapshot[];
  now?: Date;
  publicationEnabled?: boolean;
}): Pkg01ReactivationSimulationResult {
  const now = input.now ?? new Date();
  const publicationEnabled = input.publicationEnabled ?? true;
  const snapshotByVehicle = new Map(
    input.vehicleSnapshots.map((row) => [row.vehicleId, row]),
  );

  const perIdentity = input.identities.map((identity) => {
    const vehicleSnapshot = snapshotByVehicle.get(identity.vehicleId);
    if (!vehicleSnapshot) {
      return {
        measurementId: identity.measurementId,
        category: 'UNRESOLVED' as const,
        expectedTerminalOutcome: 'missing_vehicle_snapshot',
        wouldRepair: false,
        wouldTerminalize: false,
        wouldAssess: false,
        wouldCreateCustomerPublication: false,
      };
    }

    const classified = classifyPkg01EnqueuedIdentity({
      identity,
      vehicleSnapshot,
      now,
      publicationEnabled,
    });

    return {
      measurementId: identity.measurementId,
      ...classified,
    };
  });

  const wouldRepairIds = new Set(
    perIdentity.filter((row) => row.wouldRepair).map((row) => row.measurementId),
  );
  const wouldTerminalizeIds = new Set(
    perIdentity.filter((row) => row.wouldTerminalize).map((row) => row.measurementId),
  );
  const wouldAssessVehicles = new Set(
    perIdentity
      .filter((row) => row.wouldAssess)
      .map((row) => input.identities.find((i) => i.measurementId === row.measurementId)?.vehicleId)
      .filter((id): id is string => Boolean(id)),
  );

  const customerPublicationCandidates = perIdentity
    .filter((row) => row.wouldCreateCustomerPublication)
    .map((row) => {
      const identity = input.identities.find((i) => i.measurementId === row.measurementId)!;
      const vehicleSnapshot = snapshotByVehicle.get(identity.vehicleId)!;
      const simulated = simulateVehicleAssessAndPublication({
        vehicle: vehicleSnapshot,
        now,
        publicationEnabled,
      });
      return {
        measurementId: row.measurementId,
        vehicleId: identity.vehicleId,
        decision: simulated.publicationDecision!,
        assessment: simulated.assessment!,
      };
    });

  return {
    wouldRepairCount: wouldRepairIds.size,
    wouldTerminalizeCount: wouldTerminalizeIds.size,
    wouldAssessCount: wouldAssessVehicles.size,
    wouldCreatePublicationHandoffCount: wouldAssessVehicles.size,
    wouldCreateCustomerPublicationCount: customerPublicationCandidates.length,
    wouldSkipCount: perIdentity.filter((row) => row.category === 'SAFE_TERMINAL').length,
    unresolvedCount: perIdentity.filter((row) => row.category === 'UNRESOLVED').length,
    perIdentity: perIdentity.map((row) => ({
      measurementId: row.measurementId,
      category: row.category,
      expectedTerminalOutcome: row.expectedTerminalOutcome,
    })),
    customerPublicationCandidates,
  };
}

export function restTargetTypeForPkg01Identity(
  type: BatteryMeasurementType,
): string | null {
  return restTargetTypeForMeasurementType(type);
}
