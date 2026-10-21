import {
  PERSISTED_FALLBACK_IDENTITY_RULE,
  resolveFallbackPersistIdentity,
} from './hv-fallback-charge-session-anchor.policy';
import { mapFallbackCandidateToHvChargeSessionDraft } from './hv-fallback-charge-session.mapper';
import { HV_FALLBACK_DETECTION_TIER } from './hv-fallback-charge-session.types';
import type { HvChargeSessionRow } from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from './hv-charge-session.types';

const EVAL = new Date('2026-07-16T14:00:00.000Z');
const VEH = 'veh-anchor';

function candidate(startMs: number, endMs: number) {
  return {
    startAt: new Date(startMs),
    endAt: new Date(endMs),
    startSocPercent: 40,
    endSocPercent: 55,
    startEnergyKwh: 20,
    endEnergyKwh: 28,
    energyAddedKwh: 8,
    deltaSocPercent: 15,
    isOngoing: false,
    primaryTier: HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK,
    corroboratingTiers: [HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED],
    evidenceStrength: 'SUPPLEMENTARY' as const,
    observationCount: 8,
    endReason: 'CHARGING_OFF' as const,
    providerStale: false,
    maxChargingPowerKw: 11,
  };
}

function persistedRow(startMs: number, endMs: number): HvChargeSessionRow {
  const startAt = new Date(startMs);
  return {
    id: 'row-1',
    organizationId: 'org',
    vehicleId: VEH,
    segmentFingerprint: `poll-charge:${VEH}:${startMs}`,
    dimoSegmentId: null,
    source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
    startAt,
    endAt: new Date(endMs),
    startSocPercent: 40,
    endSocPercent: 55,
    startEnergyKwh: 20,
    endEnergyKwh: 28,
    energyAddedKwh: 8,
    deltaSocPercent: 15,
    isOngoing: false,
    quality: null,
    idempotencyKey: 'idem-1',
    providerObservedAt: new Date(endMs),
    metadata: {},
  };
}

describe('resolveFallbackPersistIdentity (E3.1)', () => {
  it('reuses persisted identity when replay discovers an earlier start (T1 < T2)', () => {
    const t2 = Date.parse('2026-07-16T08:30:00.000Z');
    const t1 = Date.parse('2026-07-16T08:00:00.000Z');
    const existing = persistedRow(t2, Date.parse('2026-07-16T10:00:00.000Z'));
    const cand = candidate(t1, Date.parse('2026-07-16T10:00:00.000Z'));
    const draft = mapFallbackCandidateToHvChargeSessionDraft({
      organizationId: 'org',
      vehicleId: VEH,
      candidate: cand,
      reconciledAt: EVAL,
    });

    const resolved = resolveFallbackPersistIdentity({
      vehicleId: VEH,
      candidate: cand,
      draft,
      existingFallbackRows: [existing],
      evaluatedAt: EVAL,
    });

    expect(resolved.action).toBe('reuse');
    if (resolved.action !== 'reuse') return;
    expect(resolved.draft.segmentFingerprint).toBe(existing.segmentFingerprint);
    expect(resolved.draft.startAt.getTime()).toBe(t2);
    expect(PERSISTED_FALLBACK_IDENTITY_RULE).toContain('IMMUTABLE');
  });

  it('reuses identity on truncated replay without moving start anchor forward', () => {
    const tStart = Date.parse('2026-07-16T08:00:00.000Z');
    const tEnd = Date.parse('2026-07-16T10:00:00.000Z');
    const existing = persistedRow(tStart, tEnd);
    const truncatedStart = Date.parse('2026-07-16T08:45:00.000Z');
    const cand = candidate(truncatedStart, tEnd);
    const draft = mapFallbackCandidateToHvChargeSessionDraft({
      organizationId: 'org',
      vehicleId: VEH,
      candidate: cand,
      reconciledAt: EVAL,
    });

    const resolved = resolveFallbackPersistIdentity({
      vehicleId: VEH,
      candidate: cand,
      draft,
      existingFallbackRows: [existing],
      evaluatedAt: EVAL,
    });

    expect(resolved.action).toBe('reuse');
    if (resolved.action !== 'reuse') return;
    expect(resolved.draft.segmentFingerprint).toBe(existing.segmentFingerprint);
    expect(resolved.draft.startAt.getTime()).toBe(tStart);
  });
});
