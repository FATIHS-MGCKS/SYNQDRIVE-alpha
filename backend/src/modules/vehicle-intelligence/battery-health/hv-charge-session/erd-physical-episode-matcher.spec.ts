import {
  decideFallbackSupersessionForNative,
  ERD_PHYSICAL_MATCH_RESULT,
  matchErdPhysicalEpisode,
} from './erd-physical-episode-matcher';
import type { HvChargeSessionRow } from './hv-charge-session.types';
import {
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from './hv-charge-session.types';

const EVAL = new Date('2026-07-16T12:00:00.000Z');
const VEH = 'veh-1';

function fallbackRow(overrides: Partial<HvChargeSessionRow> = {}): HvChargeSessionRow {
  return {
    id: 'fb-1',
    organizationId: 'org',
    vehicleId: VEH,
    segmentFingerprint: 'poll-charge:veh-1:1',
    dimoSegmentId: null,
    source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
    startAt: new Date('2026-07-16T08:00:00.000Z'),
    endAt: new Date('2026-07-16T10:00:00.000Z'),
    startSocPercent: 40,
    endSocPercent: 55,
    startEnergyKwh: 20,
    endEnergyKwh: 28,
    energyAddedKwh: 8,
    deltaSocPercent: 15,
    isOngoing: false,
    quality: null,
    idempotencyKey: 'idem-fb',
    providerObservedAt: new Date('2026-07-16T10:00:00.000Z'),
    metadata: {},
    ...overrides,
  };
}

describe('erd-physical-episode-matcher', () => {
  it('returns DIFFERENT when windows do not overlap', () => {
    const match = matchErdPhysicalEpisode({
      vehicleId: VEH,
      fallback: {
        startAt: new Date('2026-07-16T08:00:00.000Z'),
        endAt: new Date('2026-07-16T09:00:00.000Z'),
        startSocPercent: 40,
        endSocPercent: 50,
        startEnergyKwh: 20,
        endEnergyKwh: 25,
        energyAddedKwh: 5,
        isOngoing: false,
      },
      native: {
        startAt: new Date('2026-07-16T12:00:00.000Z'),
        endAt: new Date('2026-07-16T14:00:00.000Z'),
        socMin: 60,
        socMax: 70,
        energyMin: 30,
        energyMax: 36,
        addedEnergyDelta: 6,
        ongoing: false,
      },
      evaluatedAt: EVAL,
    });
    expect(match.result).toBe(ERD_PHYSICAL_MATCH_RESULT.DIFFERENT);
  });

  it('returns SAME when temporal overlap and SOC/energy ranges align', () => {
    const match = matchErdPhysicalEpisode({
      vehicleId: VEH,
      fallback: {
        startAt: new Date('2026-07-16T08:00:00.000Z'),
        endAt: new Date('2026-07-16T10:30:00.000Z'),
        startSocPercent: 41,
        endSocPercent: 48,
        startEnergyKwh: 20,
        endEnergyKwh: 27,
        energyAddedKwh: 7,
        isOngoing: false,
      },
      native: {
        startAt: new Date('2026-07-16T08:15:00.000Z'),
        endAt: new Date('2026-07-16T10:00:00.000Z'),
        socMin: 41.2,
        socMax: 48.5,
        energyMin: 20.5,
        energyMax: 27.2,
        addedEnergyDelta: 6.7,
        ongoing: false,
      },
      evaluatedAt: EVAL,
    });
    expect(match.result).toBe(ERD_PHYSICAL_MATCH_RESULT.SAME);
  });

  it('fails closed when multiple fallback rows match SAME', () => {
    const decision = decideFallbackSupersessionForNative({
      vehicleId: VEH,
      fallbackSessions: [
        fallbackRow({ id: 'fb-a', segmentFingerprint: 'a' }),
        fallbackRow({ id: 'fb-b', segmentFingerprint: 'b' }),
      ],
      native: {
        startAt: new Date('2026-07-16T08:10:00.000Z'),
        endAt: new Date('2026-07-16T10:00:00.000Z'),
        socMin: 41,
        socMax: 48,
        energyMin: 20,
        energyMax: 28,
        addedEnergyDelta: 8,
        ongoing: false,
      },
      evaluatedAt: EVAL,
    });
    expect(decision.action).toBe('none');
  });

  it('supersedes exactly one fallback on unambiguous SAME', () => {
    const decision = decideFallbackSupersessionForNative({
      vehicleId: VEH,
      fallbackSessions: [fallbackRow()],
      native: {
        startAt: new Date('2026-07-16T08:10:00.000Z'),
        endAt: new Date('2026-07-16T10:00:00.000Z'),
        socMin: 41,
        socMax: 48,
        energyMin: 20,
        energyMax: 28,
        addedEnergyDelta: 8,
        ongoing: false,
      },
      evaluatedAt: EVAL,
    });
    expect(decision.action).toBe('supersede_one');
    expect(decision.target?.id).toBe('fb-1');
  });
});
