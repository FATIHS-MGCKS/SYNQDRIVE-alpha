import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { HvChargeSessionDraft } from './hv-charge-session.types';
import {
  HV_CHARGE_SESSION_BOUNDARY_QUERY_PADDING_MS,
  HV_CHARGE_SESSION_BOUNDARY_SNAPSHOT_QUERY_LIMIT,
} from './hv-charge-session-boundary-snapshot.constants';
import {
  resolveHvChargeSessionBoundaryFromSnapshots,
  type HvChargeSessionBoundarySnapshotRow,
} from './hv-charge-session-boundary-snapshot.policy';
import { applyHvChargeSessionBoundaryEvidenceToDraft } from './hv-charge-session.mapper';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';

@Injectable()
export class HvChargeSessionBoundaryEnrichmentService {
  private readonly logger = new Logger(HvChargeSessionBoundaryEnrichmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enrichDraftFromSnapshots(input: {
    vehicleId: string;
    segment: NormalizedDimoRechargeSegment;
    draft: HvChargeSessionDraft;
    assessedAt?: Date;
  }): Promise<HvChargeSessionDraft> {
    const assessedAt = input.assessedAt ?? new Date();
    const startAt = input.draft.startAt;
    const endAt = input.draft.endAt;

    if (input.draft.isOngoing || !endAt) {
      return input.draft;
    }

    const queryFrom = new Date(
      startAt.getTime() - HV_CHARGE_SESSION_BOUNDARY_QUERY_PADDING_MS,
    );
    const queryTo = new Date(endAt.getTime() + HV_CHARGE_SESSION_BOUNDARY_QUERY_PADDING_MS);

    const rows = await this.prisma.hvBatteryHealthSnapshot.findMany({
      where: {
        vehicleId: input.vehicleId,
        recordedAt: { gte: queryFrom, lte: queryTo },
      },
      orderBy: { recordedAt: 'asc' },
      take: HV_CHARGE_SESSION_BOUNDARY_SNAPSHOT_QUERY_LIMIT,
      select: {
        recordedAt: true,
        providerReceivedAt: true,
        socPercent: true,
        energyUsedKwh: true,
        energyObservedAt: true,
        isCharging: true,
        chargingCableConnected: true,
        idempotencyKey: true,
      },
    });

    const snapshots: HvChargeSessionBoundarySnapshotRow[] = rows.map((row) => ({
      recordedAt: row.recordedAt,
      providerReceivedAt: row.providerReceivedAt,
      socPercent: row.socPercent,
      energyUsedKwh: row.energyUsedKwh,
      energyObservedAt: row.energyObservedAt,
      isCharging: row.isCharging,
      chargingCableConnected: row.chargingCableConnected,
      idempotencyKey: row.idempotencyKey,
    }));

    const resolution = resolveHvChargeSessionBoundaryFromSnapshots({
      snapshots,
      sessionStartAt: startAt,
      sessionEndAt: endAt,
      isOngoing: input.draft.isOngoing,
      assessedAt,
    });

    if (resolution.kind !== 'full') {
      this.logger.debug(
        `HV boundary enrichment skipped vehicle=${input.vehicleId} fingerprint=${input.draft.segmentFingerprint} reason=${resolution.reason}`,
      );
      return input.draft;
    }

    return applyHvChargeSessionBoundaryEvidenceToDraft({
      draft: input.draft,
      segment: input.segment,
      evidence: resolution.evidence,
      assessedAt,
    });
  }
}
