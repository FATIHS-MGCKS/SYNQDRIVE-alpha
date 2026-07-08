import { TripEvidenceReadService } from './trip-evidence-read.service';
import type { ClickHouseService } from './clickhouse.service';
import type { ClickHouseHfService } from './clickhouse-hf.service';
import type { SignalQualityReadService } from './signal-quality-read.service';

describe('TripEvidenceReadService', () => {
  const baseParams = {
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    startTime: new Date('2026-06-25T10:00:00.000Z'),
    endTime: new Date('2026-06-25T11:00:00.000Z'),
  };

  function makeService(over: {
    ch?: Partial<ClickHouseService>;
    hf?: Partial<ClickHouseHfService>;
    sq?: Partial<SignalQualityReadService>;
  } = {}) {
    const clickHouse = {
      isConfigured: true,
      isAvailable: true,
      getClient: jest.fn(),
      ...over.ch,
    } as unknown as ClickHouseService;

    const clickHouseHf = {
      countTripHfEvents: jest.fn().mockResolvedValue(2),
      getTripLastEvidenceAt: jest.fn().mockResolvedValue('2026-06-25T11:00:00.000Z'),
      getTripHfWindows: jest.fn().mockResolvedValue({ available: true, windows: [], tripId: 'trip-1', vehicleId: 'veh-1' }),
      ...over.hf,
    } as unknown as ClickHouseHfService;

    const signalQualityRead = {
      getTripSignalQuality: jest.fn().mockResolvedValue({
        available: true,
        degraded: false,
        overallQuality: 'good',
        hfAvailability: 'hf_available',
        signalCoverage: [],
        missingKeySignals: [],
        detectorFeasibilityHints: [],
        windowCount: 1,
        hfPointCount: 50,
        reasons: [],
        internalDebug: true,
        readOnly: true,
      }),
      ...over.sq,
    } as unknown as SignalQualityReadService;

    const svc = new TripEvidenceReadService(clickHouse, clickHouseHf, signalQualityRead);
    return { svc, clickHouse, clickHouseHf, signalQualityRead };
  }

  const ORIGINAL_FLAG = process.env.HF_MIRROR_ENABLED;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.HF_MIRROR_ENABLED;
    else process.env.HF_MIRROR_ENABLED = ORIGINAL_FLAG;
  });

  it('returns degraded evidence when ClickHouse is down', async () => {
    const { svc } = makeService({
      ch: { isAvailable: false, isConfigured: true },
    });
    const result = await svc.getTripClickHouseEvidence(baseParams);
    expect(result.degraded).toBe(true);
    expect(result.clickhouseStatus).toBe('degraded');
    expect(result.evidenceAvailable).toBe(false);
    expect(result.readOnly).toBe(true);
  });

  it('returns evidence when CH has mirrored data', async () => {
    process.env.HF_MIRROR_ENABLED = 'true';
    const { svc, clickHouse } = makeService();
    (clickHouse.getClient as jest.Mock).mockReturnValue({
      query: jest.fn().mockResolvedValue({
        json: async () => [{ cnt: 12 }],
      }),
    });
    const result = await svc.getTripClickHouseEvidence(baseParams);
    expect(result.evidenceAvailable).toBe(true);
    expect(result.hfPointCount).toBe(50);
    expect(result.hfEventCount).toBe(2);
    expect(result.evidenceSummary.length).toBeGreaterThan(0);
  });

  it('marks mirror_disabled when HF_MIRROR_ENABLED is off', async () => {
    delete process.env.HF_MIRROR_ENABLED;
    const { svc, clickHouse } = makeService();
    (clickHouse.getClient as jest.Mock).mockReturnValue({
      query: jest.fn().mockResolvedValue({
        json: async () => [{ cnt: 0 }],
      }),
    });
    const result = await svc.getTripClickHouseEvidence(baseParams);
    expect(result.clickhouseStatus).toBe('mirror_disabled');
  });
});
