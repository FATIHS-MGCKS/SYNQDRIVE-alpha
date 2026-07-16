import { BatteryMeasurementQuality } from '@prisma/client';
import { normalizeDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import {
  TESLA_RECHARGE_AUDIT_ONGOING_SEGMENT,
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures';
import { mapRechargeSegmentToHvChargeSessionDraft } from './hv-charge-session.mapper';
import { mergeHvChargeSessionUpdate } from './hv-charge-session.merge';
import { assessHvChargeSessionQuality } from './hv-charge-session.quality';
import { HvChargeSessionPersistService } from './hv-charge-session-persist.service';
import type { HvChargeSessionRow } from './hv-charge-session.types';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

function completedSegment() {
  return normalizeDimoRechargeSegment(
    TESLA_RECHARGE_AUDIT_TOKEN_ID,
    TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0],
  )!;
}

function ongoingSegment() {
  return normalizeDimoRechargeSegment(
    TESLA_RECHARGE_AUDIT_TOKEN_ID,
    TESLA_RECHARGE_AUDIT_ONGOING_SEGMENT.data.segments[0],
  )!;
}

describe('hv-charge-session mapper', () => {
  it('maps normalized recharge segment to HvChargeSession draft', () => {
    const segment = completedSegment();
    const reconciledAt = new Date('2026-07-16T12:00:00.000Z');
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: ORG,
      vehicleId: VEH,
      segment,
      reconciledAt,
    });

    expect(draft.source).toBe('DIMO_RECHARGE_SEGMENT');
    expect(draft.segmentFingerprint).toBe(segment.fingerprint);
    expect(draft.metadata.providerSegmentFingerprint).toBe(segment.fingerprint);
    expect(draft.startSocPercent).toBe(41.2);
    expect(draft.endSocPercent).toBe(48.5);
    expect(draft.deltaSocPercent).toBeCloseTo(7.3, 1);
    expect(draft.energyAddedKwh).toBeCloseTo(13.92, 2);
    expect(draft.isOngoing).toBe(false);
    expect(draft.quality).toBe(BatteryMeasurementQuality.SHADOW);
    expect(draft.metadata.qualityStatus).toBe('PARTIAL');
    expect(draft.metadata.capacityShadowEligible).toBe(true);
  });
});

describe('hv-charge-session merge', () => {
  it('creates merge no-op for identical completed session', () => {
    const segment = completedSegment();
    const reconciledAt = new Date('2026-07-16T12:00:00.000Z');
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: ORG,
      vehicleId: VEH,
      segment,
      reconciledAt,
    });
    const existing: HvChargeSessionRow = {
      id: 'session-1',
      organizationId: ORG,
      vehicleId: VEH,
      segmentFingerprint: draft.segmentFingerprint,
      dimoSegmentId: draft.dimoSegmentId,
      source: draft.source,
      startAt: draft.startAt,
      endAt: draft.endAt,
      startSocPercent: draft.startSocPercent,
      endSocPercent: draft.endSocPercent,
      startEnergyKwh: draft.startEnergyKwh,
      endEnergyKwh: draft.endEnergyKwh,
      energyAddedKwh: draft.energyAddedKwh,
      deltaSocPercent: draft.deltaSocPercent,
      isOngoing: false,
      quality: draft.quality,
      idempotencyKey: draft.idempotencyKey,
      providerObservedAt: draft.providerObservedAt,
      metadata: draft.metadata as object,
    };

    const merged = mergeHvChargeSessionUpdate({ existing, incoming: draft, reconciledAt });
    expect(merged.changed).toBe(false);
    expect(merged.changeKind).toBe('no_op');
  });

  it('completes ongoing session without changing start anchors', () => {
    const ongoing = ongoingSegment();
    const ongoingDraft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: ORG,
      vehicleId: VEH,
      segment: ongoing,
    });

    const completed = completedSegment();
    const completedDraft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: ORG,
      vehicleId: VEH,
      segment: {
        ...completed,
        fingerprint: ongoing.fingerprint,
        segmentId: ongoing.segmentId,
        startAt: ongoing.startAt,
        soc: { min: ongoing.soc.min, max: completed.soc.max, delta: completed.soc.delta },
      },
    });

    const existing: HvChargeSessionRow = {
      id: 'session-ongoing',
      organizationId: ORG,
      vehicleId: VEH,
      segmentFingerprint: ongoingDraft.segmentFingerprint,
      dimoSegmentId: ongoingDraft.dimoSegmentId,
      source: ongoingDraft.source,
      startAt: ongoingDraft.startAt,
      endAt: null,
      startSocPercent: ongoingDraft.startSocPercent,
      endSocPercent: null,
      startEnergyKwh: ongoingDraft.startEnergyKwh,
      endEnergyKwh: null,
      energyAddedKwh: null,
      deltaSocPercent: null,
      isOngoing: true,
      quality: BatteryMeasurementQuality.SHADOW,
      idempotencyKey: ongoingDraft.idempotencyKey,
      providerObservedAt: ongoingDraft.providerObservedAt,
      metadata: ongoingDraft.metadata as object,
    };

    const merged = mergeHvChargeSessionUpdate({
      existing,
      incoming: completedDraft,
    });

    expect(merged.changed).toBe(true);
    expect(merged.changeKind).toBe('completed');
    expect(merged.update?.startAt).toBeUndefined();
    expect(merged.update?.startSocPercent).toBeUndefined();
    expect(merged.update?.isOngoing).toBe(false);
    expect(merged.update?.endAt).toEqual(completedDraft.endAt);
  });

  it('rejects regressing completed session with weaker provider data', () => {
    const segment = completedSegment();
    const reconciledAt = new Date('2026-07-16T12:00:00.000Z');
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: ORG,
      vehicleId: VEH,
      segment,
      reconciledAt,
    });

    const existing: HvChargeSessionRow = {
      ...draft,
      id: 'session-complete',
      endSocPercent: 50,
      deltaSocPercent: 10,
      quality: BatteryMeasurementQuality.VALID,
      isOngoing: false,
      metadata: draft.metadata as object,
    };

    const weakerDraft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: ORG,
      vehicleId: VEH,
      segment: {
        ...segment,
        soc: { min: 41.2, max: 45, delta: 3.8 },
        endAt: segment.endAt,
        ongoing: false,
      },
      reconciledAt,
    });

    const merged = mergeHvChargeSessionUpdate({
      existing,
      incoming: weakerDraft,
      reconciledAt,
    });

    expect(merged.changed).toBe(false);
  });

  it('accepts better provider data for completed session', () => {
    const segment = completedSegment();
    const reconciledAt = new Date('2026-07-16T12:00:00.000Z');
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: ORG,
      vehicleId: VEH,
      segment,
      reconciledAt,
    });

    const existing: HvChargeSessionRow = {
      id: 'session-complete',
      organizationId: ORG,
      vehicleId: VEH,
      segmentFingerprint: draft.segmentFingerprint,
      dimoSegmentId: draft.dimoSegmentId,
      source: draft.source,
      startAt: draft.startAt,
      endAt: draft.endAt,
      startSocPercent: draft.startSocPercent,
      endSocPercent: 45,
      startEnergyKwh: draft.startEnergyKwh,
      endEnergyKwh: null,
      energyAddedKwh: null,
      deltaSocPercent: 5,
      isOngoing: false,
      quality: BatteryMeasurementQuality.INSUFFICIENT_COVERAGE,
      idempotencyKey: draft.idempotencyKey,
      providerObservedAt: draft.providerObservedAt,
      metadata: draft.metadata as object,
    };

    const merged = mergeHvChargeSessionUpdate({ existing, incoming: draft, reconciledAt });
    expect(merged.changed).toBe(true);
    expect(merged.update?.endSocPercent).toBe(draft.endSocPercent);
    expect(merged.update?.quality).toBe(BatteryMeasurementQuality.SHADOW);
  });
});

