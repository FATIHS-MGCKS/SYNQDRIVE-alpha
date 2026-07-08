import { HfMirrorService } from './hf-mirror.service';
import type { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import type { AbuseEvent } from './hf-abuse';

function makeReading(over: Partial<HighFrequencyReading> = {}): HighFrequencyReading {
  return {
    timestamp: '2026-06-25T10:00:00.000Z',
    speedKmh: 50,
    engineCoolantTempC: null,
    rpm: null,
    throttlePosition: null,
    engineLoad: null,
    tractionBatteryPowerKw: 12,
    ...over,
  };
}

function makeAbuse(over: Partial<AbuseEvent> = {}): AbuseEvent {
  return {
    eventType: 'FULL_BRAKING',
    severity: 'SEVERE',
    startedAt: new Date('2026-06-25T10:00:05.000Z'),
    endedAt: new Date('2026-06-25T10:00:06.000Z'),
    durationMs: 1000,
    startSpeedKmh: 50,
    endSpeedKmh: 0,
    peakValue: 8.1,
    peakValueUnit: 'm/s²',
    maxRpm: null,
    maxThrottlePos: null,
    maxCoolantTemp: null,
    metadata: { foo: 'bar' },
    ...over,
  };
}

describe('HfMirrorService', () => {
  const baseParams = {
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tokenId: 42,
    tripId: 'trip-1',
    readings: [makeReading(), makeReading({ timestamp: '2026-06-25T10:00:01.000Z', speedKmh: 55 })],
    abuseEvents: [makeAbuse()],
  };

  function makeHf(over: Partial<jest.Mocked<ClickHouseHfService>> = {}) {
    return {
      hasTripHfPoints: jest.fn().mockResolvedValue(false),
      insertHfPoints: jest.fn().mockResolvedValue(undefined),
      insertHfEvents: jest.fn().mockResolvedValue(undefined),
      ...over,
    } as unknown as ClickHouseHfService;
  }

  const ORIGINAL_FLAG = process.env.HF_MIRROR_ENABLED;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.HF_MIRROR_ENABLED;
    else process.env.HF_MIRROR_ENABLED = ORIGINAL_FLAG;
  });

  it('is a pure no-op when disabled (default)', async () => {
    delete process.env.HF_MIRROR_ENABLED;
    const hf = makeHf();
    const svc = new HfMirrorService(hf);
    const res = await svc.mirrorTripHf(baseParams);
    expect(res.mirrored).toBe(false);
    expect(res.reason).toBe('disabled');
    expect(hf.insertHfPoints).not.toHaveBeenCalled();
    expect(hf.insertHfEvents).not.toHaveBeenCalled();
  });

  it('skips when org id is missing (tenant attribution preserved)', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf();
    const svc = new HfMirrorService(hf);
    const res = await svc.mirrorTripHf({ ...baseParams, orgId: null });
    expect(res.reason).toBe('no_org');
    expect(hf.insertHfPoints).not.toHaveBeenCalled();
  });

  it('mirrors points + events when enabled and not previously mirrored', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf();
    const svc = new HfMirrorService(hf);
    const res = await svc.mirrorTripHf(baseParams);

    expect(res.mirrored).toBe(true);
    expect(hf.insertHfPoints).toHaveBeenCalledTimes(1);
    expect(hf.insertHfEvents).toHaveBeenCalledTimes(1);

    const points = (hf.insertHfPoints as jest.Mock).mock.calls[0][0];
    // 2 readings × (speed + tractionPower) = 4 points (other signals null).
    expect(points).toHaveLength(4);
    expect(points.every((p: any) => p.orgId === 'org-1' && p.tripId === 'trip-1')).toBe(true);

    const events = (hf.insertHfEvents as jest.Mock).mock.calls[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('FULL_BRAKING');
    expect(events[0].tripId).toBe('trip-1');
  });

  it('is idempotent: does not re-insert points already mirrored for the trip', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf({ hasTripHfPoints: jest.fn().mockResolvedValue(true) });
    const svc = new HfMirrorService(hf);
    const res = await svc.mirrorTripHf(baseParams);

    expect(hf.insertHfPoints).not.toHaveBeenCalled();
    // Events still mirrored (ReplacingMergeTree is idempotent by key).
    expect(hf.insertHfEvents).toHaveBeenCalledTimes(1);
    expect(res.reason).toBe('points_already_mirrored');
  });

  it('never throws — swallows downstream insert errors', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf({
      insertHfPoints: jest.fn().mockRejectedValue(new Error('clickhouse down')),
    });
    const svc = new HfMirrorService(hf);
    const res = await svc.mirrorTripHf(baseParams);
    expect(res.mirrored).toBe(false);
    expect(res.reason).toBe('error');
  });

  it('mirrors extended evidence fields when present on readings', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf();
    const svc = new HfMirrorService(hf);
    await svc.mirrorTripHf({
      ...baseParams,
      readings: [
        makeReading({
          socPercent: 80,
          odometerKm: 1000,
          exteriorAirTempC: 12,
        }),
      ],
    });
    const points = (hf.insertHfPoints as jest.Mock).mock.calls[0][0];
    const names = points.map((p: { signalName: string }) => p.signalName);
    expect(names).toContain('powertrainTractionBatteryStateOfChargeCurrent');
    expect(names).toContain('powertrainTransmissionTravelledDistance');
    expect(names).toContain('exteriorAirTemperature');
  });
});
