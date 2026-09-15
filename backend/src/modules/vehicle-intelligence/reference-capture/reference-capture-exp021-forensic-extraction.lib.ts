/**
 * EXP-021 — canonical forensic extraction helpers for persisted slot ledger and authority.
 */
import {
  countExp021SlotStatuses,
  type Exp021RequestSlotRecord,
} from './reference-capture-exp021-request-slots.lib';
import type { HfCalibrationPhaseSummary } from './reference-capture-hf-calibration-phase.policy';
import {
  parseExp021PhysicalAuthority,
  resolvePhysicalFirstPhaseStartedAt,
  type Exp021PhysicalAuthority,
} from './reference-capture-exp-021-physical-authority.lib';

export type Exp021ForensicSlotView = {
  slotIndex: number;
  dueAtMs: number;
  scheduledAt: string;
  issuedAtMs: number | null;
  issuedAt: string | null;
  requestCompletedAtMs: number | null;
  requestCompletedAt: string | null;
  status: Exp021RequestSlotRecord['status'];
  bucketCount: number | null;
  providerCallAttempted: boolean | null;
  providerCallSucceeded: boolean | null;
  outcomeReason: string | null;
  effectivePollIntervalMs: number | null;
  skipReason: string | null;
  /** Phase-level linkage — no causal 1:1 settlement window per slot. */
  calibrationPhaseId: string | null;
  phaseSequence: number | null;
};

export type Exp021ForensicPhaseSlotSummary = {
  calibrationPhaseId: string;
  phaseSequence: number;
  effectivePollIntervalMs: number;
  slotCount: number;
  slotSuccessCount: number;
  slotZeroResultCount: number;
  slotFailureCount: number;
  slotSkippedCount: number;
  slotAccountedCount: number;
  slots: Exp021ForensicSlotView[];
};

export type Exp021ForensicPhysicalAuthorityView = {
  canonicalT0At: string;
  physicalFirstPhaseStartedAt: string | null;
  /** Legacy field when present — same semantics as physicalFirstPhaseStartedAt. */
  physicalPhase60StartedAt: string | null;
};

export function buildForensicSlotView(
  slot: Exp021RequestSlotRecord,
  phase: Pick<HfCalibrationPhaseSummary, 'calibrationPhaseId' | 'phaseSequence' | 'effectivePollIntervalMs'>,
): Exp021ForensicSlotView {
  return {
    slotIndex: slot.slotIndex,
    dueAtMs: slot.dueAtMs,
    scheduledAt: new Date(slot.dueAtMs).toISOString(),
    issuedAtMs: slot.issuedAtMs ?? null,
    issuedAt: slot.issuedAtMs != null ? new Date(slot.issuedAtMs).toISOString() : null,
    requestCompletedAtMs: slot.requestCompletedAtMs ?? null,
    requestCompletedAt:
      slot.requestCompletedAtMs != null
        ? new Date(slot.requestCompletedAtMs).toISOString()
        : null,
    status: slot.status,
    bucketCount: slot.bucketCount ?? null,
    providerCallAttempted: slot.providerCallAttempted ?? null,
    providerCallSucceeded: slot.providerCallSucceeded ?? null,
    outcomeReason: slot.outcomeReason ?? null,
    effectivePollIntervalMs:
      slot.effectivePollIntervalMs ?? phase.effectivePollIntervalMs ?? null,
    skipReason: slot.skipReason ?? null,
    calibrationPhaseId: phase.calibrationPhaseId,
    phaseSequence: phase.phaseSequence,
  };
}

export function buildForensicPhaseSlotSummary(
  summary: HfCalibrationPhaseSummary,
): Exp021ForensicPhaseSlotSummary {
  const slots = summary.exp021RequestSlots ?? [];
  const counts =
    summary.slotSuccessCount != null
      ? {
          slotCount: summary.slotCount ?? slots.length,
          slotSuccessCount: summary.slotSuccessCount,
          slotZeroResultCount: summary.slotZeroResultCount ?? 0,
          slotFailureCount: summary.slotFailureCount ?? 0,
          slotSkippedCount: summary.slotSkippedCount ?? 0,
          slotAccountedCount: summary.slotAccountedCount ?? 0,
          slotIntendedCount: 0,
          slotIssuedCount: 0,
        }
      : countExp021SlotStatuses(slots);
  return {
    calibrationPhaseId: summary.calibrationPhaseId,
    phaseSequence: summary.phaseSequence,
    effectivePollIntervalMs: summary.effectivePollIntervalMs,
    slotCount: counts.slotCount,
    slotSuccessCount: counts.slotSuccessCount,
    slotZeroResultCount: counts.slotZeroResultCount,
    slotFailureCount: counts.slotFailureCount,
    slotSkippedCount: counts.slotSkippedCount,
    slotAccountedCount: counts.slotAccountedCount,
    slots: slots.map((slot) => buildForensicSlotView(slot, summary)),
  };
}

