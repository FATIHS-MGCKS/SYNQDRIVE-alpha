import { EnergyEventKind } from '@prisma/client';
import {
  buildEnergyEventEnvelopeStartListWhere,
  buildEnergyEventProductReadListWhere,
  filterEnergyEventDtosByProductTimelineAnchor,
  parseRefuelFuelLevelRiseRow,
  resolveEnergyEventProductTimelineAnchor,
} from './energy-event-product-timeline-anchor';
import type { EnergyEventDto } from './energy-events.types';

function refuelDto(overrides: Partial<EnergyEventDto> = {}): EnergyEventDto {
  return {
    id: '412f17f7-7380-4dd0-8e24-6939be4809d6',
    vehicleId: 'veh-1',
    dimoSegmentId: 'dimo-refuel-1',
    kind: 'REFUEL',
    detectionMechanism: 'refuel',
    startTime: '2026-10-09T17:32:55.000Z',
    endTime: '2026-10-09T19:09:13.000Z',
    durationSeconds: 5780,
    startLatitude: null,
    startLongitude: null,
    endLatitude: null,
    endLongitude: null,
    fuelDeltaLiters: 18,
    fuelDeltaPercent: null,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: null,
    odometerEndKm: null,
    confidence: 'HIGH',
    fuelLevelRiseStart: '2026-10-09T18:48:52.000Z',
    fuelLevelRiseEnd: '2026-10-09T18:55:22.000Z',
    fuelLevelRiseDurationSeconds: 390,
    ...overrides,
  };
}

describe('energy-event-product-timeline-anchor', () => {
  const berlinOct9From = new Date('2026-10-08T22:00:00.000Z');
  const berlinOct9To = new Date('2026-10-09T21:59:59.999Z');

  it('WOB 7503 anchor uses fuel rise start, not envelope', () => {
    const dto = refuelDto();
    const anchor = resolveEnergyEventProductTimelineAnchor({
      kind: EnergyEventKind.REFUEL,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      fuelLevelRiseStart: new Date(dto.fuelLevelRiseStart!),
      fuelLevelRiseEnd: new Date(dto.fuelLevelRiseEnd!),
    });
    expect(anchor.toISOString()).toBe('2026-10-09T18:48:52.000Z');
  });

  it('midnight: envelope before local day, rise on Oct 9 Berlin — included in Oct 9 window', () => {
    const dto = refuelDto({
      startTime: '2026-10-08T21:30:00.000Z',
      endTime: '2026-10-09T01:00:00.000Z',
      fuelLevelRiseStart: '2026-10-09T00:15:00.000Z',
      fuelLevelRiseEnd: '2026-10-09T00:20:00.000Z',
    });
    const filtered = filterEnergyEventDtosByProductTimelineAnchor([dto], {
      from: berlinOct9From,
      to: berlinOct9To,
    });
    expect(filtered).toHaveLength(1);
  });

  it('midnight: envelope spans local day boundary but rise on prior Berlin day — excluded', () => {
    const dto = refuelDto({
      startTime: '2026-10-08T21:00:00.000Z',
      endTime: '2026-10-09T00:30:00.000Z',
      fuelLevelRiseStart: '2026-10-08T21:45:00.000Z',
      fuelLevelRiseEnd: '2026-10-08T21:50:00.000Z',
    });
    const filtered = filterEnergyEventDtosByProductTimelineAnchor([dto], {
      from: berlinOct9From,
      to: berlinOct9To,
    });
    expect(filtered).toHaveLength(0);
  });

  it('missing rise falls back to envelope start for anchor', () => {
    const row = {
      kind: EnergyEventKind.REFUEL,
      startTime: new Date('2026-10-09T17:32:55.000Z'),
      endTime: new Date('2026-10-09T19:09:13.000Z'),
      fuelLevelRiseStart: null,
      fuelLevelRiseEnd: null,
    };
    expect(parseRefuelFuelLevelRiseRow(row).ok).toBe(false);
    expect(resolveEnergyEventProductTimelineAnchor(row).toISOString()).toBe(
      '2026-10-09T17:32:55.000Z',
    );
  });

  it('invalid swapped rise uses envelope fallback via parse failure', () => {
    const row = {
      kind: EnergyEventKind.REFUEL,
      startTime: new Date('2026-10-09T17:32:55.000Z'),
      endTime: new Date('2026-10-09T19:09:13.000Z'),
      fuelLevelRiseStart: new Date('2026-10-09T18:55:22.000Z'),
      fuelLevelRiseEnd: new Date('2026-10-09T18:48:52.000Z'),
    };
    expect(parseRefuelFuelLevelRiseRow(row).ok).toBe(false);
    expect(resolveEnergyEventProductTimelineAnchor(row).toISOString()).toBe(
      '2026-10-09T17:32:55.000Z',
    );
  });

  it('RECHARGE anchor remains envelope start', () => {
    const row = {
      kind: EnergyEventKind.RECHARGE,
      startTime: new Date('2026-10-09T12:00:00.000Z'),
      endTime: new Date('2026-10-09T13:00:00.000Z'),
      fuelLevelRiseStart: null,
      fuelLevelRiseEnd: null,
    };
    expect(resolveEnergyEventProductTimelineAnchor(row).toISOString()).toBe(
      '2026-10-09T12:00:00.000Z',
    );
  });

  it('DST Europe/Berlin — Oct 9 2026 CEST window includes rise anchor', () => {
    const dto = refuelDto();
    const filtered = filterEnergyEventDtosByProductTimelineAnchor([dto], {
      from: berlinOct9From,
      to: berlinOct9To,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].fuelLevelRiseStart).toBe('2026-10-09T18:48:52.000Z');
  });

  it('raw envelope where filters on startTime only (no product OR)', () => {
    const from = new Date('2026-10-08T22:00:00.000Z');
    const to = new Date('2026-10-09T21:59:59.999Z');
    const where = buildEnergyEventEnvelopeStartListWhere('veh-1', { from, to });
    expect(where).toEqual({
      vehicleId: 'veh-1',
      startTime: { gte: from, lte: to },
    });
    expect(where).not.toHaveProperty('OR');
  });

  it('buildEnergyEventProductReadListWhere uses bounded OR (no unbounded scan)', () => {
    const from = new Date('2026-10-08T22:00:00.000Z');
    const to = new Date('2026-10-09T21:59:59.999Z');
    const where = buildEnergyEventProductReadListWhere('veh-1', { from, to });
    expect(where.OR).toHaveLength(4);
    expect(JSON.stringify(where)).toContain('fuelLevelRiseStart');
    expect(JSON.stringify(where)).toContain('RECHARGE');
  });
});
