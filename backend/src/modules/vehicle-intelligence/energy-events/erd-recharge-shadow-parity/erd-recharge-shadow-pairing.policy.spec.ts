import {
  EnergyEventConfidence,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../erd-recharge-projection/erd-recharge-projection.constants';
import {
  ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE,
} from './erd-recharge-shadow-parity.types';
import {
  proposeCoalescedLineagePairs,
  proposeExactDimoPairs,
  resolveShadowPairings,
} from './erd-recharge-shadow-pairing.policy';

function canonical(id: string, dimo: string | null, start: string, end: string) {
  return {
    sessionId: id,
    snapshot: {
      chargeSessionId: id,
      segmentFingerprint: `fp-${id}`,
      source: 'DIMO_RECHARGE_SEGMENT',
      dimoSegmentId: dimo,
      draft: {
        startTime: new Date(start),
        endTime: new Date(end),
        durationSeconds: 3600,
        socDeltaPercent: 10,
        energyDeltaKwh: 5,
        odometerStartKm: null,
        odometerEndKm: null,
        confidence: EnergyEventConfidence.MEDIUM,
        dimoSegmentId: dimo,
        startLatitude: null,
        startLongitude: null,
        endLatitude: null,
        endLongitude: null,
        sourceEventKey: `erd:physical:v1:v:${id}`,
        detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
      },
    },
  };
}

function legacy(id: string, dimo: string, start: string, end: string, lineage: string[] = []) {
  return {
    vehicleEnergyEventId: id,
    snapshot: {
      vehicleEnergyEventId: id,
      dimoSegmentId: dimo,
      startTime: start,
      endTime: end,
      durationSeconds: 3600,
      socDeltaPercent: 10,
      energyDeltaKwh: 5,
      odometerStartKm: null,
      odometerEndKm: null,
      confidence: EnergyEventConfidence.MEDIUM,
      startLatitude: 52.1,
      startLongitude: 13.1,
      endLatitude: 52.1,
      endLongitude: 13.1,
      coalescedFromSegmentIds: lineage,
    },
  };
}

describe('erd-recharge-shadow-pairing.policy', () => {
  it('S1/S2: exact dimo and coalesced lineage proposals', () => {
    const c = [canonical('c1', 'dimo-a', '2026-06-01T08:00:00.000Z', '2026-06-01T09:00:00.000Z')];
    const lExact = [legacy('l1', 'dimo-a', '2026-06-01T08:00:00.000Z', '2026-06-01T09:00:00.000Z')];
    expect(proposeExactDimoPairs(c, lExact)).toHaveLength(1);
    const lLineage = [
      legacy(
        'l2',
        'dimo-recharge-coalesced-x',
        '2026-06-01T08:00:00.000Z',
        '2026-06-01T09:00:00.000Z',
        ['dimo-a'],
      ),
    ];
    expect(proposeCoalescedLineagePairs(c, lLineage)).toHaveLength(1);
  });

  it('S4: ambiguous pairing fails closed', () => {
    const c = [canonical('c1', 'dimo-a', '2026-06-01T08:00:00.000Z', '2026-06-01T09:00:00.000Z')];
    const l = [
      legacy('l1', 'dimo-a', '2026-06-01T08:00:00.000Z', '2026-06-01T09:00:00.000Z'),
      legacy('l2', 'dimo-a', '2026-06-01T08:00:00.000Z', '2026-06-01T09:00:00.000Z'),
    ];
    const resolved = resolveShadowPairings({ canonical: c, legacy: l });
    expect(resolved.pairs).toHaveLength(0);
    expect(resolved.ambiguousCanonicalIds).toContain('c1');
  });

  it('S3: unique window overlap pairs deterministically', () => {
    const c = [canonical('c1', null, '2026-06-01T08:00:00.000Z', '2026-06-01T09:00:00.000Z')];
    const l = [legacy('l1', 'other', '2026-06-01T08:05:00.000Z', '2026-06-01T08:55:00.000Z')];
    const resolved = resolveShadowPairings({ canonical: c, legacy: l });
    expect(resolved.pairs).toHaveLength(1);
    expect(resolved.pairs[0]?.pairingEvidence).toBe(
      ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.UNIQUE_PHYSICAL_WINDOW_OVERLAP,
    );
  });
});
