import { sessionsOverlap } from './hv-fallback-charge-session.policy';
import {
  ERD_PHYSICAL_MATCH_RESULT,
  isFallbackRowSuperseded,
  matchErdPhysicalEpisode,
} from './erd-physical-episode-matcher';
import type { HvFallbackChargeSessionCandidate } from './hv-fallback-charge-session.types';
import type { HvChargeSessionDraft, HvChargeSessionRow } from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from './hv-charge-session.types';

/**
 * E3.1 identity rule (B): once a provisional fallback episode is persisted, its
 * segmentFingerprint and startAt remain the canonical physical identity. Wider
 * replays may enrich end/completion fields only — never mint a new fingerprint
 * because an earlier observation boundary was discovered later.
 */
export const PERSISTED_FALLBACK_IDENTITY_RULE =
  'PERSISTED_START_ANCHOR_AND_FINGERPRINT_IMMUTABLE' as const;

export type ResolveFallbackPersistIdentityResult =
  | { action: 'create_new'; draft: HvChargeSessionDraft }
  | { action: 'reuse'; draft: HvChargeSessionDraft; anchorRow: HvChargeSessionRow }
  | { action: 'fail_closed'; reason: 'ambiguous_anchor' | 'no_defensible_anchor' };

function rowAsNativeExtremaSide(row: HvChargeSessionRow) {
  return {
    startAt: row.startAt,
    endAt: row.endAt,
    socMin: row.startSocPercent,
    socMax: row.endSocPercent,
    energyMin: row.startEnergyKwh,
    energyMax: row.endEnergyKwh,
    addedEnergyDelta: row.energyAddedKwh,
    ongoing: row.isOngoing,
  };
}

function candidateAsFallbackSide(candidate: HvFallbackChargeSessionCandidate) {
  return {
    startAt: candidate.startAt,
    endAt: candidate.endAt,
    startSocPercent: candidate.startSocPercent,
    endSocPercent: candidate.endSocPercent,
    startEnergyKwh: candidate.startEnergyKwh,
    endEnergyKwh: candidate.endEnergyKwh,
    energyAddedKwh: candidate.energyAddedKwh,
    isOngoing: candidate.isOngoing,
  };
}

function classifyFallbackReplayAnchors(
  candidate: HvFallbackChargeSessionCandidate,
  rows: HvChargeSessionRow[],
  vehicleId: string,
  evaluatedAt: Date,
): { sameRows: HvChargeSessionRow[]; ambiguous: boolean } {
  const sameRows: HvChargeSessionRow[] = [];
  let ambiguous = false;

  for (const row of rows) {
    if (row.source !== HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) continue;
    if (isFallbackRowSuperseded(row)) continue;
    if (row.vehicleId !== vehicleId) continue;

    const temporal = sessionsOverlap(
      row.startAt,
      row.endAt,
      candidate.startAt,
      candidate.endAt,
      evaluatedAt,
    );
    if (!temporal) continue;

    const match = matchErdPhysicalEpisode({
      vehicleId,
      fallback: candidateAsFallbackSide(candidate),
      native: rowAsNativeExtremaSide(row),
      evaluatedAt,
    });

    if (match.result === ERD_PHYSICAL_MATCH_RESULT.SAME) {
      sameRows.push(row);
    } else if (match.result === ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS) {
      ambiguous = true;
    }
  }

  return { sameRows, ambiguous };
}

export function resolveFallbackPersistIdentity(input: {
  vehicleId: string;
  candidate: HvFallbackChargeSessionCandidate;
  draft: HvChargeSessionDraft;
  existingFallbackRows: HvChargeSessionRow[];
  evaluatedAt: Date;
}): ResolveFallbackPersistIdentityResult {
  const { sameRows, ambiguous } = classifyFallbackReplayAnchors(
    input.candidate,
    input.existingFallbackRows,
    input.vehicleId,
    input.evaluatedAt,
  );

  if (ambiguous || sameRows.length > 1) {
    return { action: 'fail_closed', reason: 'ambiguous_anchor' };
  }

  if (sameRows.length === 0) {
    return { action: 'create_new', draft: input.draft };
  }

  const anchor = sameRows[0];
  return {
    action: 'reuse',
    anchorRow: anchor,
    draft: {
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
    },
  };
}

/** @deprecated Use resolveFallbackPersistIdentity under authority lock */
export function alignFallbackDraftToPersistedAnchor(input: {
  vehicleId: string;
  candidate: HvFallbackChargeSessionCandidate;
  draft: HvChargeSessionDraft;
  existingFallbackRows: HvChargeSessionRow[];
  evaluatedAt: Date;
}): HvChargeSessionDraft {
  const resolved = resolveFallbackPersistIdentity(input);
  if (resolved.action === 'fail_closed') {
    return input.draft;
  }
  return resolved.draft;
}
