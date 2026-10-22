import type { BatteryMeasurementQuality } from '@prisma/client';
import { isBetterSessionQuality } from './hv-charge-session.quality';
import { isDimoSourcePreferredOverFallback } from './hv-fallback-charge-session.policy';
import type {
  HvChargeSessionChangeKind,
  HvChargeSessionDraft,
  HvChargeSessionMetadata,
  HvChargeSessionRow,
  HvChargeSessionSource,
} from './hv-charge-session.types';
import {
  authoritativeSessionLocationsEqual,
  mergeAuthoritativeSessionLocationMetadata,
} from '@modules/vehicle-intelligence/energy-events/erd-recharge-location-provenance/erd-recharge-session-location.policy';
import { HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH } from './hv-charge-session-quality.assessor';
import {
  isStrongerHvSessionBoundaryProvenance,
  shouldPreserveExistingBoundaryScalars,
} from './hv-charge-session-boundary-snapshot.constants';

const MEASUREMENT_PROGRESS_EPSILON = 0.001;

export interface HvChargeSessionMergeResult {
  update: Record<string, unknown> | null;
  changed: boolean;
  changeKind: HvChargeSessionChangeKind;
}

function readMetadata(metadata: unknown): HvChargeSessionMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  return metadata as HvChargeSessionMetadata;
}

function providerCompletenessScore(input: {
  endAt: Date | null;
  endSocPercent: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  deltaSocPercent: number | null;
  isOngoing: boolean;
}): number {
  let score = 0;
  if (input.endAt) score += 4;
  if (input.endSocPercent != null) score += 2;
  if (input.endEnergyKwh != null) score += 2;
  if (input.energyAddedKwh != null) score += 2;
  if (input.deltaSocPercent != null) score += 1;
  if (!input.isOngoing) score += 3;
  return score;
}

function isAddedEnergyCounterReset(
  existingKwh: number,
  incomingKwh: number,
): boolean {
  return incomingKwh < existingKwh - HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH;
}

function measurementFieldRegressed(
  existing: number | null,
  incoming: number | null,
): boolean {
  if (existing == null || incoming == null) return false;
  return incoming < existing - MEASUREMENT_PROGRESS_EPSILON;
}

function measurementFieldProgressed(
  existing: number | null,
  incoming: number | null,
): boolean {
  if (incoming == null) return false;
  if (existing == null) return true;
  return incoming > existing + MEASUREMENT_PROGRESS_EPSILON;
}

export type ProviderSnapshotCoherence = {
  coherent: boolean;
  progressive: boolean;
  hasRegression: boolean;
  hasMaterialReset: boolean;
};

/** Completed-session refresh must not mix increased and decreased end measurements. */
export function evaluateProviderSnapshotCoherence(input: {
  existing: {
    endSocPercent: number | null;
    endEnergyKwh: number | null;
    energyAddedKwh: number | null;
    deltaSocPercent: number | null;
  };
  incoming: {
    endSocPercent: number | null;
    endEnergyKwh: number | null;
    energyAddedKwh: number | null;
    deltaSocPercent: number | null;
  };
}): ProviderSnapshotCoherence {
  const { existing, incoming } = input;
  const hasMaterialReset =
    incoming.energyAddedKwh != null &&
    existing.energyAddedKwh != null &&
    isAddedEnergyCounterReset(existing.energyAddedKwh, incoming.energyAddedKwh);

  const hasRegression =
    measurementFieldRegressed(existing.endSocPercent, incoming.endSocPercent) ||
    measurementFieldRegressed(existing.endEnergyKwh, incoming.endEnergyKwh) ||
    measurementFieldRegressed(existing.energyAddedKwh, incoming.energyAddedKwh) ||
    measurementFieldRegressed(existing.deltaSocPercent, incoming.deltaSocPercent);

  if (hasMaterialReset || hasRegression) {
    return { coherent: false, progressive: false, hasRegression, hasMaterialReset };
  }

  const progressive =
    measurementFieldProgressed(existing.endSocPercent, incoming.endSocPercent) ||
    measurementFieldProgressed(existing.endEnergyKwh, incoming.endEnergyKwh) ||
    measurementFieldProgressed(existing.energyAddedKwh, incoming.energyAddedKwh) ||
    measurementFieldProgressed(existing.deltaSocPercent, incoming.deltaSocPercent);

  return { coherent: true, progressive, hasRegression: false, hasMaterialReset: false };
}

