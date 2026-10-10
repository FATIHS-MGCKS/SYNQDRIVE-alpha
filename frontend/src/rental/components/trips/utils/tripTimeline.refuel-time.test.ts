import { describe, expect, it } from 'vitest';
import type { EnergyEvent } from '../../../../lib/api';
import {
  buildMergedTimelineItems,
  groupTimelineByDate,
  localDayRangeIso,
  normalizeTimelineItem,
  normalizeTimelineItems,
} from './tripTimeline';
import {
  energyEventTimelineAnchorIso,
  formatTimeHm,
  parseRefuelFuelLevelRise,
} from './refuelTimelineTime';
import { buildRefuelObservedTimePresentation } from '../trips-energy-i18n';
import { wob7503Refuel20261009 } from './wob7503-refuel.fixture';

describe('refuel timeline time UX', () => {
  it('WOB L 7503 2026-10-09 — primary observed time ~20:49 Europe/Berlin, not envelope 19:32', () => {
    const event = wob7503Refuel20261009();
    const rise = parseRefuelFuelLevelRise(event);
    expect(rise.ok).toBe(true);
    expect(buildRefuelObservedTimePresentation(event, 'de-DE').mode).toBe('approximate');
    const berlinStart = formatTimeHm(
      new Date(event.fuelLevelRiseStart!),
      'de-DE',
      'Europe/Berlin',
    );
    const berlinEnd = formatTimeHm(
      new Date(event.fuelLevelRiseEnd!),
      'de-DE',
      'Europe/Berlin',
    );
    expect(berlinStart).toBe('20:48');
    expect(berlinEnd).toBe('20:55');
    const envelopeFrom = formatTimeHm(new Date(event.startTime), 'de-DE', 'Europe/Berlin');
    expect(envelopeFrom).toBe('19:32');
    expect(berlinStart).not.toBe(envelopeFrom);
  });

  it('WOB 7503 — refuel between trips 19:44–19:53 and 20:43–21:09 (Berlin)', () => {
    const refuel = wob7503Refuel20261009();
    const tripBefore = {
      id: 'trip-1944-berlin',
      vehicleId: refuel.vehicleId,
      tripStatus: 'COMPLETED' as const,
      startTime: '2026-10-09T17:44:00.000Z',
      endTime: '2026-10-09T17:53:00.000Z',
      distanceKm: 5,
      durationMinutes: 9,
    };
    const tripAfter = {
      id: 'trip-2043-berlin',
      vehicleId: refuel.vehicleId,
      tripStatus: 'COMPLETED' as const,
      startTime: '2026-10-09T18:43:00.000Z',
      endTime: '2026-10-09T19:09:00.000Z',
      distanceKm: 8,
      durationMinutes: 26,
    };
    const merged = buildMergedTimelineItems([tripBefore, tripAfter], [refuel]);
    expect(merged.map((i) => i.id)).toEqual([
      'trip-2043-berlin',
      refuel.id,
      'trip-1944-berlin',
    ]);
  });

  it('normalizeTimelineItems re-sorts canonical API envelope-ordered payload', () => {
    const refuel = wob7503Refuel20261009();
    const canonicalBackendOrder = [
      {
        itemType: 'energy-event' as const,
        ...refuel,
        startTime: refuel.startTime,
      },
      {
        itemType: 'trip' as const,
        id: 'trip-2043-berlin',
        vehicleId: refuel.vehicleId,
        tripStatus: 'COMPLETED',
        startTime: '2026-10-09T18:43:00.000Z',
        endTime: '2026-10-09T19:09:00.000Z',
      },
      {
        itemType: 'trip' as const,
        id: 'trip-1944-berlin',
        vehicleId: refuel.vehicleId,
        tripStatus: 'COMPLETED',
        startTime: '2026-10-09T17:44:00.000Z',
        endTime: '2026-10-09T17:53:00.000Z',
      },
    ];
    const normalized = normalizeTimelineItems(canonicalBackendOrder);
    expect(normalized.map((i) => i.id)).toEqual([
      'trip-2043-berlin',
      refuel.id,
      'trip-1944-berlin',
    ]);
    if (normalized[1].itemType === 'energy-event') {
      expect(normalized[1].startTime).toBe('2026-10-09T18:48:52.000Z');
      expect(normalized[1].event.startTime).toBe(refuel.startTime);
    }
  });

  it('fallback merge path matches canonical sort order', () => {
    const refuel = wob7503Refuel20261009();
    const trips = [
      {
        id: 'trip-1944-berlin',
        vehicleId: refuel.vehicleId,
        tripStatus: 'COMPLETED' as const,
        startTime: '2026-10-09T17:44:00.000Z',
      },
      {
        id: 'trip-2043-berlin',
        vehicleId: refuel.vehicleId,
        tripStatus: 'COMPLETED' as const,
        startTime: '2026-10-09T18:43:00.000Z',
      },
    ];
    const canonical = normalizeTimelineItems([
      { itemType: 'energy-event', ...refuel, startTime: refuel.startTime },
      { itemType: 'trip', ...trips[1] },
      { itemType: 'trip', ...trips[0] },
    ]);
    const fallback = buildMergedTimelineItems(trips, [refuel]);
    expect(fallback.map((i) => i.id)).toEqual(canonical.map((i) => i.id));
  });

  it('missing rise timestamps — undetermined presentation, envelope anchor for sort', () => {
    const event = wob7503Refuel20261009({
      fuelLevelRiseStart: null,
      fuelLevelRiseEnd: null,
      fuelLevelRiseDurationSeconds: null,
    });
    expect(parseRefuelFuelLevelRise(event).ok).toBe(false);
    expect(buildRefuelObservedTimePresentation(event, 'en').mode).toBe('undetermined');
    expect(energyEventTimelineAnchorIso(event)).toBe(event.startTime);
  });

  it('invalid swapped rise timestamps rejected', () => {
    const event = wob7503Refuel20261009({
      fuelLevelRiseStart: '2026-10-09T18:55:22.000Z',
      fuelLevelRiseEnd: '2026-10-09T18:48:52.000Z',
    });
    expect(parseRefuelFuelLevelRise(event).ok).toBe(false);
  });

  it('rise outside envelope (inconsistent) rejected', () => {
    const event = wob7503Refuel20261009({
      fuelLevelRiseStart: '2026-10-09T16:00:00.000Z',
      fuelLevelRiseEnd: '2026-10-09T16:05:00.000Z',
    });
    expect(parseRefuelFuelLevelRise(event).ok).toBe(false);
  });

  it('groups REFUEL under rise-start local day (midnight boundary)', () => {
    const event = wob7503Refuel20261009();
    const items = buildMergedTimelineItems([], [event]);
    const groups = groupTimelineByDate(items);
    expect(groups.length).toBe(1);
    expect(groups[0].dateKey).toMatch(/^2026-10-09/);
  });

  it('canonical API flat item uses rise anchor on normalize', () => {
    const event = wob7503Refuel20261009();
    const normalized = normalizeTimelineItem({
      itemType: 'energy-event',
      ...event,
    });
    expect(normalized.startTime).toBe('2026-10-09T18:48:52.000Z');
    if (normalized.itemType === 'energy-event') {
      expect(normalized.event.startTime).toBe('2026-10-09T17:32:55.000Z');
    }
  });

  it('local day filter window is local-midnight bounded (DST-safe shape)', () => {
    const { from, to } = localDayRangeIso('2026-10-09');
    expect(from).toMatch(/T\d{2}:\d{2}:\d{2}/);
    expect(to).toMatch(/T\d{2}:\d{2}:\d{2}/);
    expect(new Date(to).getTime()).toBeGreaterThan(new Date(from).getTime());
  });

  it('RECHARGE timeline anchor unchanged (envelope start)', () => {
    const recharge: EnergyEvent = {
      ...wob7503Refuel20261009(),
      id: 'recharge-1',
      kind: 'RECHARGE',
      detectionMechanism: 'recharge',
      fuelLevelRiseStart: null,
      fuelLevelRiseEnd: null,
      fuelLevelRiseDurationSeconds: null,
      startTime: '2026-10-09T12:00:00.000Z',
      endTime: '2026-10-09T13:00:00.000Z',
      durationSeconds: 3600,
      socDeltaPercent: 20,
      energyDeltaKwh: 10,
      fuelDeltaLiters: null,
      fuelDeltaPercent: null,
    };
    expect(energyEventTimelineAnchorIso(recharge)).toBe('2026-10-09T12:00:00.000Z');
  });
});
