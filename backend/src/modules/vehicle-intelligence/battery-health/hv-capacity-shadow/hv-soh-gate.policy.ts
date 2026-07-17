import {
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';
import { isAssessmentCompatibleCapacityType } from '../reference-capacity/vehicle-battery-reference-capacity.policy';
import {
  HV_CROSS_SESSION_CONFIDENCE,
  HV_CROSS_SESSION_GATE_REASONS,
} from './hv-capacity-cross-session.types';
import {
  HV_SOH_GATE_APPROVED_MODEL_VERSIONS,
  HV_SOH_GATE_AVAILABILITY,
  HV_SOH_GATE_FRESHNESS_MS,
  HV_SOH_GATE_GATE_REASONS,
  HV_SOH_GATE_MATURITY,
  HV_SOH_GATE_MAX_PLAUSIBLE_PERCENT,
  HV_SOH_GATE_MIN_PLAUSIBLE_PERCENT,
  HV_SOH_GATE_MIN_QUALIFIED_SESSIONS,
  HV_SOH_GATE_MODEL_VERSION,
  HV_SOH_GATE_SCORE_SEMANTICS,
  type HvSohGateAssessment,
  type HvSohGateAssessmentReason,
  type HvSohGateCrossSessionInput,
  type HvSohGateMaturity,
  type HvSohGateReasonCode,
  type HvSohGateReferenceInput,
  type HvSohGateVehicleContext,
} from './hv-soh-gate.types';

export function buildHvSohGateAssessmentIdempotencyKey(input: {
  vehicleId: string;
  modelVersion?: number;
  crossSessionIdempotencyKey: string;
  referenceCapacityId: string;
  capabilityVersion: number;
}): string {
  const version = input.modelVersion ?? HV_SOH_GATE_MODEL_VERSION;
  return [
    'hv-soh-gate',
    input.vehicleId,
    `m${version}`,
    input.crossSessionIdempotencyKey,
    input.referenceCapacityId,
    `capv${input.capabilityVersion}`,
  ].join(':');
}

function buildReasonLabels(): Record<HvSohGateReasonCode, string> {
  return {
    [HV_SOH_GATE_GATE_REASONS.NO_REFERENCE_CAPACITY]:
      'Keine Referenzkapazität — SOH nicht verfügbar',
    [HV_SOH_GATE_GATE_REASONS.REFERENCE_NOT_VERIFIED]:
      'Referenzkapazität nicht verifiziert — kein SOH-Prozentwert',
    [HV_SOH_GATE_GATE_REASONS.INCOMPATIBLE_CAPACITY_TYPE]:
      'Referenzkapazitätstyp nicht assessment-kompatibel',
    [HV_SOH_GATE_GATE_REASONS.CAPACITY_ASSESSMENT_NOT_STABLE]:
      'HV-Kapazitäts-Shadow-Assessment nicht stabil',
    [HV_SOH_GATE_GATE_REASONS.INSUFFICIENT_SESSIONS]:
      'Zu wenige qualifizierte Sessions für SOH-Gate',
    [HV_SOH_GATE_GATE_REASONS.ASSESSMENT_STALE]:
      'Kapazitäts-Assessment außerhalb des Freshness-Fensters',
    [HV_SOH_GATE_GATE_REASONS.CAPABILITY_CHANGED]:
      'Fahrzeug-Capability seit Assessment geändert',
    [HV_SOH_GATE_GATE_REASONS.METHOD_CONFLICT]:
      'Starker M2/M3-Methodenkonflikt',
    [HV_SOH_GATE_GATE_REASONS.MODEL_VERSION_NOT_APPROVED]:
      'SOH-Gate-Modellversion nicht freigegeben',
    [HV_SOH_GATE_GATE_REASONS.OUT_OF_PLAUSIBLE_BAND]:
      'SOH außerhalb plausibler Grenzen — nicht berechnet',
    [HV_SOH_GATE_GATE_REASONS.PUBLICATION_DISABLED]:
      'Kundenpublication deaktiviert — nur internes Assessment',
  };
}

function buildReasons(
  gateReasonCodes: HvSohGateReasonCode[],
  sohGatePassed: boolean,
): HvSohGateAssessmentReason[] {
  const labels = buildReasonLabels();
  const reasons: HvSohGateAssessmentReason[] = gateReasonCodes.map((code) => ({
    code,
    labelDe: labels[code],
  }));

  if (sohGatePassed) {
    reasons.push({
      code: 'SOH_GATE_COMPUTED_INTERNAL',
      labelDe: 'Internes SOH-Assessment berechnet (keine Kundenpublication)',
    });
  }

  return reasons;
}

function resolveMaturity(confidence: HvSohGateAssessment['confidence']): HvSohGateMaturity | null {
  if (confidence === HV_CROSS_SESSION_CONFIDENCE.HIGH) {
    return HV_SOH_GATE_MATURITY.SHADOW;
  }
  if (
    confidence === HV_CROSS_SESSION_CONFIDENCE.MEDIUM ||
    confidence === HV_CROSS_SESSION_CONFIDENCE.LOW
  ) {
    return HV_SOH_GATE_MATURITY.PROVISIONAL;
  }
  return null;
}

function evaluateSohGateReasons(input: {
  crossSession: HvSohGateCrossSessionInput | null;
  reference: HvSohGateReferenceInput | null;
  context: HvSohGateVehicleContext;
}): HvSohGateReasonCode[] {
  const reasonCodes: HvSohGateReasonCode[] = [];
  const now = input.context.now ?? new Date();
  const modelVersion = input.context.modelVersion ?? HV_SOH_GATE_MODEL_VERSION;

  if (
    !(HV_SOH_GATE_APPROVED_MODEL_VERSIONS as readonly number[]).includes(modelVersion)
  ) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.MODEL_VERSION_NOT_APPROVED);
  }

  if (!input.reference) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.NO_REFERENCE_CAPACITY);
    return [...new Set(reasonCodes)];
  }

  if (!isAssessmentCompatibleCapacityType(input.reference.capacityType)) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.INCOMPATIBLE_CAPACITY_TYPE);
  }

  if (input.reference.verificationStatus !== ReferenceCapacityVerificationStatus.VERIFIED) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.REFERENCE_NOT_VERIFIED);
  }

  if (!input.crossSession) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.CAPACITY_ASSESSMENT_NOT_STABLE);
    return [...new Set(reasonCodes)];
  }

  if (!input.crossSession.shadowGatePassed) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.CAPACITY_ASSESSMENT_NOT_STABLE);
  }

  if (input.crossSession.sessionCount < HV_SOH_GATE_MIN_QUALIFIED_SESSIONS) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.INSUFFICIENT_SESSIONS);
  }

  const computedAtMs = new Date(input.crossSession.computedAt).getTime();
  if (
    Number.isFinite(computedAtMs) &&
    now.getTime() - computedAtMs > HV_SOH_GATE_FRESHNESS_MS
  ) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.ASSESSMENT_STALE);
  }

  if (
    input.crossSession.capabilityVersion != null &&
    input.crossSession.capabilityVersion !== input.context.currentCapabilityVersion
  ) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.CAPABILITY_CHANGED);
  }

  const hasMethodConflict =
    input.crossSession.methodAgreement.sessionsWithM3Conflict > 0 ||
    input.crossSession.gateReasonCodes.includes(
      HV_CROSS_SESSION_GATE_REASONS.M3_METHOD_CONFLICT,
    );
  if (hasMethodConflict) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.METHOD_CONFLICT);
  }

  if (!input.context.sohPublicationEnabled) {
    reasonCodes.push(HV_SOH_GATE_GATE_REASONS.PUBLICATION_DISABLED);
  }

  return [...new Set(reasonCodes)];
}