function resolveProviderChronology(input: {
  existingEndAt: Date | null;
  incomingEndAt: Date | null;
}): 'extension' | 'same_instant' | 'regressive' | 'unknown' {
  const { existingEndAt, incomingEndAt } = input;
  if (!existingEndAt || !incomingEndAt) return 'unknown';
  const deltaMs = incomingEndAt.getTime() - existingEndAt.getTime();
  if (deltaMs > 0) return 'extension';
  if (deltaMs === 0) return 'same_instant';
  return 'regressive';
}

function preferCoherentNumber(
  existing: number | null,
  incoming: number | null,
  allowReplace: boolean,
): number | null {
  if (incoming == null) return existing;
  if (existing == null) return allowReplace ? incoming : existing;
  if (!allowReplace) return existing;
  if (measurementFieldRegressed(existing, incoming)) return existing;
  return incoming;
}

function mergeMetadata(
  existing: HvChargeSessionMetadata | null,
  incoming: HvChargeSessionMetadata,
  changeKind: HvChargeSessionChangeKind,
  reconciledAt: Date,
  sources: { existingSource: HvChargeSessionSource; incomingSource: HvChargeSessionSource },
  scalarCoherence?: {
    energyAddedKwh: number | null;
    endSocPercent: number | null;
    endEnergyKwh: number | null;
    deltaSocPercent: number | null;
    existingEnergyAddedKwh: number | null;
    existingEndSocPercent: number | null;
    existingEndEnergyKwh: number | null;
    existingDeltaSocPercent: number | null;
    acceptIncomingQuality: boolean;
    boundaryProvenanceUpgrade?: boolean;
  },
): HvChargeSessionMetadata {
  const history = [...(existing?.changeHistory ?? [])];
  if (changeKind !== 'no_op') {
    history.push({ at: reconciledAt.toISOString(), kind: changeKind });
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
  }

  const locations = mergeAuthoritativeSessionLocationMetadata({
    existingMeta: existing,
    incomingMeta: incoming,
    existingSource: sources.existingSource,
    incomingSource: sources.incomingSource,
  });

  const merged: HvChargeSessionMetadata = {
    ...incoming,
    ...locations,
    reconcileVersion: (existing?.reconcileVersion ?? 0) + (changeKind === 'no_op' ? 0 : 1),
    lastReconciledAt:
      changeKind === 'no_op'
        ? (existing?.lastReconciledAt ?? incoming.lastReconciledAt)
        : reconciledAt.toISOString(),
    changeHistory: history,
  };

  if (scalarCoherence) {
    const energyUnchanged =
      scalarCoherence.energyAddedKwh === scalarCoherence.existingEnergyAddedKwh;
    const socUnchanged =
      scalarCoherence.endSocPercent === scalarCoherence.existingEndSocPercent;
    const packEnergyUnchanged =
      scalarCoherence.endEnergyKwh === scalarCoherence.existingEndEnergyKwh;
    const deltaSocUnchanged =
      scalarCoherence.deltaSocPercent === scalarCoherence.existingDeltaSocPercent;

    if (
      energyUnchanged &&
      existing?.addedEnergyProvenance != null &&
      !scalarCoherence.boundaryProvenanceUpgrade
    ) {
      merged.addedEnergyProvenance = existing.addedEnergyProvenance;
    }
    if (
      socUnchanged &&
      existing?.socProvenance != null &&
      !scalarCoherence.boundaryProvenanceUpgrade
    ) {
      merged.socProvenance = existing.socProvenance;
    }
    if (
      packEnergyUnchanged &&
      existing?.currentEnergyProvenance != null &&
      !scalarCoherence.boundaryProvenanceUpgrade
    ) {
      merged.currentEnergyProvenance = existing.currentEnergyProvenance;
    }
    if (
      !scalarCoherence.boundaryProvenanceUpgrade &&
      ((energyUnchanged && socUnchanged && packEnergyUnchanged && deltaSocUnchanged) ||
        !scalarCoherence.acceptIncomingQuality)
    ) {
      if (existing?.qualityStatus != null) {
        merged.qualityStatus = existing.qualityStatus;
        merged.qualityReasonCodes = existing.qualityReasonCodes;
      }
      if (existing?.capacityShadowEligible != null) {
        merged.capacityShadowEligible = existing.capacityShadowEligible;
      }
      if (existing?.capacityValidationEligible != null) {
        merged.capacityValidationEligible = existing.capacityValidationEligible;
      }
      if (energyUnchanged && socUnchanged && packEnergyUnchanged && deltaSocUnchanged) {
        merged.durationSeconds = existing?.durationSeconds ?? merged.durationSeconds;
        merged.durationProvenance = existing?.durationProvenance ?? merged.durationProvenance;
      }
    }
  }

  return merged;
}