describe('HvChargeSessionPersistService', () => {
  const repository = {
    findByFingerprint: jest.fn(),
    findBySource: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
  };
  const observability = { log: jest.fn() };
  const capacityShadowProducer = {
    maybeEnqueueAfterSessionPersist: jest.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findBySource.mockResolvedValue([]);
  });

  it('creates new session for unseen segment', async () => {
    repository.findByFingerprint.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'new-session' });

    const service = new HvChargeSessionPersistService(
      repository as never,
      observability as never,
      capacityShadowProducer as never,
    );

    const segment = completedSegment();
    const result = await service.persistRechargeSegment({
      organizationId: ORG,
      vehicleId: VEH,
      segment,
    });

    expect(result.created).toBe(true);
    expect(result.changeKind).toBe('created');
    expect(repository.create).toHaveBeenCalled();
    expect(observability.log).toHaveBeenCalled();
  });

  it('updates ongoing session when provider completes segment', async () => {
    const segment = ongoingSegment();
    const reconciledAt = new Date('2026-07-16T12:00:00.000Z');
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: ORG,
      vehicleId: VEH,
      segment,
      reconciledAt,
    });

    repository.findByFingerprint.mockResolvedValue({
      id: 'session-ongoing',
      ...draft,
      isOngoing: true,
      endAt: null,
      endSocPercent: null,
    });
    repository.update.mockResolvedValue({ id: 'session-ongoing', isOngoing: false });

    const completed = completedSegment();
    const service = new HvChargeSessionPersistService(
      repository as never,
      observability as never,
      capacityShadowProducer as never,
    );

    const result = await service.persistRechargeSegment({
      organizationId: ORG,
      vehicleId: VEH,
      segment: {
        ...completed,
        fingerprint: segment.fingerprint,
        segmentId: segment.segmentId,
        startAt: segment.startAt,
        ongoing: false,
      },
    });

    expect(result.changed).toBe(true);
    expect(result.changeKind).toBe('completed');
    expect(repository.update).toHaveBeenCalled();
  });
});

describe('assessHvChargeSessionQuality', () => {
  it('marks audit session 1 as PARTIAL shadow quality', () => {
    const quality = assessHvChargeSessionQuality(completedSegment());
    expect(quality).toBe(BatteryMeasurementQuality.SHADOW);
  });

  it('marks ongoing segment as SHADOW', () => {
    const quality = assessHvChargeSessionQuality(ongoingSegment());
    expect(quality).toBe(BatteryMeasurementQuality.SHADOW);
  });
});