function computeEstimatedSohPercent(input: {
  estimatedUsableCapacityKwh: number;
  verifiedReferenceCapacityKwh: number;
}): number {
  return (input.estimatedUsableCapacityKwh / input.verifiedReferenceCapacityKwh) * 100;
}

export function computeHvSohGateAssessment(input: {
  crossSession: HvSohGateCrossSessionInput | null;
  reference: HvSohGateReferenceInput | null;
  context: HvSohGateVehicleContext;
}): HvSohGateAssessment {
  const modelVersion = input.context.modelVersion ?? HV_SOH_GATE_MODEL_VERSION;
  const context: HvSohGateVehicleContext = {
    ...input.context,
    modelVersion,
  };

  const blockingReasonCodes = evaluateSohGateReasons({
    crossSession: input.crossSession,
    reference: input.reference,
    context,
  });

  const blockingWithoutPublication = blockingReasonCodes.filter(
    (code) => code !== HV_SOH_GATE_GATE_REASONS.PUBLICATION_DISABLED,
  );

  const hasNoReference = blockingReasonCodes.includes(
    HV_SOH_GATE_GATE_REASONS.NO_REFERENCE_CAPACITY,
  );
  const referenceUnverified = blockingReasonCodes.includes(
    HV_SOH_GATE_GATE_REASONS.REFERENCE_NOT_VERIFIED,
  );

  const canComputePercent =
    !hasNoReference &&
    !referenceUnverified &&
    blockingWithoutPublication.length === 0 &&
    input.crossSession?.estimatedUsableCapacityKwh != null &&
    input.reference != null;

  let estimatedSohPercent: number | null = null;
  let outOfPlausibleBand = false;

  if (canComputePercent && input.reference && input.crossSession) {
    const rawPercent = computeEstimatedSohPercent({
      estimatedUsableCapacityKwh: input.crossSession.estimatedUsableCapacityKwh!,
      verifiedReferenceCapacityKwh: input.reference.capacityKwh,
    });

    if (
      rawPercent < HV_SOH_GATE_MIN_PLAUSIBLE_PERCENT ||
      rawPercent > HV_SOH_GATE_MAX_PLAUSIBLE_PERCENT
    ) {
      outOfPlausibleBand = true;
      estimatedSohPercent = null;
    } else {
      estimatedSohPercent = rawPercent;
    }
  }

  const gateReasonCodes = [...blockingReasonCodes];
  if (outOfPlausibleBand) {
    gateReasonCodes.push(HV_SOH_GATE_GATE_REASONS.OUT_OF_PLAUSIBLE_BAND);
  }

  const sohGatePassed =
    estimatedSohPercent != null &&
    gateReasonCodes.filter((code) => code !== HV_SOH_GATE_GATE_REASONS.PUBLICATION_DISABLED)
      .length === 0;

  const confidence = input.crossSession?.confidence ?? HV_CROSS_SESSION_CONFIDENCE.INSUFFICIENT;
  const maturity = sohGatePassed ? resolveMaturity(confidence) : null;

  let sohAvailability: HvSohGateAssessment['sohAvailability'];
  if (hasNoReference) {
    sohAvailability = HV_SOH_GATE_AVAILABILITY.UNAVAILABLE;
  } else if (sohGatePassed) {
    sohAvailability = HV_SOH_GATE_AVAILABILITY.COMPUTED_INTERNAL;
  } else {
    sohAvailability = HV_SOH_GATE_AVAILABILITY.GATED;
  }

  const computedAt = (context.now ?? new Date()).toISOString();
  const crossSessionKey = input.crossSession?.idempotencyKey ?? 'none';
  const referenceId = input.reference?.id ?? 'none';
  const capabilityVersion = input.crossSession?.capabilityVersion ?? context.currentCapabilityVersion;

  const inputSummary = {
    assessmentMode: 'SHADOW',
    maturity,
    sohAvailability,
    estimatedSohPercent,
    estimatedUsableCapacityKwh: input.crossSession?.estimatedUsableCapacityKwh ?? null,
    verifiedReferenceCapacityKwh:
      input.reference?.verificationStatus === ReferenceCapacityVerificationStatus.VERIFIED
        ? input.reference.capacityKwh
        : null,
    referenceCapacityId: input.reference?.id ?? null,
    referenceVerificationStatus: input.reference?.verificationStatus ?? null,
    referenceCapacityType: input.reference?.capacityType ?? null,
    sessionCount: input.crossSession?.sessionCount ?? 0,
    crossSessionAssessmentIdempotencyKey: input.crossSession?.idempotencyKey ?? null,
    crossSessionGateReasonCodes: input.crossSession?.gateReasonCodes ?? [],
    capabilityVersion,
    currentCapabilityVersion: context.currentCapabilityVersion,
    gateReasonCodes,
    sohGatePassed,
    publicationEligible: false,
    sohPublicationEnabled: context.sohPublicationEnabled,
    confidence,
    plausibleBand: {
      minPercent: HV_SOH_GATE_MIN_PLAUSIBLE_PERCENT,
      maxPercent: HV_SOH_GATE_MAX_PLAUSIBLE_PERCENT,
    },
  };

  return {
    assessmentType: 'HV_SOH_CAPACITY_ESTIMATE',
    scoreSemantics: HV_SOH_GATE_SCORE_SEMANTICS,
    assessmentMode: 'SHADOW',
    modelVersion,
    sohAvailability,
    estimatedSohPercent,
    estimatedUsableCapacityKwh: input.crossSession?.estimatedUsableCapacityKwh ?? null,
    verifiedReferenceCapacityKwh:
      input.reference?.verificationStatus === ReferenceCapacityVerificationStatus.VERIFIED
        ? input.reference.capacityKwh
        : null,
    referenceCapacityId: input.reference?.id ?? null,
    referenceVerificationStatus: input.reference?.verificationStatus ?? null,
    referenceCapacityType: input.reference?.capacityType ?? null,
    sessionCount: input.crossSession?.sessionCount ?? 0,
    crossSessionAssessmentIdempotencyKey: input.crossSession?.idempotencyKey ?? null,
    capabilityVersion,
    maturity,
    confidence,
    sohGatePassed,
    gateReasonCodes,
    reasons: buildReasons(gateReasonCodes, sohGatePassed),
    publicationEligible: false,
    sohPublicationEnabled: context.sohPublicationEnabled,
    computedAt,
    idempotencyKey: buildHvSohGateAssessmentIdempotencyKey({
      vehicleId: context.vehicleId,
      modelVersion,
      crossSessionIdempotencyKey: crossSessionKey,
      referenceCapacityId: referenceId,
      capabilityVersion,
    }),
    inputSummary,
  };
}