export function buildForensicPhysicalAuthorityView(
  preflightJson: unknown,
): Exp021ForensicPhysicalAuthorityView | null {
  const authority = parseExp021PhysicalAuthority(preflightJson);
  if (!authority) return null;
  return {
    canonicalT0At: authority.canonicalT0At,
    physicalFirstPhaseStartedAt: resolvePhysicalFirstPhaseStartedAt(authority),
    physicalPhase60StartedAt: authority.physicalPhase60StartedAt ?? null,
  };
}

/** Parse legacy Run 1 slot shapes that used scheduledAt instead of dueAtMs. */
export function parseLegacyForensicSlotRecord(
  raw: Record<string, unknown>,
): Partial<Exp021RequestSlotRecord> {
  const scheduledAt = typeof raw.scheduledAt === 'string' ? raw.scheduledAt : null;
  const dueAtMs =
    typeof raw.dueAtMs === 'number'
      ? raw.dueAtMs
      : scheduledAt
        ? Date.parse(scheduledAt)
        : undefined;
  const actualRequestAt =
    typeof raw.actualRequestAt === 'string' ? raw.actualRequestAt : null;
  const requestCompletedAt =
    typeof raw.requestCompletedAt === 'string' ? raw.requestCompletedAt : null;
  const legacyIssuedAtMs =
    typeof raw.issuedAtMs === 'number'
      ? raw.issuedAtMs
      : actualRequestAt
        ? Date.parse(actualRequestAt)
        : null;
  const legacyRequestCompletedAtMs =
    typeof raw.requestCompletedAtMs === 'number'
      ? raw.requestCompletedAtMs
      : requestCompletedAt
        ? Date.parse(requestCompletedAt)
        : null;
  return {
    slotIndex: typeof raw.slotIndex === 'number' ? raw.slotIndex : undefined,
    dueAtMs: Number.isFinite(dueAtMs) ? dueAtMs : undefined,
    issuedAtMs: Number.isFinite(legacyIssuedAtMs) ? legacyIssuedAtMs : null,
    requestCompletedAtMs: Number.isFinite(legacyRequestCompletedAtMs)
      ? legacyRequestCompletedAtMs
      : null,
    status:
      typeof raw.status === 'string'
        ? (raw.status as Exp021RequestSlotRecord['status'])
        : typeof raw.providerStatus === 'string'
          ? mapLegacyProviderStatusToSlotStatus(raw.providerStatus)
          : undefined,
    bucketCount: typeof raw.bucketCount === 'number' ? raw.bucketCount : null,
    providerCallAttempted:
      typeof raw.providerCallAttempted === 'boolean' ? raw.providerCallAttempted : null,
    providerCallSucceeded:
      typeof raw.providerCallSucceeded === 'boolean'
        ? raw.providerCallSucceeded
        : raw.providerStatus === 'SUCCESS'
          ? true
          : raw.providerStatus === 'FAILURE'
            ? false
            : null,
    outcomeReason:
      typeof raw.outcomeReason === 'string'
        ? raw.outcomeReason
        : typeof raw.providerStatus === 'string'
          ? raw.providerStatus
          : null,
    skipReason: typeof raw.skipReason === 'string' ? raw.skipReason : null,
  };
}

function mapLegacyProviderStatusToSlotStatus(
  providerStatus: string,
): Exp021RequestSlotRecord['status'] | undefined {
  if (providerStatus === 'SUCCESS') return 'SUCCESS';
  if (providerStatus === 'FAILURE') return 'FAILURE';
  if (providerStatus === 'ZERO_RESULT') return 'ZERO_RESULT';
  return undefined;
}

export function extractExp021ForensicBundle(args: {
  preflightJson: unknown;
  completedPhaseSummaries: HfCalibrationPhaseSummary[];
}): {
  physicalAuthority: Exp021ForensicPhysicalAuthorityView | null;
  phases: Exp021ForensicPhaseSlotSummary[];
} {
  return {
    physicalAuthority: buildForensicPhysicalAuthorityView(args.preflightJson),
    phases: args.completedPhaseSummaries.map((summary) =>
      buildForensicPhaseSlotSummary(summary),
    ),
  };
}

export type { Exp021PhysicalAuthority };
