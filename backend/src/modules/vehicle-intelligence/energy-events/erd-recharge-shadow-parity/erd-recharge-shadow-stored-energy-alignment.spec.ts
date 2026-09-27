import { EnergyEventConfidence, VehicleEnergyEventDetectionSource, type VehicleEnergyEvent } from '@prisma/client';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-quality.status';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../erd-recharge-projection/erd-recharge-projection.constants';
import { compareShadowProjectionFields } from './erd-recharge-shadow-field-diff.policy';
import { classifyPairedParity } from './erd-recharge-shadow-field-diff.policy';
import { evaluateRechargeShadowParity } from './erd-recharge-shadow-parity.evaluate';
import { ERD_RECHARGE_SHADOW_PARITY_CLASS } from './erd-recharge-shadow-parity.types';
import {
  buildTopologyLegacyVee,
  buildTopologyNativeSession,
  TOPOLOGY_EVALUATE_SCOPE,
} from './erd-recharge-shadow-topology.fixture';

describe('erd-recharge-shadow stored-energy alignment (Step 2)', () => {
  const window = {
    start: new Date('2026-06-01T10:00:00.000Z'),
    end: new Date('2026-06-01T11:00:00.000Z'),
  };

  it('paired native canonical uses stored delta matching legacy (no energy FIELD_MISMATCH)', () => {
    const dimoId = 'dimo-stored-energy-step2';
    const sessions = [
      {
        ...buildTopologyNativeSession({
          sessionId: 'c-native',
          dimoSegmentId: dimoId,
          startAt: window.start,
          endAt: window.end,
        }),
        startEnergyKwh: 10,
        endEnergyKwh: 30,
        energyAddedKwh: 28,
        deltaSocPercent: 40,
      },
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l-stored',
        dimoSegmentId: dimoId,
        startTime: window.start,
        endTime: window.end,
        energyDeltaKwh: 20,
      }),
    ];
    const observations = evaluateRechargeShadowParity({
      ...TOPOLOGY_EVALUATE_SCOPE,
      sessions,
      legacyRows,
    });
    const pair = observations.find(
      (o) =>
        o.canonicalChargeSessionId === 'c-native' && o.legacyVehicleEnergyEventId === 'l-stored',
    );
    expect(pair).toBeDefined();
    expect(pair?.fieldDiff?.numericDeltas?.energyDeltaDifferenceKwh).toBe(0);
    expect(pair?.fieldDiff?.mismatches?.filter((m) => m.field === 'energyDeltaKwh')).toHaveLength(
      0,
    );
    expect(
      [ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH, ERD_RECHARGE_SHADOW_PARITY_CLASS.SEMANTIC_MATCH],
    ).toContain(pair?.parityClass);
    expect(
      observations.filter(
        (o) =>
          o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH &&
          o.fieldDiff?.mismatches?.some((m) => m.field === 'energyDeltaKwh'),
      ),
    ).toHaveLength(0);
  });

  it('field diff policy reports zero stored-energy delta when canonical uses stored semantics', () => {
    const diff = compareShadowProjectionFields({
      canonical: {
        chargeSessionId: 'c1',
        segmentFingerprint: 'fp',
        source: 'DIMO_RECHARGE_SEGMENT',
        dimoSegmentId: 'dimo-1',
        draft: {
          startTime: window.start,
          endTime: window.end,
          durationSeconds: 3600,
          socDeltaPercent: 40,
          energyDeltaKwh: 20,
          odometerStartKm: null,
          odometerEndKm: null,
          confidence: EnergyEventConfidence.MEDIUM,
          dimoSegmentId: 'dimo-1',
          startLatitude: null,
          startLongitude: null,
          endLatitude: null,
          endLongitude: null,
          sourceEventKey: 'erd:physical:v1:v:c1',
          detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
          detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
        },
      },
      legacy: {
        vehicleEnergyEventId: 'l1',
        dimoSegmentId: 'dimo-1',
        startTime: window.start.toISOString(),
        endTime: window.end.toISOString(),
        durationSeconds: 3600,
        socDeltaPercent: 40,
        energyDeltaKwh: 20,
        odometerStartKm: null,
        odometerEndKm: null,
        confidence: EnergyEventConfidence.MEDIUM,
        startLatitude: null,
        startLongitude: null,
        endLatitude: null,
        endLongitude: null,
        coalescedFromSegmentIds: [],
      },
    });
    expect(diff.numericDeltas.energyDeltaDifferenceKwh).toBe(0);
    expect(classifyPairedParity(diff)).not.toBe(ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH);
  });
});
