import { normalizeDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import {
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures';
import {
  applyHvChargeSessionBoundaryEvidenceToDraft,
  mapRechargeSegmentToHvChargeSessionDraft,
} from './hv-charge-session.mapper';
import { assessHvChargeSessionQualityFromDimoSegment } from './hv-charge-session-quality.assessor';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from './hv-charge-session-quality.status';
import { HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE } from './hv-charge-session-boundary-snapshot.constants';
import {
  resolveHvChargeSessionBoundaryFromSnapshots,
  type HvChargeSessionBoundarySnapshotRow,
} from './hv-charge-session-boundary-snapshot.policy';
import { assessHvChargeSessionQualityFromInput } from './hv-charge-session-quality.assessor';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from './hv-charge-session.types';

function segmentFour() {
  const raw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2.data.segments[0];
  return normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, raw)!;
}

function row(partial: Partial<HvChargeSessionBoundarySnapshotRow> & Pick<HvChargeSessionBoundarySnapshotRow, 'recordedAt'>): HvChargeSessionBoundarySnapshotRow {
  return {
    providerReceivedAt: partial.recordedAt,
    socPercent: partial.socPercent ?? 50,
    energyUsedKwh: partial.energyUsedKwh ?? 25,
    energyObservedAt: partial.energyObservedAt ?? partial.recordedAt,
    isCharging: partial.isCharging ?? true,
    chargingCableConnected: partial.chargingCableConnected ?? true,
    idempotencyKey: partial.idempotencyKey ?? `snap-${partial.recordedAt.toISOString()}`,
    ...partial,
  };
}

describe('resolveHvChargeSessionBoundaryFromSnapshots', () => {
  const sessionStartAt = new Date('2026-06-21T19:00:08.000Z');
  const sessionEndAt = new Date('2026-06-22T05:36:49.000Z');
  const assessedAt = new Date('2026-06-22T06:00:00.000Z');

  it('1. clean boundary snapshots → full resolution with temporal provenance', () => {
    const snapshots = [
      row({
        recordedAt: new Date('2026-06-21T19:01:00.000Z'),
        socPercent: 35,
        energyUsedKwh: 19.5,
        idempotencyKey: 'a',
      }),
      row({
        recordedAt: new Date('2026-06-22T05:35:00.000Z'),
        socPercent: 62.4,
        energyUsedKwh: 34,
        idempotencyKey: 'b',
      }),
    ];

    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots,
      sessionStartAt,
      sessionEndAt,
      isOngoing: false,
      assessedAt,
    });

    expect(resolution.kind).toBe('full');
    if (resolution.kind === 'full') {
      expect(resolution.evidence.provenance).toBe(HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE);
      expect(resolution.evidence.deltaSocPercent).toBeCloseTo(27.4, 1);
    }
  });

  it('2. missing boundary snapshots → none', () => {
    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots: [],
      sessionStartAt,
      sessionEndAt,
      isOngoing: false,
      assessedAt,
    });
    expect(resolution).toEqual({ kind: 'none', reason: 'insufficient_snapshots' });
  });

  it('3. stale observation timestamps → no upgrade', () => {
    const staleAssessedAt = new Date('2026-08-01T00:00:00.000Z');
    const snapshots = [
      row({
        recordedAt: new Date('2026-06-21T19:01:00.000Z'),
        socPercent: 35,
        energyUsedKwh: 19.5,
      }),
      row({
        recordedAt: new Date('2026-06-22T05:35:00.000Z'),
        socPercent: 62.4,
        energyUsedKwh: 34,
      }),
    ];

    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots,
      sessionStartAt,
      sessionEndAt,
      isOngoing: false,
      assessedAt: staleAssessedAt,
    });
    expect(resolution.kind).toBe('none');
    if (resolution.kind === 'none') {
      expect(resolution.reason).toBe('stale_observation');
    }
  });

  it('4. duplicate timestamps → deterministic tie-break by idempotencyKey', () => {
    const t = new Date('2026-06-21T19:01:00.000Z');
    const snapshots = [
      row({ recordedAt: t, socPercent: 34, energyUsedKwh: 19, idempotencyKey: 'z-last' }),
      row({ recordedAt: t, socPercent: 35, energyUsedKwh: 19.5, idempotencyKey: 'a-first' }),
      row({
        recordedAt: new Date('2026-06-22T05:35:00.000Z'),
        socPercent: 62.4,
        energyUsedKwh: 34,
      }),
    ];

    const first = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots,
      sessionStartAt,
      sessionEndAt,
      isOngoing: false,
      assessedAt,
    });
    const second = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots: [...snapshots].reverse(),
      sessionStartAt,
      sessionEndAt,
      isOngoing: false,
      assessedAt,
    });

    expect(first.kind).toBe('full');
    expect(second.kind).toBe('full');
    if (first.kind === 'full' && second.kind === 'full') {
      expect(first.evidence.start.socPercent).toBe(second.evidence.start.socPercent);
      expect(first.evidence.start.socPercent).toBe(35);
    }
  });

  it('5. SEGMENT_EXTREMA-only draft stays PARTIAL / M3 ineligible', () => {
    const segment = segmentFour();
    const assessment = assessHvChargeSessionQualityFromDimoSegment(segment);
    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL);
    expect(assessment.capacityValidationEligible).toBe(false);
    expect(assessment.reasonCodes).toContain('soc_extrema_proxy');
  });

  it('6. ADDED_ENERGY_RESET remains blocked after boundary SOC enrichment', () => {
    const assessment = assessHvChargeSessionQualityFromInput({
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      isOngoing: false,
      startAt: sessionStartAt,
      endAt: sessionEndAt,
      durationSeconds: 38201,
      startSocPercent: 35,
      endSocPercent: 62.4,
      startEnergyKwh: 19.5,
      endEnergyKwh: 34,
      energyAddedKwh: 15.18,
      deltaSocPercent: 27.4,
      addedEnergyMinKwh: 3.5,
      socExtremaProxy: false,
      energyExtremaProxy: false,
    });
    expect(assessment.status).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.ADDED_ENERGY_RESET);
  });

  it('7. overlapping segments use independent session windows (no cross bleed)', () => {
    const earlyEnd = new Date('2026-06-21T22:00:00.000Z');
    const snapshots = [
      row({
        recordedAt: new Date('2026-06-21T19:01:00.000Z'),
        socPercent: 30,
        energyUsedKwh: 18,
      }),
      row({
        recordedAt: new Date('2026-06-21T21:59:00.000Z'),
        socPercent: 45,
        energyUsedKwh: 22,
      }),
      row({
        recordedAt: new Date('2026-06-22T05:35:00.000Z'),
        socPercent: 80,
        energyUsedKwh: 40,
      }),
    ];

    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots,
      sessionStartAt,
      sessionEndAt: earlyEnd,
      isOngoing: false,
      assessedAt,
    });
    expect(resolution.kind).toBe('full');
    if (resolution.kind === 'full') {
      expect(resolution.evidence.end.socPercent).toBe(45);
      expect(resolution.evidence.end.socPercent).not.toBe(80);
    }
  });

  it('8–9. enriched draft is idempotent and provenance is traceable', () => {
    const segment = segmentFour();
    const base = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: 'org',
      vehicleId: 'veh',
      segment,
    });
    const snapshots = [
      row({
        recordedAt: new Date(segment.startAt),
        socPercent: 33,
        energyUsedKwh: 18,
      }),
      row({
        recordedAt: new Date(segment.endAt!),
        socPercent: 55,
        energyUsedKwh: 30,
      }),
    ];
    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots,
      sessionStartAt: base.startAt,
      sessionEndAt: base.endAt,
      isOngoing: false,
      assessedAt,
    });
    expect(resolution.kind).toBe('full');
    if (resolution.kind !== 'full') return;

    const once = applyHvChargeSessionBoundaryEvidenceToDraft({
      draft: base,
      segment,
      evidence: resolution.evidence,
      assessedAt,
    });
    const twice = applyHvChargeSessionBoundaryEvidenceToDraft({
      draft: base,
      segment,
      evidence: resolution.evidence,
      assessedAt,
    });

    expect(once.metadata.socProvenance).toBe(HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE);
    expect(once.metadata.boundaryStartSocObservedAt).toBeDefined();
    expect(once.startSocPercent).toBe(twice.startSocPercent);
    expect(once.metadata.qualityStatus).toBe(twice.metadata.qualityStatus);
  });

  it('1b. QUALIFIED possible when boundary evidence clears extrema proxies and delta ≥ M3', () => {
    const segment = segmentFour();
    const base = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: 'org',
      vehicleId: 'veh',
      segment,
    });
    const evidence = {
      provenance: HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE,
      start: {
        socPercent: 33,
        energyUsedKwh: 18,
        socObservedAt: new Date(segment.startAt),
        energyObservedAt: new Date(segment.startAt),
        snapshotRecordedAt: new Date(segment.startAt),
        offsetFromBoundaryMs: 0,
      },
      end: {
        socPercent: 55,
        energyUsedKwh: 30,
        socObservedAt: new Date(segment.endAt!),
        energyObservedAt: new Date(segment.endAt!),
        snapshotRecordedAt: new Date(segment.endAt!),
        offsetFromBoundaryMs: 0,
      },
      deltaSocPercent: 22,
    };
    const enriched = applyHvChargeSessionBoundaryEvidenceToDraft({
      draft: base,
      segment,
      evidence,
      assessedAt,
    });
    expect(enriched.metadata.qualityStatus).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED);
    expect(enriched.metadata.capacityValidationEligible).toBe(true);
  });
});
