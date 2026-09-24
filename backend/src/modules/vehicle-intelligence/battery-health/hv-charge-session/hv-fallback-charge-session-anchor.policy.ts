import { buildFallbackSegmentFingerprint, sessionsOverlap } from './hv-fallback-charge-session.policy';
import { isFallbackRowSuperseded } from './erd-physical-episode-matcher';
import type { HvFallbackChargeSessionCandidate } from './hv-fallback-charge-session.types';
import type { HvChargeSessionDraft, HvChargeSessionRow } from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from './hv-charge-session.types';
import { buildHvSessionJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';

/**
 * Rolling-window replay must not create a second fallback row for the same physical
 * episode. Reuse the earliest persisted start anchor (immutable forward).
 */
export function alignFallbackDraftToPersistedAnchor(input: {
  vehicleId: string;
  candidate: HvFallbackChargeSessionCandidate;
  draft: HvChargeSessionDraft;
  existingFallbackRows: HvChargeSessionRow[];
  evaluatedAt: Date;
}): HvChargeSessionDraft {
  const overlapping = input.existingFallbackRows.filter(
    (row) =>
      row.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK &&
      !isFallbackRowSuperseded(row) &&
      sessionsOverlap(
        row.startAt,
        row.endAt,
        input.candidate.startAt,
        input.candidate.endAt,
        input.evaluatedAt,
      ),
  );

  if (overlapping.length === 0) {
    return input.draft;
  }

  const anchor = overlapping.reduce((earliest, row) =>
    row.startAt.getTime() < earliest.startAt.getTime() ? row : earliest,
  );

  if (anchor.startAt.getTime() <= input.candidate.startAt.getTime()) {
    return {
      ...input.draft,
      startAt: anchor.startAt,
      startSocPercent: anchor.startSocPercent ?? input.draft.startSocPercent,
      startEnergyKwh: anchor.startEnergyKwh ?? input.draft.startEnergyKwh,
      segmentFingerprint: anchor.segmentFingerprint,
      idempotencyKey: anchor.idempotencyKey,
      metadata: {
        ...input.draft.metadata,
        providerSegmentFingerprint: anchor.segmentFingerprint,
      },
    };
  }

  const fingerprint = buildFallbackSegmentFingerprint(
    input.vehicleId,
    input.candidate.startAt,
  );
  return {
    ...input.draft,
    segmentFingerprint: fingerprint,
    idempotencyKey: buildHvSessionJobIdempotencyKey({
      vehicleId: input.vehicleId,
      segmentFingerprint: fingerprint,
    }),
    metadata: {
      ...input.draft.metadata,
      providerSegmentFingerprint: fingerprint,
    },
  };
}
