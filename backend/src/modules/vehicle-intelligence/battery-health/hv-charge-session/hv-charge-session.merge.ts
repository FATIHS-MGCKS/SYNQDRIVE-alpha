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

function preferNullableNumber(
  existing: number | null,
  incoming: number | null,
  allowReplace: boolean,
): number | null {
  if (incoming == null) return existing;
  if (existing == null) return incoming;
  if (!allowReplace) return existing;
  return incoming;
}

function isAddedEnergyCounterReset(
  existingKwh: number,
  incomingKwh: number,
): boolean {
  return incomingKwh < existingKwh - HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH;
}

function providerEndMeasurementsProgress(input: {
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
}): boolean {
  const { existing, incoming } = input;
  if (
    incoming.energyAddedKwh != null &&
    existing.energyAddedKwh != null &&
    isAddedEnergyCounterReset(existing.energyAddedKwh, incoming.energyAddedKwh)
  ) {
    return false;
  }

  let progressed = false;
  if (
    incoming.endSocPercent != null &&
    existing.endSocPercent != null &&
    incoming.endSocPercent > existing.endSocPercent + MEASUREMENT_PROGRESS_EPSILON
  ) {
    progressed = true;
  }
  if (
    incoming.endEnergyKwh != null &&
    existing.endEnergyKwh != null &&
    incoming.endEnergyKwh > existing.endEnergyKwh + MEASUREMENT_PROGRESS_EPSILON
  ) {
    progressed = true;
  }
  if (
    incoming.energyAddedKwh != null &&
    existing.energyAddedKwh != null &&
    incoming.energyAddedKwh > existing.energyAddedKwh + MEASUREMENT_PROGRESS_EPSILON
  ) {
    progressed = true;
  }
  if (
    incoming.deltaSocPercent != null &&
    existing.deltaSocPercent != null &&
    incoming.deltaSocPercent > existing.deltaSocPercent + MEASUREMENT_PROGRESS_EPSILON
  ) {
    progressed = true;
  }
  return progressed;
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

function mergeMetadata(
  existing: HvChargeSessionMetadata | null,
  incoming: HvChargeSessionMetadata,
  changeKind: HvChargeSessionChangeKind,
  reconciledAt: Date,
  sources: { existingSource: HvChargeSessionSource; incomingSource: HvChargeSessionSource },
  scalarCoherence?: {
    energyAddedKwh: number | null;
    endSocPercent: number | null;
    existingEnergyAddedKwh: number | null;
    existingEndSocPercent: number | null;
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
    if (energyUnchanged && existing?.addedEnergyProvenance != null) {
      merged.addedEnergyProvenance = existing.addedEnergyProvenance;
    }
    if (socUnchanged && existing?.socProvenance != null) {
      merged.socProvenance = existing.socProvenance;
    }
    if (energyUnchanged && socUnchanged && existing?.qualityStatus != null) {
      merged.qualityStatus = existing.qualityStatus;
      merged.qualityReasonCodes = existing.qualityReasonCodes;
      merged.capacityShadowEligible = existing.capacityShadowEligible;
      merged.capacityValidationEligible = existing.capacityValidationEligible;
      merged.durationSeconds = existing.durationSeconds;
      merged.durationProvenance = existing.durationProvenance;
    }
  }

  return merged;
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

  const measurementProgress =
    existingCompleted &&
    (chronology === 'extension' || chronology === 'same_instant') &&
    providerEndMeasurementsProgress({
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

  const allowEndFieldUpdates =
    !existingCompleted ||
    completenessImproved ||
    qualityImproved ||
    measurementProgress;

  let endAt = existing.endAt;
  if (incoming.endAt) {
    if (!existing.endAt) {
      endAt = incoming.endAt;
    } else if (chronology === 'regressive') {
      endAt = existing.endAt;
    } else if (chronology === 'extension' && allowEndFieldUpdates) {
      endAt = incoming.endAt;
    } else if (chronology === 'same_instant') {
      endAt = existing.endAt;
    }
  }

  const endSocPercent = preferNullableNumber(
    existing.endSocPercent,
    incoming.endSocPercent,
    allowEndFieldUpdates,
  );
  const endEnergyKwh = preferNullableNumber(
    existing.endEnergyKwh,
    incoming.endEnergyKwh,
    allowEndFieldUpdates,
  );
  const energyAddedKwh = preferNullableNumber(
    existing.energyAddedKwh,
    incoming.energyAddedKwh,
    allowEndFieldUpdates,
  );
  const deltaSocPercent = preferNullableNumber(
    existing.deltaSocPercent,
    incoming.deltaSocPercent,
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

  const quality: BatteryMeasurementQuality | null =
    qualityImproved && incomingQuality
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
  setIfChanged('endSocPercent', endSocPercent, existing.endSocPercent);
  setIfChanged('endEnergyKwh', endEnergyKwh, existing.endEnergyKwh);
  setIfChanged('energyAddedKwh', energyAddedKwh, existing.energyAddedKwh);
  setIfChanged('deltaSocPercent', deltaSocPercent, existing.deltaSocPercent);
  setIfChanged('isOngoing', isOngoing, existing.isOngoing);
  setIfChanged('quality', quality, existing.quality);
  setIfChanged('dimoSegmentId', incoming.dimoSegmentId, existing.dimoSegmentId);

  const providerObservedAt =
    allowEndFieldUpdates || !existingCompleted
      ? incoming.providerObservedAt &&
        existing.providerObservedAt &&
        incoming.providerObservedAt.getTime() < existing.providerObservedAt.getTime()
        ? existing.providerObservedAt
        : incoming.providerObservedAt
      : existing.providerObservedAt;
  setIfChanged('providerObservedAt', providerObservedAt, existing.providerObservedAt);

  const provisionalMetadata = mergeMetadata(
    existingMeta,
    incoming.metadata,
    'no_op',
    reconciledAt,
    {
      existingSource: existing.source as HvChargeSessionSource,
      incomingSource: incoming.source,
    },
    {
      energyAddedKwh,
      endSocPercent,
      existingEnergyAddedKwh: existing.energyAddedKwh,
      existingEndSocPercent: existing.endSocPercent,
    },
  );

  const metadataChanged =
    provisionalMetadata.lastReconciledAt !== existingMeta?.lastReconciledAt ||
    provisionalMetadata.durationSeconds !== existingMeta?.durationSeconds ||
    provisionalMetadata.reconcileVersion !== existingMeta?.reconcileVersion ||
    provisionalMetadata.qualityStatus !== existingMeta?.qualityStatus ||
    provisionalMetadata.addedEnergyProvenance !== existingMeta?.addedEnergyProvenance ||
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
    {
      energyAddedKwh,
      endSocPercent,
      existingEnergyAddedKwh: existing.energyAddedKwh,
      existingEndSocPercent: existing.endSocPercent,
    },
  );

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
