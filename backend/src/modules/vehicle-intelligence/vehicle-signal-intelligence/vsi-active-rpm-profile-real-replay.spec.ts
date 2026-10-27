import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRpmEvidenceFromIntervalReplayTrips,
  resolveActiveRpmProfileV1,
  selectRollingCadenceTripWindows,
} from './vsi-active-rpm-profile-resolver.util';

type ReplayTrip = {
  tripId: string;
  startMs: number;
  endMs: number;
  intervalsSec: number[];
};

type ReplayVehicle = {
  vehicleId: string;
  key: string;
  trips: ReplayTrip[];
};

function loadFixture(): { tiguan: ReplayVehicle; audi: ReplayVehicle } {
  const path = join(__dirname, 'fixtures/rpm-production-interval-replay.json');
  return JSON.parse(readFileSync(path, 'utf8')) as {
    tiguan: ReplayVehicle;
    audi: ReplayVehicle;
  };
}

function tripsInDateRange(trips: ReplayTrip[], fromDay: string, toDay: string): ReplayTrip[] {
  return trips.filter((t) => {
    const day = new Date(t.endMs).toISOString().slice(0, 10);
    return day >= fromDay && day <= toDay;
  });
}

function resolveRollingAtEnd(trips: ReplayTrip[]): ReturnType<typeof resolveActiveRpmProfileV1> {
  const rolling = selectRollingCadenceTripWindows(
    trips.map((t) => ({ tripId: t.tripId, startMs: t.startMs, endMs: t.endMs })),
  );
  const rollingTrips = rolling.map(
    (w) => trips.find((t) => t.tripId === w.tripId)!,
  );
  const evidence = buildRpmEvidenceFromIntervalReplayTrips(rollingTrips);
  return resolveActiveRpmProfileV1(evidence);
}

describe('vsi-active-rpm-profile real production interval replay', () => {
  const fixture = loadFixture();

  it('Audi fleet: RPM_STANDARD at end of 14d window', () => {
    const resolution = resolveRollingAtEnd(fixture.audi.trips);
    expect(resolution?.activeProfile).toBe('RPM_STANDARD');
  });

  it('Tiguan before config shift (2026-10-13..22): RPM_STANDARD', () => {
    const phase = tripsInDateRange(fixture.tiguan.trips, '2026-10-13', '2026-10-22');
    expect(phase.length).toBeGreaterThanOrEqual(5);
    const resolution = resolveRollingAtEnd(phase);
    expect(resolution?.activeProfile).toBe('RPM_STANDARD');
  });

  it('Tiguan transition (2026-10-23..26): active-sequence evidence (not gap-pooled STANDARD)', () => {
    const phase = tripsInDateRange(fixture.tiguan.trips, '2026-10-23', '2026-10-26');
    const resolution = resolveRollingAtEnd(phase);
    expect(resolution?.activeProfile).not.toBe('RPM_STANDARD');
    expect(['RPM_1HZ', 'UNKNOWN']).toContain(resolution?.activeProfile);
  });

  it('Tiguan 2026-10-27 production replay: sustained fast active sequences → RPM_1HZ', () => {
    const phase = tripsInDateRange(fixture.tiguan.trips, '2026-10-27', '2026-10-27');
    expect(phase.length).toBeGreaterThanOrEqual(3);
    for (const trip of phase) {
      const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
      const resolution = resolveActiveRpmProfileV1(evidence);
      expect(resolution?.tripClassifications[0]?.profile).toBe('RPM_1HZ');
      expect(resolution?.tripClassifications[0]?.decisionCode).toBe(
        'ACTIVE_FAST_MEASUREMENT_SEQUENCES',
      );
    }
    const resolution = resolveRollingAtEnd(phase);
    expect(resolution?.activeProfile).toBe('RPM_1HZ');
  });

  it('Tiguan post-deploy representative trip 7e72506d: RPM_1HZ despite long inter-sequence gaps', () => {
    const trip = fixture.tiguan.trips.find((t) => t.tripId.startsWith('7e72506d'));
    expect(trip).toBeDefined();
    const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip!]);
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.tripClassifications[0]?.profile).toBe('RPM_1HZ');
    expect(resolution?.tripClassifications[0]?.intervalP95Seconds).toBeGreaterThan(5);
  });

  it('Tiguan stable fast historical trip b373: RPM_1HZ per trip', () => {
    const trip = fixture.tiguan.trips.find((t) =>
      t.tripId.startsWith('b373f596'),
    );
    expect(trip).toBeDefined();
    const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip!]);
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.tripClassifications[0]?.profile).toBe('RPM_1HZ');
    expect(resolution?.tripClassifications[0]?.decisionCode).toBe(
      'ACTIVE_FAST_MEASUREMENT_SEQUENCES',
    );
  });

  it('Audi historical trips: zero false RPM_1HZ classifications', () => {
    let falseFast = 0;
    for (const trip of fixture.audi.trips) {
      const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
      const resolution = resolveActiveRpmProfileV1(evidence);
      if (resolution?.tripClassifications[0]?.profile === 'RPM_1HZ') {
        falseFast += 1;
      }
    }
    expect(falseFast).toBe(0);
  });

  it('replay fixture intervals are clipped to trip duration when building evidence', () => {
    let overflowTrips = 0;
    for (const key of ['tiguan', 'audi'] as const) {
      for (const trip of fixture[key].trips) {
        const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
        const lastTs = evidence.points.at(-1)?.recordedAtMs ?? trip.startMs;
        if (lastTs > trip.endMs) {
          overflowTrips += 1;
        }
      }
    }
    expect(overflowTrips).toBe(0);
  });

  it('median≈2s Tiguan historical trips are not classified as RPM_1HZ per trip', () => {
    const phase = tripsInDateRange(fixture.tiguan.trips, '2026-10-13', '2026-10-22');
    const med2 = phase.filter((t) => {
      const ints = t.intervalsSec;
      if (ints.length < 5) return false;
      const sorted = [...ints].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      return med === 2;
    });
    expect(med2.length).toBeGreaterThan(0);
    for (const trip of med2.slice(0, 5)) {
      const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
      const resolution = resolveActiveRpmProfileV1(evidence);
      expect(resolution?.tripClassifications[0]?.profile).not.toBe('RPM_1HZ');
    }
  });
});
