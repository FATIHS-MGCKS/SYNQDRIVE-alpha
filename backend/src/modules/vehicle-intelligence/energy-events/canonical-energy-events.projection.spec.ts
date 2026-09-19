import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEvent,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import { projectCanonicalProductEnergyEvents } from './canonical-energy-events.projection';

function nativeRevision(input: {
  id: string;
  dimoSegmentId: string;
  startIso: string;
  endIso: string;
  fuelStart: number;
  fuelEnd: number;
  fuelDelta: number;
  createdAtIso?: string;
}): VehicleEnergyEvent {
  return {
    id: input.id,
    vehicleId: 'veh-test',
    kind: EnergyEventKind.REFUEL,
    dimoSegmentId: input.dimoSegmentId,
    startTime: new Date(input.startIso),
    endTime: new Date(input.endIso),
    fuelDeltaLiters: input.fuelDelta,
    rawDetectionMeta: {
      fuelStartLiters: input.fuelStart,
      fuelEndLiters: input.fuelEnd,
    },
    createdAt: new Date(input.createdAtIso ?? input.startIso),
    updatedAt: new Date(input.createdAtIso ?? input.startIso),
  } as unknown as VehicleEnergyEvent;
}

function reconFor(
  event: VehicleEnergyEvent,
  input: {
    groupId: string;
    finalityState: PhysicalRefuelFinalityState;
    enrichmentEligible: boolean;
    canonicalEventId: string | null;
  },
): VehicleEnergyEventRefuelReconciliation {
  return {
    energyEventId: event.id,
    vehicleId: event.vehicleId,
    reconciliationGroupId: input.groupId,
    finalityState: input.finalityState,
    canonicalEventId: input.canonicalEventId,
    enrichmentEligible: input.enrichmentEligible,
  } as unknown as VehicleEnergyEventRefuelReconciliation;
}

describe('canonical-energy-events.projection (F10.6.6-B.1)', () => {
  const v2Cutover = new Date('2026-09-04T12:00:00.000Z');

  it('WOB-shaped fixture — 3 raw revisions, 1 product refuel', () => {
    const groupId = 'veh-test:wob-product';
    const rev1 = nativeRevision({
      id: 'native-rev-1',
      dimoSegmentId: 'dimo-seg-rev-1',
      startIso: '2026-09-19T16:08:00.000Z',
      endIso: '2026-09-19T16:12:00.000Z',
      fuelStart: 5,
      fuelEnd: 16,
      fuelDelta: 11,
      createdAtIso: '2026-09-19T16:08:00.000Z',
    });
    const rev2 = nativeRevision({
      id: 'native-rev-2',
      dimoSegmentId: 'dimo-seg-rev-2',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:14:00.000Z',
      fuelStart: 5,
      fuelEnd: 17,
      fuelDelta: 12,
      createdAtIso: '2026-09-19T16:09:00.000Z',
    });
    const rev3 = nativeRevision({
      id: 'native-rev-3',
      dimoSegmentId: 'dimo-seg-rev-3',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:15:27.000Z',
      fuelStart: 5,
      fuelEnd: 18,
      fuelDelta: 13,
      createdAtIso: '2026-09-19T16:09:00.000Z',
    });
    const canonicalId = rev3.id;
    const rawRows = [
      {
        ...rev1,
        refuelReconciliation: reconFor(rev1, {
          groupId,
          finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
          enrichmentEligible: false,
          canonicalEventId: canonicalId,
        }),
      },
      {
        ...rev2,
        refuelReconciliation: reconFor(rev2, {
          groupId,
          finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
          enrichmentEligible: false,
          canonicalEventId: canonicalId,
        }),
      },
      {
        ...rev3,
        refuelReconciliation: reconFor(rev3, {
          groupId,
          finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
          enrichmentEligible: true,
          canonicalEventId: canonicalId,
        }),
      },
    ];

    expect(rawRows).toHaveLength(3);
    const product = projectCanonicalProductEnergyEvents(rawRows, v2Cutover);
    const refuels = product.filter((row) => row.kind === EnergyEventKind.REFUEL);
    expect(refuels).toHaveLength(1);
    expect(refuels[0].id).toBe('native-rev-3');
  });

  it('genuine legacy refuel remains visible once', () => {
    const legacy = nativeRevision({
      id: 'legacy-1',
      dimoSegmentId: 'dimo-legacy',
      startIso: '2026-09-01T10:00:00.000Z',
      endIso: '2026-09-01T10:20:00.000Z',
      fuelStart: 10,
      fuelEnd: 30,
      fuelDelta: 20,
      createdAtIso: '2026-09-01T10:00:00.000Z',
    });
    const product = projectCanonicalProductEnergyEvents(
      [{ ...legacy, refuelReconciliation: null }],
      v2Cutover,
    );
    expect(product).toHaveLength(1);
  });

  it('provisional V2 component hidden from product read (no triple display)', () => {
    const groupId = 'veh-test:provisional';
    const rev = nativeRevision({
      id: 'provisional-rev',
      dimoSegmentId: 'dimo-prov',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:15:27.000Z',
      fuelStart: 5,
      fuelEnd: 18,
      fuelDelta: 13,
      createdAtIso: '2026-09-19T16:20:00.000Z',
    });
    const product = projectCanonicalProductEnergyEvents(
      [
        {
          ...rev,
          refuelReconciliation: reconFor(rev, {
            groupId,
            finalityState: PhysicalRefuelFinalityState.PROVISIONAL,
            enrichmentEligible: false,
            canonicalEventId: rev.id,
          }),
        },
      ],
      v2Cutover,
    );
    expect(product).toHaveLength(0);
  });

  it('V2-owned unreconciled native hidden from product read', () => {
    const rev = nativeRevision({
      id: 'v2-unreconciled',
      dimoSegmentId: 'dimo-unrecon',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:15:27.000Z',
      fuelStart: 5,
      fuelEnd: 18,
      fuelDelta: 13,
      createdAtIso: '2026-09-19T16:20:00.000Z',
    });
    const product = projectCanonicalProductEnergyEvents(
      [{ ...rev, refuelReconciliation: null }],
      v2Cutover,
    );
    expect(product).toHaveLength(0);
  });
});
