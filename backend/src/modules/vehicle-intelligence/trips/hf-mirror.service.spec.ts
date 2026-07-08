import { HfMirrorService } from './hf-mirror.service';
import type { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
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
    bookingId: 'book-1' as string | null,
    readings: [makeReading(), makeReading({ timestamp: '2026-06-25T10:00:01.000Z', speedKmh: 55 })],
    abuseEvents: [makeAbuse()],
  };

  function makeHf(over: Partial<jest.Mocked<ClickHouseHfService>> = {}) {
    return {
      isAvailable: true,
      hasTripHfPoints: jest.fn().mockResolvedValue(false),
      insertHfPoints: jest.fn().mockResolvedValue(undefined),
      insertHfEvents: jest.fn().mockResolvedValue(undefined),
      ...over,
    } as unknown as ClickHouseHfService;
  }

  function makeMetrics() {
    return {
      hfMirrorSkipped: { inc: jest.fn() },
    } as unknown as TripMetricsService;
  }

  const ORIGINAL_FLAG = process.env.HF_MIRROR_ENABLED;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.HF_MIRROR_ENABLED;
    else process.env.HF_MIRROR_ENABLED = ORIGINAL_FLAG;
  });

  it('is a pure no-op when disabled (default)', async () => {
    delete process.env.HF_MIRROR_ENABLED;
    const hf = makeHf();
    const metrics = makeMetrics();
    const svc = new HfMirrorService(hf, metrics);
    const res = await svc.mirrorTripHf(baseParams);
    expect(res.mirrored).toBe(false);
    expect(res.reason).toBe('disabled');
    expect(hf.insertHfPoints).not.toHaveBeenCalled();
    expect(hf.insertHfEvents).not.toHaveBeenCalled();
    expect(metrics.hfMirrorSkipped.inc).toHaveBeenCalledWith({ reason: 'disabled' });
  });

  it('skips when org id is missing (tenant attribution preserved)', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf();
    const svc = new HfMirrorService(hf);
    const res = await svc.mirrorTripHf({ ...baseParams, orgId: null });
    expect(res.reason).toBe('no_org');
    expect(hf.insertHfPoints).not.toHaveBeenCalled();
  });

  it('skips cleanly when ClickHouse is unavailable', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf({ isAvailable: false });
    const metrics = makeMetrics();
    const svc = new HfMirrorService(hf, metrics);
    const res = await svc.mirrorTripHf(baseParams);
    expect(res.reason).toBe('unavailable');
    expect(hf.hasTripHfPoints).not.toHaveBeenCalled();
    expect(hf.insertHfPoints).not.toHaveBeenCalled();
    expect(metrics.hfMirrorSkipped.inc).toHaveBeenCalledWith({ reason: 'unavailable' });
  });

  it('mirrors points + events with full trip context when enabled', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf();
    const svc = new HfMirrorService(hf);
    const res = await svc.mirrorTripHf(baseParams);

    expect(res.mirrored).toBe(true);
    expect(hf.insertHfPoints).toHaveBeenCalledTimes(1);
    expect(hf.insertHfEvents).toHaveBeenCalledTimes(1);

    const points = (hf.insertHfPoints as jest.Mock).mock.calls[0][0];
    expect(points).toHaveLength(4);
    expect(points.every((p: {
      orgId: string;
      tripId: string;
      bookingId: string | null;
      tokenId: number;
      source: string;
      signalName: string;
      signalGroup: string;
      recordedAt: Date;
      quality: string;
    }) =>
      p.orgId === 'org-1' &&
      p.tripId === 'trip-1' &&
      p.bookingId === 'book-1' &&
      p.tokenId === 42 &&
      p.source === 'dimo' &&
      p.signalName &&
      p.signalGroup &&
      p.recordedAt &&
      p.quality === 'normalized',
    )).toBe(true);

    const events = (hf.insertHfEvents as jest.Mock).mock.calls[0][0];
    expect(events[0].tripId).toBe('trip-1');
    expect(events[0].bookingId).toBe('book-1');
  });

  it('leaves booking_id null when not assigned — no fake booking', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf();
    const svc = new HfMirrorService(hf);
    await svc.mirrorTripHf({ ...baseParams, bookingId: null });

    const points = (hf.insertHfPoints as jest.Mock).mock.calls[0][0];
    expect(points.every((p: { bookingId: string | null }) => p.bookingId === null)).toBe(true);
    const events = (hf.insertHfEvents as jest.Mock).mock.calls[0][0];
    expect(events[0].bookingId).toBeNull();
  });

  it('is idempotent: does not re-insert points already mirrored for the trip', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf({ hasTripHfPoints: jest.fn().mockResolvedValue(true) });
    const svc = new HfMirrorService(hf);
    const res = await svc.mirrorTripHf(baseParams);

    expect(hf.insertHfPoints).not.toHaveBeenCalled();
    expect(hf.insertHfEvents).toHaveBeenCalledTimes(1);
    expect(res.reason).toBe('points_already_mirrored');
    expect(res.mirrored).toBe(true);
  });

  it('repeated enrichment does not duplicate points', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf();
    const svc = new HfMirrorService(hf);

    await svc.mirrorTripHf(baseParams);
    (hf.hasTripHfPoints as jest.Mock).mockResolvedValue(true);
    await svc.mirrorTripHf(baseParams);

    expect(hf.insertHfPoints).toHaveBeenCalledTimes(1);
    expect(hf.insertHfEvents).toHaveBeenCalledTimes(2);
  });

  it('never throws — swallows downstream insert errors', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const hf = makeHf({
      insertHfPoints: jest.fn().mockRejectedValue(new Error('clickhouse down')),
    });
    const metrics = makeMetrics();
    const svc = new HfMirrorService(hf, metrics);
    const res = await svc.mirrorTripHf(baseParams);
    expect(res.mirrored).toBe(false);
    expect(res.reason).toBe('error');
    expect(metrics.hfMirrorSkipped.inc).toHaveBeenCalledWith({ reason: 'error' });
  });
});
