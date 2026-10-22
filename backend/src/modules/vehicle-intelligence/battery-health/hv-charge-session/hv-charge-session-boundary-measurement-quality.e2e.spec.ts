import { BatteryMeasurementQuality } from '@prisma/client';
import { normalizeDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import {
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures';
import {
  evaluateHvMeasurementQualitySession,
  mapSessionToM3Input,
  mapSessionToQualityAssessment,
} from '../hv-measurement-quality/hv-measurement-quality.policy';
import { evaluateHvM3SessionGate } from '../hv-capacity-shadow/hv-capacity-m3.policy';
import { HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE } from './hv-charge-session-boundary-snapshot.constants';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from './hv-charge-session-quality.status';
import {
  applyHvChargeSessionBoundaryEvidenceToDraft,
  mapRechargeSegmentToHvChargeSessionDraft,
} from './hv-charge-session.mapper';
import { mergeHvChargeSessionUpdate } from './hv-charge-session.merge';
import {
  resolveHvChargeSessionBoundaryFromSnapshots,
  type HvChargeSessionBoundarySnapshotRow,
} from './hv-charge-session-boundary-snapshot.policy';
import type { HvChargeSessionRow } from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from './hv-charge-session.types';

function segmentFour() {
  const raw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2.data.segments[0];
  return normalizeDimoRechargeSegment(TESLA_RECHARGE_AUDIT_TOKEN_ID, raw)!;
}

function snapshotRow(input: {
  recordedAt: Date;
  socPercent: number;
  energyUsedKwh: number;
  energyObservedAt: Date;
}): HvChargeSessionBoundarySnapshotRow {
  return {
    recordedAt: input.recordedAt,
    providerReceivedAt: input.recordedAt,
    socPercent: input.socPercent,
    energyUsedKwh: input.energyUsedKwh,
    energyObservedAt: input.energyObservedAt,
    isCharging: true,
    chargingCableConnected: true,
    idempotencyKey: `snap-${input.recordedAt.toISOString()}`,
  };
}

describe('HV boundary enrichment → persist merge → measurement quality → M3 gate (e2e)', () => {
  const assessedAt = new Date('2026-06-22T06:00:00.000Z');
  const segment = segmentFour();

  it('full pipeline: enriched session passes measurement quality and M3 gate', () => {
    const base = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      segment,
      reconciledAt: assessedAt,
    });
    expect(base.metadata.socProvenance).toBe('SEGMENT_EXTREMA');

    const snapshots = [
      snapshotRow({
        recordedAt: new Date('2026-06-21T19:01:00.000Z'),
        socPercent: 35,
        energyUsedKwh: 19.5,
        energyObservedAt: new Date('2026-06-21T19:01:00.000Z'),
      }),
      snapshotRow({
        recordedAt: new Date('2026-06-22T05:35:00.000Z'),
        socPercent: 62.4,
        energyUsedKwh: 34,
        energyObservedAt: new Date('2026-06-22T05:35:00.000Z'),
      }),
    ];

    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots,
      sessionStartAt: base.startAt,
      sessionEndAt: base.endAt,
      isOngoing: false,
      assessedAt,
    });
    expect(resolution.kind).toBe('full');

    const enriched =
      resolution.kind === 'full'
        ? applyHvChargeSessionBoundaryEvidenceToDraft({
            draft: base,
            segment,
            evidence: resolution.evidence,
            assessedAt,
          })
        : base;

    expect(enriched.metadata.socProvenance).toBe(HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE);
    expect(enriched.metadata.currentEnergyProvenance).toBe(
      HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE,
    );
    expect(enriched.metadata.addedEnergyProvenance).toBe('SEGMENT_EXTREMA');
    expect(enriched.metadata.qualityStatus).toBe(HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED);

    const existingRow: HvChargeSessionRow = {
      id: 'sess-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      segmentFingerprint: enriched.segmentFingerprint,
      dimoSegmentId: enriched.dimoSegmentId,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt: enriched.startAt,
      endAt: enriched.endAt,
      startSocPercent: base.startSocPercent,
      endSocPercent: base.endSocPercent,
      startEnergyKwh: base.startEnergyKwh,
      endEnergyKwh: base.endEnergyKwh,
      energyAddedKwh: base.energyAddedKwh,
      deltaSocPercent: base.deltaSocPercent,
      isOngoing: false,
      quality: BatteryMeasurementQuality.SHADOW,
      idempotencyKey: enriched.idempotencyKey,
      providerObservedAt: enriched.providerObservedAt,
      metadata: base.metadata as object,
    };

    const merged = mergeHvChargeSessionUpdate({
      existing: existingRow,
      incoming: enriched,
      reconciledAt: assessedAt,
    });
    expect(merged.changed).toBe(true);
    const persisted = {
      ...existingRow,
      ...merged.update,
      startSocPercent: enriched.startSocPercent,
      endSocPercent: enriched.endSocPercent,
      startEnergyKwh: enriched.startEnergyKwh,
      endEnergyKwh: enriched.endEnergyKwh,
      deltaSocPercent: enriched.deltaSocPercent,
      quality: enriched.quality,
      metadata: merged.update?.metadata ?? enriched.metadata,
    };

    const mqInput = {
      sessionId: persisted.id,
      startAt: persisted.startAt,
      endAt: persisted.endAt,
      source: persisted.source,
      isOngoing: persisted.isOngoing,
      startSocPercent: persisted.startSocPercent,
      endSocPercent: persisted.endSocPercent,
      startEnergyKwh: persisted.startEnergyKwh,
      endEnergyKwh: persisted.endEnergyKwh,
      energyAddedKwh: persisted.energyAddedKwh,
      deltaSocPercent: persisted.deltaSocPercent,
      measurementQuality: persisted.quality ?? BatteryMeasurementQuality.SHADOW,
      metadata: persisted.metadata as Record<string, unknown>,
    };

    const qualityAssessment = mapSessionToQualityAssessment(mqInput);
    expect(qualityAssessment.capacityValidationEligible).toBe(true);
    expect(qualityAssessment.reasonCodes).not.toContain('soc_extrema_proxy');
    expect(qualityAssessment.reasonCodes).not.toContain('energy_extrema_proxy');

    const mqResult = evaluateHvMeasurementQualitySession(mqInput, new Set());
    expect(mqResult.m3GateEligible).toBe(true);
    expect(mqResult.qualityLevel).toBe('Q3');

    const m3Gate = evaluateHvM3SessionGate(mapSessionToM3Input(mqInput, qualityAssessment));
    expect(m3Gate.eligible).toBe(true);
    expect(m3Gate.reasonCodes).toHaveLength(0);
  });

  it('missing energyObservedAt blocks enrichment and keeps PARTIAL / M3 fail', () => {
    const base = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      segment,
      reconciledAt: assessedAt,
    });
    const snapshots: HvChargeSessionBoundarySnapshotRow[] = [
      {
        recordedAt: new Date('2026-06-21T19:01:00.000Z'),
        providerReceivedAt: new Date('2026-06-21T19:01:00.000Z'),
        socPercent: 35,
        energyUsedKwh: 19.5,
        energyObservedAt: null,
        isCharging: true,
        chargingCableConnected: true,
        idempotencyKey: 'a',
      },
      snapshotRow({
        recordedAt: new Date('2026-06-22T05:35:00.000Z'),
        socPercent: 62.4,
        energyUsedKwh: 34,
        energyObservedAt: new Date('2026-06-22T05:35:00.000Z'),
      }),
    ];
    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots,
      sessionStartAt: base.startAt,
      sessionEndAt: base.endAt,
      isOngoing: false,
      assessedAt,
    });
    expect(resolution.kind).toBe('none');

    const mqInput = {
      sessionId: 'sess-partial',
      startAt: base.startAt,
      endAt: base.endAt,
      source: base.source,
      isOngoing: false,
      startSocPercent: base.startSocPercent,
      endSocPercent: base.endSocPercent,
      startEnergyKwh: base.startEnergyKwh,
      endEnergyKwh: base.endEnergyKwh,
      energyAddedKwh: base.energyAddedKwh,
      deltaSocPercent: base.deltaSocPercent,
      measurementQuality: base.quality ?? BatteryMeasurementQuality.SHADOW,
      metadata: { ...base.metadata } as Record<string, unknown>,
    };
    const result = evaluateHvMeasurementQualitySession(mqInput, new Set());
    expect(result.m3GateEligible).toBe(false);
    expect(result.qualityLevel).toBe('Q2');
  });

  it('ADDED_ENERGY_RESET remains blocked through measurement quality', () => {
    const base = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      segment,
      reconciledAt: assessedAt,
    });
    const enriched = applyHvChargeSessionBoundaryEvidenceToDraft({
      draft: {
        ...base,
        metadata: {
          ...base.metadata,
          segmentAddedEnergyMinKwh: 3.5,
        },
      },
      segment: {
        ...segment,
        addedEnergyKwh: { ...segment.addedEnergyKwh, min: 3.5 },
      },
      evidence: {
        provenance: HV_CHARGE_SESSION_SNAPSHOT_BOUNDARY_PROVENANCE,
        start: {
          socPercent: 35,
          energyUsedKwh: 19.5,
          socObservedAt: new Date(segment.startAt),
          energyObservedAt: new Date(segment.startAt),
          snapshotRecordedAt: new Date(segment.startAt),
          offsetFromBoundaryMs: 0,
        },
        end: {
          socPercent: 62.4,
          energyUsedKwh: 34,
          socObservedAt: new Date(segment.endAt!),
          energyObservedAt: new Date(segment.endAt!),
          snapshotRecordedAt: new Date(segment.endAt!),
          offsetFromBoundaryMs: 0,
        },
        deltaSocPercent: 27.4,
      },
      assessedAt,
    });
    expect(enriched.metadata.qualityStatus).toBe(
      HV_CHARGE_SESSION_QUALITY_STATUS.ADDED_ENERGY_RESET,
    );

    const mqInput = {
      sessionId: 'sess-reset',
      startAt: enriched.startAt,
      endAt: enriched.endAt,
      source: enriched.source,
      isOngoing: false,
      startSocPercent: enriched.startSocPercent,
      endSocPercent: enriched.endSocPercent,
      startEnergyKwh: enriched.startEnergyKwh,
      endEnergyKwh: enriched.endEnergyKwh,
      energyAddedKwh: enriched.energyAddedKwh,
      deltaSocPercent: enriched.deltaSocPercent,
      measurementQuality: enriched.quality ?? BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
      metadata: { ...enriched.metadata } as Record<string, unknown>,
    };
    const result = evaluateHvMeasurementQualitySession(mqInput, new Set());
    expect(result.qualityLevel).toBe('Q1');
    expect(result.m3GateEligible).toBe(false);
  });

  it('second ingest merge is idempotent for snapshot-enriched session', () => {
    const base = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      segment,
      reconciledAt: assessedAt,
    });
    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots: [
        snapshotRow({
          recordedAt: new Date('2026-06-21T19:01:00.000Z'),
          socPercent: 35,
          energyUsedKwh: 19.5,
          energyObservedAt: new Date('2026-06-21T19:01:00.000Z'),
        }),
        snapshotRow({
          recordedAt: new Date('2026-06-22T05:35:00.000Z'),
          socPercent: 62.4,
          energyUsedKwh: 34,
          energyObservedAt: new Date('2026-06-22T05:35:00.000Z'),
        }),
      ],
      sessionStartAt: base.startAt,
      sessionEndAt: base.endAt,
      isOngoing: false,
      assessedAt,
    });
    expect(resolution.kind).toBe('full');
    const enriched =
      resolution.kind === 'full'
        ? applyHvChargeSessionBoundaryEvidenceToDraft({
            draft: base,
            segment,
            evidence: resolution.evidence,
            assessedAt,
          })
        : base;

    const existingRow: HvChargeSessionRow = {
      id: 'sess-2',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      segmentFingerprint: enriched.segmentFingerprint,
      dimoSegmentId: enriched.dimoSegmentId,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt: enriched.startAt,
      endAt: enriched.endAt,
      startSocPercent: enriched.startSocPercent,
      endSocPercent: enriched.endSocPercent,
      startEnergyKwh: enriched.startEnergyKwh,
      endEnergyKwh: enriched.endEnergyKwh,
      energyAddedKwh: enriched.energyAddedKwh,
      deltaSocPercent: enriched.deltaSocPercent,
      isOngoing: false,
      quality: enriched.quality,
      idempotencyKey: enriched.idempotencyKey,
      providerObservedAt: enriched.providerObservedAt,
      metadata: enriched.metadata as object,
    };

    const replay = mergeHvChargeSessionUpdate({
      existing: existingRow,
      incoming: enriched,
      reconciledAt: assessedAt,
    });
    expect(replay.changed).toBe(false);
    expect(replay.changeKind).toBe('no_op');
  });
});