function resolveProviderObservedAt(input: {
  existing: Date | null;
  incoming: Date | null;
  allowAdvance: boolean;
  endAt: Date | null;
  incomingEndAt: Date | null;
}): Date | null {
  if (!input.allowAdvance) return input.existing;
  if (!input.incoming) return input.existing;
  if (!input.existing) return input.incoming;
  if (input.incoming.getTime() < input.existing.getTime()) return input.existing;
  if (
    input.endAt &&
    input.incomingEndAt &&
    input.incomingEndAt.getTime() > input.endAt.getTime() &&
    input.incoming.getTime() < input.incomingEndAt.getTime()
  ) {
    return input.existing;
  }
  let resolved = input.incoming;
  if (input.endAt && resolved.getTime() < input.endAt.getTime()) {
    resolved = input.endAt;
  }
  return resolved;
}

/**
 * Merge provider segment into an existing HV charge session.
 * Start anchors are immutable; completed sessions accept only better provider data.
 */
export function mergeHvChargeSessionUpdate(input: {
  existing: HvChargeSessionRow;
  incoming: HvChargeSessionDraft;
  reconciledAt?: Date;
}): HvChargeSessionMergeResult {
  const reconciledAt = input.reconciledAt ?? new Date();
  const { existing, incoming } = input;

  if (
    incoming.organizationId !== existing.organizationId ||
    incoming.vehicleId !== existing.vehicleId ||
    incoming.segmentFingerprint !== existing.segmentFingerprint
  ) {
    return { update: null, changed: false, changeKind: 'no_op' };
  }

  const existingMeta = readMetadata(existing.metadata);
  const existingCompleted = !existing.isOngoing && existing.endAt != null;
  const dimoOverridesFallback = isDimoSourcePreferredOverFallback(
    existing.source,
    incoming.source,
  );

  const incomingScore = providerCompletenessScore(incoming);
  const existingScore = providerCompletenessScore({
    endAt: existing.endAt,
    endSocPercent: existing.endSocPercent,
    endEnergyKwh: existing.endEnergyKwh,
    energyAddedKwh: existing.energyAddedKwh,
    deltaSocPercent: existing.deltaSocPercent,
    isOngoing: existing.isOngoing,
  });

  const incomingQuality = incoming.quality;
  const existingQuality = existing.quality;
  const qualityImproved =
    dimoOverridesFallback || isBetterSessionQuality(incomingQuality, existingQuality);
  const completenessImproved = dimoOverridesFallback || incomingScore > existingScore;

  const chronology = resolveProviderChronology({
    existingEndAt: existing.endAt,
    incomingEndAt: incoming.endAt,
  });
  const temporalAuthorityOk = chronology !== 'regressive';

  /** DIMO mapper sets providerObservedAt = segment endAt; regressive observation clock vs ingested row is unsupported. */
  const providerObservationAuthorityOk =
    !existingCompleted ||
    incoming.providerObservedAt == null ||
    existing.providerObservedAt == null ||
    incoming.providerObservedAt.getTime() >= existing.providerObservedAt.getTime();

  const snapshot = evaluateProviderSnapshotCoherence({
    existing: {
      endSocPercent: existing.endSocPercent,
      endEnergyKwh: existing.endEnergyKwh,
      energyAddedKwh: existing.energyAddedKwh,
      deltaSocPercent: existing.deltaSocPercent,
    },
    incoming: {
      endSocPercent: incoming.endSocPercent,
      endEnergyKwh: incoming.endEnergyKwh,
      energyAddedKwh: incoming.energyAddedKwh,
      deltaSocPercent: incoming.deltaSocPercent,
    },
  });

  const nullFillOnlyProgress =
    completenessImproved &&
    snapshot.coherent &&
    !snapshot.progressive &&
    (existing.endSocPercent == null ||
      existing.endEnergyKwh == null ||
      existing.energyAddedKwh == null ||
      existing.deltaSocPercent == null);

  const completedRefreshAccepted =
    existingCompleted &&
    temporalAuthorityOk &&
    providerObservationAuthorityOk &&
    snapshot.coherent &&
    (snapshot.progressive || nullFillOnlyProgress);

  if (
    existingCompleted &&
    temporalAuthorityOk &&
    snapshot.coherent &&
    snapshot.progressive &&
    !providerObservationAuthorityOk
  ) {
    return { update: null, changed: false, changeKind: 'no_op' };
  }

  const allowEndFieldUpdates =
    !existingCompleted || completedRefreshAccepted;

  const allowEndExtension =
    !existingCompleted ||
    (temporalAuthorityOk &&
      snapshot.coherent &&
      snapshot.progressive &&
      chronology === 'extension');

  let endAt = existing.endAt;
  if (incoming.endAt) {
    if (!existing.endAt) {
      endAt = incoming.endAt;
    } else if (chronology === 'regressive') {
      endAt = existing.endAt;
    } else if (chronology === 'extension' && allowEndExtension) {
      endAt = incoming.endAt;
    } else if (chronology === 'same_instant') {
      endAt = existing.endAt;
    }
  }

  const preserveSnapshotBoundary = shouldPreserveExistingBoundaryScalars(
    existingMeta?.socProvenance,
    incoming.metadata.socProvenance,
  );
  const upgradeSnapshotBoundary = isStrongerHvSessionBoundaryProvenance(
    incoming.metadata.socProvenance,
    existingMeta?.socProvenance,
  );
  const boundaryProvenanceUpgrade =
    upgradeSnapshotBoundary &&
    incoming.metadata.boundaryEnrichmentVersion != null &&
    incoming.metadata.socProvenance != null &&
    incoming.metadata.currentEnergyProvenance != null;

  let startSocPercent = existing.startSocPercent;
  let startEnergyKwh = existing.startEnergyKwh;
  let endSocPercent = existing.endSocPercent;
  let endEnergyKwh = existing.endEnergyKwh;
  let deltaSocPercent = existing.deltaSocPercent;

  if (boundaryProvenanceUpgrade) {
    if (incoming.startSocPercent != null) startSocPercent = incoming.startSocPercent;
    if (incoming.startEnergyKwh != null) startEnergyKwh = incoming.startEnergyKwh;
    if (incoming.endSocPercent != null) endSocPercent = incoming.endSocPercent;
    if (incoming.endEnergyKwh != null) endEnergyKwh = incoming.endEnergyKwh;
    if (incoming.deltaSocPercent != null) deltaSocPercent = incoming.deltaSocPercent;
  } else {
    if (upgradeSnapshotBoundary) {
      if (incoming.startSocPercent != null) startSocPercent = incoming.startSocPercent;
      if (incoming.startEnergyKwh != null) startEnergyKwh = incoming.startEnergyKwh;
    }

    endSocPercent = preserveSnapshotBoundary
      ? existing.endSocPercent
      : preferCoherentNumber(
          existing.endSocPercent,
          incoming.endSocPercent,
          allowEndFieldUpdates,
        );
    endEnergyKwh = preserveSnapshotBoundary
      ? existing.endEnergyKwh
      : preferCoherentNumber(
          existing.endEnergyKwh,
          incoming.endEnergyKwh,
          allowEndFieldUpdates,
        );
    deltaSocPercent = preserveSnapshotBoundary
      ? existing.deltaSocPercent
      : preferCoherentNumber(
          existing.deltaSocPercent,
          incoming.deltaSocPercent,
          allowEndFieldUpdates,
        );
  }

  const energyAddedKwh = preferCoherentNumber(
    existing.energyAddedKwh,
    incoming.energyAddedKwh,
    allowEndFieldUpdates,
  );

  const isOngoing =
    existingCompleted && endAt != null
      ? false
      : incoming.isOngoing && endAt == null
        ? true
        : endAt != null
          ? false
          : incoming.isOngoing;

  const acceptIncomingQuality =
    boundaryProvenanceUpgrade ||
    (allowEndFieldUpdates && snapshot.coherent && (qualityImproved || !existingCompleted));

  const quality: BatteryMeasurementQuality | null =
    acceptIncomingQuality && incomingQuality
      ? incomingQuality
      : existing.quality ?? incoming.quality;

  const changedFields: Record<string, unknown> = {};
  const setIfChanged = (key: string, value: unknown, previous: unknown) => {
    const prevIso =
      previous instanceof Date ? previous.toISOString() : previous ?? null;
    const nextIso = value instanceof Date ? value.toISOString() : value ?? null;
    if (prevIso !== nextIso) {
      changedFields[key] = value;
    }
  };

  setIfChanged('endAt', endAt, existing.endAt);
  setIfChanged('startSocPercent', startSocPercent, existing.startSocPercent);
  setIfChanged('startEnergyKwh', startEnergyKwh, existing.startEnergyKwh);
  setIfChanged('endSocPercent', endSocPercent, existing.endSocPercent);
  setIfChanged('endEnergyKwh', endEnergyKwh, existing.endEnergyKwh);
  setIfChanged('energyAddedKwh', energyAddedKwh, existing.energyAddedKwh);
  setIfChanged('deltaSocPercent', deltaSocPercent, existing.deltaSocPercent);
  setIfChanged('isOngoing', isOngoing, existing.isOngoing);
  setIfChanged('quality', quality, existing.quality);
  setIfChanged('dimoSegmentId', incoming.dimoSegmentId, existing.dimoSegmentId);

  const providerObservedAt = resolveProviderObservedAt({
    existing: existing.providerObservedAt,
    incoming: incoming.providerObservedAt,
    allowAdvance: allowEndFieldUpdates,
    endAt,
    incomingEndAt: incoming.endAt,
  });
  setIfChanged('providerObservedAt', providerObservedAt, existing.providerObservedAt);

  const scalarCoherence = {
    energyAddedKwh,
    endSocPercent,
    endEnergyKwh,
    deltaSocPercent,
    existingEnergyAddedKwh: existing.energyAddedKwh,
    existingEndSocPercent: existing.endSocPercent,
    existingEndEnergyKwh: existing.endEnergyKwh,
    existingDeltaSocPercent: existing.deltaSocPercent,
    acceptIncomingQuality,
    boundaryProvenanceUpgrade,
  };

  const provisionalMetadata = mergeMetadata(
    existingMeta,
    incoming.metadata,
    'no_op',
    reconciledAt,
    {
      existingSource: existing.source as HvChargeSessionSource,
      incomingSource: incoming.source,
    },
    scalarCoherence,
  );

  const metadataChanged =
    provisionalMetadata.lastReconciledAt !== existingMeta?.lastReconciledAt ||
    provisionalMetadata.durationSeconds !== existingMeta?.durationSeconds ||
    provisionalMetadata.reconcileVersion !== existingMeta?.reconcileVersion ||
    provisionalMetadata.qualityStatus !== existingMeta?.qualityStatus ||
    provisionalMetadata.addedEnergyProvenance !== existingMeta?.addedEnergyProvenance ||
    provisionalMetadata.socProvenance !== existingMeta?.socProvenance ||
    provisionalMetadata.currentEnergyProvenance !== existingMeta?.currentEnergyProvenance ||
    !authoritativeSessionLocationsEqual(
      existingMeta?.startLocation,
      provisionalMetadata.startLocation,
    ) ||
    !authoritativeSessionLocationsEqual(
      existingMeta?.endLocation,
      provisionalMetadata.endLocation,
    );

  if (Object.keys(changedFields).length === 0 && !metadataChanged) {
    return { update: null, changed: false, changeKind: 'no_op' };
  }

  let changeKind: HvChargeSessionChangeKind = 'provider_refresh';
  if (existing.isOngoing && !isOngoing) {
    changeKind = 'completed';
  } else if (existing.isOngoing && isOngoing) {
    changeKind = 'ongoing_updated';
  } else if (!existingCompleted && completenessImproved) {
    changeKind = 'provider_refresh';
  }

  const finalMetadata = mergeMetadata(
    existingMeta,
    incoming.metadata,
    changeKind,
    reconciledAt,
    {
      existingSource: existing.source as HvChargeSessionSource,
      incomingSource: incoming.source,
    },
    scalarCoherence,
  );

  const shadowArtifactsInvalidated =
    changeKind === 'provider_refresh' &&
    completedRefreshAccepted &&
    snapshot.progressive;

  if (shadowArtifactsInvalidated) {
    delete finalMetadata.m2CapacitySummary;
    delete finalMetadata.m3Validation;
    delete finalMetadata.shadowEvidenceFingerprint;
  } else if (existingMeta) {
    if (existingMeta.m2CapacitySummary && !incoming.metadata.m2CapacitySummary) {
      finalMetadata.m2CapacitySummary = existingMeta.m2CapacitySummary;
    }
    if (existingMeta.m3Validation && !incoming.metadata.m3Validation) {
      finalMetadata.m3Validation = existingMeta.m3Validation;
    }
    if (
      existingMeta.shadowEvidenceFingerprint &&
      incoming.metadata.shadowEvidenceFingerprint == null
    ) {
      finalMetadata.shadowEvidenceFingerprint = existingMeta.shadowEvidenceFingerprint;
    }
  }

  return {
    changed: true,
    changeKind,
    update: {
      ...changedFields,
      metadata: finalMetadata as object,
      receivedAt: reconciledAt,
    },
  };
}
