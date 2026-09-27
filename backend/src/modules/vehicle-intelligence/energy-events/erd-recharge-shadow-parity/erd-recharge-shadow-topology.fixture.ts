import {
  EnergyEventConfidence,
  EnergyEventKind,
  type HvChargeSession,
  type VehicleEnergyEvent,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';

const ORG = 'org-topology-test';
const VEHICLE = 'vehicle-topology-test';
const WINDOW_FROM = new Date('2026-06-01T00:00:00.000Z');
const WINDOW_TO = new Date('2026-06-02T23:59:59.999Z');

export const TOPOLOGY_EVALUATE_SCOPE = {
  organizationId: ORG,
  vehicleId: VEHICLE,
  windowFrom: WINDOW_FROM,
  windowTo: WINDOW_TO,
};

export function buildTopologyNativeSession(input: {
  sessionId: string;
  dimoSegmentId: string;
  startAt: Date;
  endAt: Date;
  suffix?: string;
}): HvChargeSession {
  const suffix = input.suffix ?? input.sessionId;
  return {
    id: input.sessionId,
    organizationId: ORG,
    vehicleId: VEHICLE,
    segmentFingerprint: `dimo-recharge-${suffix}`,
    dimoSegmentId: input.dimoSegmentId,
    source: 'DIMO_RECHARGE_SEGMENT',
    startAt: input.startAt,
    endAt: input.endAt,
    startSocPercent: 20,
    endSocPercent: 60,
    deltaSocPercent: 40,
    startEnergyKwh: 10,
    endEnergyKwh: 32,
    energyAddedKwh: 22,
    isOngoing: false,
    idempotencyKey: `native-${suffix}`,
    metadata: { qualityStatus: 'QUALIFIED' },
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  } as unknown as HvChargeSession;
}

export function buildTopologyLegacyVee(input: {
  id: string;
  dimoSegmentId: string;
  startTime: Date;
  endTime: Date;
  coalescedFromSegmentIds?: string[];
  energyDeltaKwh?: number;
}): VehicleEnergyEvent {
  const durationSeconds = Math.max(
    1,
    Math.floor((input.endTime.getTime() - input.startTime.getTime()) / 1000),
  );
  return {
    id: input.id,
    vehicleId: VEHICLE,
    dimoSegmentId: input.dimoSegmentId,
    kind: EnergyEventKind.RECHARGE,
    detectionMechanism: 'recharge',
    detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
    canonicalChargeSessionId: null,
    startTime: input.startTime,
    endTime: input.endTime,
    durationSeconds,
    socDeltaPercent: 40,
    energyDeltaKwh: input.energyDeltaKwh ?? 22,
    confidence: EnergyEventConfidence.HIGH,
    odometerStartKm: null,
    odometerEndKm: null,
    startLatitude: 52.1,
    startLongitude: 13.1,
    endLatitude: 52.1,
    endLongitude: 13.1,
    rawDetectionMeta:
      input.coalescedFromSegmentIds != null
        ? { coalescedFromSegmentIds: input.coalescedFromSegmentIds }
        : null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  } as unknown as VehicleEnergyEvent;
}

export function buildProductionShapedFragmentFixture(): {
  sessions: HvChargeSession[];
  legacyRows: VehicleEnergyEvent[];
} {
  const startAt = new Date('2026-06-01T10:00:00.000Z');
  const endAt = new Date('2026-06-01T11:00:00.000Z');
  const dimo = 'dimo-native-prod-shape';
  const sessions = [
    buildTopologyNativeSession({
      sessionId: 'c-prod-shape',
      dimoSegmentId: dimo,
      startAt,
      endAt,
    }),
  ];
  const legacyRows: VehicleEnergyEvent[] = [
    buildTopologyLegacyVee({
      id: 'l-anchor',
      dimoSegmentId: dimo,
      startTime: startAt,
      endTime: endAt,
    }),
  ];
  for (let i = 0; i < 64; i += 1) {
    const fragmentStart = new Date(startAt.getTime() + (i + 1) * 30_000);
    const fragmentEnd = new Date(fragmentStart.getTime() + 20_000);
    legacyRows.push(
      buildTopologyLegacyVee({
        id: `f-${String(i).padStart(3, '0')}`,
        dimoSegmentId: `dimo-fragment-${i}`,
        startTime: fragmentStart,
        endTime: fragmentEnd,
      }),
    );
  }
  return { sessions, legacyRows };
}
