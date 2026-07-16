import type { BatteryMeasurementQuality } from '@prisma/client';
import { isBetterSessionQuality } from './hv-charge-session.quality';
import type {
  HvChargeSessionChangeKind,
  HvChargeSessionDraft,
  HvChargeSessionMetadata,
  HvChargeSessionRow,
} from './hv-charge-session.types';

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

function mergeMetadata(
  existing: HvChargeSessionMetadata | null,
  incoming: HvChargeSessionMetadata,
  changeKind: HvChargeSessionChangeKind,
  reconciledAt: Date,
): HvChargeSessionMetadata {
  const history = [...(existing?.changeHistory ?? [])];
  if (changeKind !== 'no_op') {
    history.push({ at: reconciledAt.toISOString(), kind: changeKind });
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
  }

  return {
    ...incoming,
    reconcileVersion: (existing?.reconcileVersion ?? 0) + (changeKind === 'no_op' ? 0 : 1),
    lastReconciledAt: reconciledAt.toISOString(),
    changeHistory: history,
  };
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
  const qualityImproved = isBetterSessionQuality(incomingQuality, existingQuality);
  const completenessImproved = incomingScore > existingScore;

  let endAt = existing.endAt;
  if (incoming.endAt) {
    if (!existing.endAt || incoming.endAt.getTime() >= existing.endAt.getTime()) {
      endAt = incoming.endAt;
    }
  }

  const allowEndFieldUpdates =
    !existingCompleted || completenessImproved || qualityImproved;

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

  const metadata = mergeMetadata(
    existingMeta,
    incoming.metadata,
    'no_op',
    reconciledAt,
  );

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
  setIfChanged('providerObservedAt', incoming.providerObservedAt, existing.providerObservedAt);

  const metadataChanged =
    metadata.lastReconciledAt !== existingMeta?.lastReconciledAt ||
    metadata.durationSeconds !== existingMeta?.durationSeconds ||
    metadata.reconcileVersion !== existingMeta?.reconcileVersion;

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

  const finalMetadata = mergeMetadata(existingMeta, incoming.metadata, changeKind, reconciledAt);

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
