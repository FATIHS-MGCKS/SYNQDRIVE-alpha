import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import { EventContextEnrichmentService } from './event-context-enrichment.service';

const ANCHOR = new Date('2026-06-26T12:00:00.000Z');

function reading(offsetS: number, over: Partial<HighFrequencyReading> = {}): HighFrequencyReading {
  return {
    timestamp: new Date(ANCHOR.getTime() + offsetS * 1000).toISOString(),
    speedKmh: 30,
    rpm: 1500,
    throttlePosition: 20,
    engineLoad: 35,
    engineCoolantTempC: 88,
    tractionBatteryPowerKw: null,
    ...over,
  };
}

function denseReadings(): HighFrequencyReading[] {
  const out: HighFrequencyReading[] = [];
  for (let s = -10; s <= 10; s++) out.push(reading(s));
  return out;
}

interface MockPrisma {
  drivingEvent: { findUnique: jest.Mock; update: jest.Mock };
}

function makeService(opts: {
  hf?: HighFrequencyReading[];
  hfError?: Error;
  event?: any;
  existingMetadata?: any;
}) {
  const segments = {
    fetchHighFrequency: jest.fn(async () => {
      if (opts.hfError) throw opts.hfError;
      return opts.hf ?? [];
    }),
  };
  const prisma: MockPrisma = {
    drivingEvent: {
      findUnique: jest.fn(async () => {
        if (opts.event === null) return null;
        return (
          opts.event ?? {
            id: 'ev-1',
            recordedAt: ANCHOR,
            metadataJson: opts.existingMetadata ?? null,
            vehicle: {
              hardwareType: 'LTE_R1',
              fuelType: 'GASOLINE',
              dimoVehicle: { tokenId: 4242 },
            },
          }
        );
      }),
      update: jest.fn(async () => ({})),
    },
  };
  const service = new EventContextEnrichmentService(prisma as any, segments as any);
  return { service, prisma, segments };
}

describe('EventContextEnrichmentService', () => {
  it('fetches a T-30s..T+30s window for native behavior anchors', async () => {
    const { service, segments } = makeService({ hf: denseReadings() });
    const assessment = await service.enrichAnchorContext({
      anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
      anchorTimestamp: ANCHOR,
      tokenId: 4242,
      engineSignalsApplicable: true,
    });

    expect(segments.fetchHighFrequency).toHaveBeenCalledTimes(1);
    const [token, start, end] = segments.fetchHighFrequency.mock.calls[0] as unknown as [
      number,
      Date,
      Date,
    ];
    expect(token).toBe(4242);
    expect(start.toISOString()).toBe('2026-06-26T11:59:30.000Z');
    expect(end.toISOString()).toBe('2026-06-26T12:00:30.000Z');
    expect(assessment.status).toBe('COMPLETED');
    expect(assessment.anchorType).toBe('DIMO_NATIVE_BEHAVIOR_EVENT');
  });

  it('fetches a T-30s..T+90s window for RPM webhook candidates', async () => {
    const { service, segments } = makeService({ hf: denseReadings() });
    await service.enrichAnchorContext({
      anchorType: 'RPM_WEBHOOK_CANDIDATE',
      anchorTimestamp: ANCHOR,
      tokenId: 4242,
      engineSignalsApplicable: true,
    });
    const [, start, end] = segments.fetchHighFrequency.mock.calls[0] as unknown as [
      number,
      Date,
      Date,
    ];
    expect(start.toISOString()).toBe('2026-06-26T11:59:30.000Z');
    expect(end.toISOString()).toBe('2026-06-26T12:01:30.000Z');
  });

  it('returns INSUFFICIENT_CONTEXT when no readings are returned', async () => {
    const { service } = makeService({ hf: [] });
    const assessment = await service.enrichAnchorContext({
      anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
      anchorTimestamp: ANCHOR,
      tokenId: 4242,
      engineSignalsApplicable: true,
    });
    expect(assessment.status).toBe('INSUFFICIENT_CONTEXT');
    expect(assessment.preliminaryClassifications).toContain('INSUFFICIENT_CONTEXT');
    expect(assessment.evidenceGrade).toBe('D');
  });

  it('returns FAILED (and does not throw) when the HF query fails', async () => {
    const { service } = makeService({ hfError: new Error('DIMO 500') });
    const assessment = await service.enrichAnchorContext({
      anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
      anchorTimestamp: ANCHOR,
      tokenId: 4242,
      engineSignalsApplicable: true,
    });
    expect(assessment.status).toBe('FAILED');
    expect(assessment.error).toContain('DIMO 500');
  });

  it('enriches an LTE_R1 ICE driving event and persists the assessment', async () => {
    const { service, prisma, segments } = makeService({ hf: denseReadings() });
    const assessment = await service.enrichDrivingEventContext('ev-1');

    expect(segments.fetchHighFrequency).toHaveBeenCalledTimes(1);
    expect(prisma.drivingEvent.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.drivingEvent.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'ev-1' });
    expect(updateArg.data.metadataJson.contextAssessment).toBeDefined();
    expect(assessment.status).toBe('COMPLETED');
  });

  it('skips ICE context for a Tesla/EV event without fetching HF', async () => {
    const { service, prisma, segments } = makeService({
      event: {
        id: 'ev-ev',
        recordedAt: ANCHOR,
        metadataJson: null,
        vehicle: {
          hardwareType: 'LTE_R1',
          fuelType: 'ELECTRIC',
          dimoVehicle: { tokenId: 99 },
        },
      },
    });
    const assessment = await service.enrichDrivingEventContext('ev-ev');

    expect(segments.fetchHighFrequency).not.toHaveBeenCalled();
    expect(assessment.status).toBe('SKIPPED_NOT_APPLICABLE');
    expect(assessment.engineSignalsApplicable).toBe(false);
    // Native event row is still updated only with the (skipped) assessment.
    expect(prisma.drivingEvent.update).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: re-persisting merges and preserves existing metadata keys', async () => {
    const { service, prisma } = makeService({
      existingMetadata: { dimoEventName: 'behavior.harshAcceleration', classification: 'HARD' },
    });

    const assessment = {
      version: 1,
      status: 'COMPLETED' as const,
      anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT' as const,
      anchorTimestamp: ANCHOR.toISOString(),
      windowStart: ANCHOR.toISOString(),
      windowEnd: ANCHOR.toISOString(),
      engineSignalsApplicable: true,
      engineOnHint: true,
      dataQuality: {
        sampleCount: 0,
        medianIntervalMs: null,
        p95IntervalMs: null,
        maxGapMs: null,
        nearestSampleToAnchorMs: null,
        coverage: [],
      },
      signalCoverage: [],
      speedContext: {} as any,
      rpmContext: {} as any,
      throttleContext: {} as any,
      engineLoadContext: {} as any,
      coolantContext: {} as any,
      reasonCodes: [],
      preliminaryClassifications: [],
      confidence: 'LOW' as const,
      evidenceGrade: 'C' as const,
      generatedAt: ANCHOR.toISOString(),
      error: null,
    };

    await service.persistContextAssessment('ev-1', assessment);
    await service.persistContextAssessment('ev-1', assessment);

    expect(prisma.drivingEvent.update).toHaveBeenCalledTimes(2);
    const lastUpdate = prisma.drivingEvent.update.mock.calls[1][0];
    // Existing native-event metadata is preserved alongside the assessment.
    expect(lastUpdate.data.metadataJson.dimoEventName).toBe('behavior.harshAcceleration');
    expect(lastUpdate.data.metadataJson.classification).toBe('HARD');
    expect(lastUpdate.data.metadataJson.contextAssessment).toBeDefined();
  });

  it('derives the anchor event category from the native eventType', async () => {
    // Aggressive-start window: low pre-speed + high load + warm engine.
    const hf: HighFrequencyReading[] = [];
    for (let s = -10; s <= 10; s++) {
      hf.push(
        reading(s, {
          speedKmh: s <= 0 ? 4 : 4 + s * 6,
          rpm: 3200,
          throttlePosition: 88,
          engineLoad: 85,
          engineCoolantTempC: 88,
        }),
      );
    }
    const { service, prisma } = makeService({
      hf,
      event: {
        id: 'ev-accel',
        recordedAt: ANCHOR,
        eventType: 'HARSH_ACCELERATION',
        metadataJson: { classification: 'HARD' },
        vehicle: { hardwareType: 'LTE_R1', fuelType: 'GASOLINE', dimoVehicle: { tokenId: 4242 } },
      },
    });
    const assessment = await service.enrichDrivingEventContext('ev-accel');
    expect(assessment.anchorEvent?.category).toBe('ACCELERATION');
    expect(assessment.preliminaryClassifications).toContain('AGGRESSIVE_START');
    // contextAssessment is persisted on the native event row.
    const updateArg = prisma.drivingEvent.update.mock.calls[0][0];
    expect(updateArg.data.metadataJson.contextAssessment.anchorEvent.category).toBe('ACCELERATION');
    // Existing native metadata is preserved alongside the assessment.
    expect(updateArg.data.metadataJson.classification).toBe('HARD');
  });

  it('keeps extreme acceleration recognisable (extreme flag) and still context-enriches', async () => {
    const hf: HighFrequencyReading[] = [];
    for (let s = -10; s <= 10; s++) {
      hf.push(
        reading(s, {
          speedKmh: s <= 0 ? 1 : 1 + s * 8,
          rpm: 4200,
          throttlePosition: 95,
          engineLoad: 95,
          engineCoolantTempC: 90,
        }),
      );
    }
    const { service } = makeService({
      hf,
      event: {
        id: 'ev-extreme',
        recordedAt: ANCHOR,
        eventType: 'HARSH_ACCELERATION',
        metadataJson: { classification: 'EXTREME', dimoEventName: 'behavior.extremeAcceleration' },
        vehicle: { hardwareType: 'LTE_R1', fuelType: 'GASOLINE', dimoVehicle: { tokenId: 4242 } },
      },
    });
    const assessment = await service.enrichDrivingEventContext('ev-extreme');
    expect(assessment.anchorEvent?.extreme).toBe(true);
    expect(assessment.preliminaryClassifications).toContain('LAUNCH_LIKE_START');
  });

  it('skips non-LTE_R1 hardware (e.g. SMART5) for ICE context', async () => {
    const { service, segments } = makeService({
      event: {
        id: 'ev-smart5',
        recordedAt: ANCHOR,
        metadataJson: null,
        vehicle: {
          hardwareType: 'SMART5',
          fuelType: 'GASOLINE',
          dimoVehicle: { tokenId: 7 },
        },
      },
    });
    const assessment = await service.enrichDrivingEventContext('ev-smart5');
    expect(segments.fetchHighFrequency).not.toHaveBeenCalled();
    expect(assessment.status).toBe('SKIPPED_NOT_APPLICABLE');
  });
});
