import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  isTireDs4ShadowTerminalRunId,
  TIRE_DS4_SHADOW_TERMINAL_RUN_DS4_NOT_AVAILABLE,
  TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED,
  TIRE_DS4_SHADOW_TERMINAL_RUN_IDS,
} from './tire-ds4-shadow-terminal-runs';
import { buildNeutralTireDs4ShadowInputPayloadV3 } from './tire-ds4-shadow-neutral-payload';
import type { TireDs4ShadowPersistInput } from './tire-ds4-shadow.types';

export type TireDs4ShadowPersistResult =
  | 'inserted'
  | 'unchanged'
  | 'evidence_immutable_conflict';

@Injectable()
export class TireDs4ShadowRepository {
  private readonly logger = new Logger(TireDs4ShadowRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async insertShadowInputImmutable(input: TireDs4ShadowPersistInput): Promise<TireDs4ShadowPersistResult> {
    const existing = await this.prisma.tireDs4MotionShadowInputV1.findUnique({
      where: {
        tireTripUsageLedgerId_diV0MotionCoreShadowRunId_adapterVersion: {
          tireTripUsageLedgerId: input.tireTripUsageLedgerId,
          diV0MotionCoreShadowRunId: input.diV0MotionCoreShadowRunId,
          adapterVersion: input.adapterVersion,
        },
      },
      select: { id: true, contentFingerprint: true },
    });

    if (existing) {
      if (existing.contentFingerprint === input.contentFingerprint) {
        return 'unchanged';
      }
      this.logger.warn(
        JSON.stringify({
          event: 'tire_ds4_shadow_evidence_immutable_conflict',
          ledgerId: input.tireTripUsageLedgerId,
          runId: input.diV0MotionCoreShadowRunId,
          adapterVersion: input.adapterVersion,
        }),
      );
      return 'evidence_immutable_conflict';
    }

    await this.prisma.tireDs4MotionShadowInputV1.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        tireSetupId: input.tireSetupId,
        tireTripUsageLedgerId: input.tireTripUsageLedgerId,
        diV0MotionCoreShadowRunId: input.diV0MotionCoreShadowRunId,
        workItemId: input.workItemId,
        combinedInputIdentity: input.combinedInputIdentity,
        pinnedSnapshotHash: input.pinnedSnapshotHash,
        contentFingerprint: input.contentFingerprint,
        shadowBundleVersion: input.shadowBundleVersion,
        speedAuthority: input.speedAuthority,
        eventsAlgorithmVersion: input.eventsAlgorithmVersion,
        adapterVersion: input.adapterVersion,
        source: 'DS4',
        eventQualityCoverage: input.eventQualityCoverage,
        temporalCoverage: input.temporalCoverage,
        ds4ReadStatus: input.ds4ReadStatus,
        inputPayload: input.inputPayload as Prisma.InputJsonValue,
      },
    });

    return 'inserted';
  }

  async hasTerminalMarker(tireTripUsageLedgerId: string, adapterVersion: string): Promise<boolean> {
    const row = await this.prisma.tireDs4MotionShadowInputV1.findFirst({
      where: {
        tireTripUsageLedgerId,
        adapterVersion,
        diV0MotionCoreShadowRunId: { in: [...TIRE_DS4_SHADOW_TERMINAL_RUN_IDS] },
      },
      select: { id: true },
    });
    return row != null;
  }

  async persistTerminalMarker(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    tireSetupId: string;
    tireTripUsageLedgerId: string;
    adapterVersion: string;
    kind: 'retry_exhausted' | 'ds4_not_available';
    reason: string;
  }): Promise<TireDs4ShadowPersistResult> {
    const runId =
      input.kind === 'retry_exhausted'
        ? TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED
        : TIRE_DS4_SHADOW_TERMINAL_RUN_DS4_NOT_AVAILABLE;

    const fingerprint = `terminal:${input.kind}:${input.reason}`;

    return this.insertShadowInputImmutable({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      tireSetupId: input.tireSetupId,
      tireTripUsageLedgerId: input.tireTripUsageLedgerId,
      diV0MotionCoreShadowRunId: runId,
      workItemId: null,
      combinedInputIdentity: fingerprint,
      pinnedSnapshotHash: fingerprint,
      contentFingerprint: fingerprint,
      shadowBundleVersion: 'n/a',
      speedAuthority: 'n/a',
      eventsAlgorithmVersion: 'n/a',
      adapterVersion: input.adapterVersion,
      eventQualityCoverage: 'NONE',
      temporalCoverage: 'NONE',
      ds4ReadStatus: input.kind === 'retry_exhausted' ? 'RETRY_EXHAUSTED' : 'NOT_AVAILABLE',
      inputPayload: buildNeutralTireDs4ShadowInputPayloadV3(input.reason),
    });
  }

  async findCatchupCandidates(
    adapterVersion: string,
    limit: number,
    allowedVehicleIds: readonly string[],
  ): Promise<
    Array<{
      tireTripUsageLedgerId: string;
      organizationId: string;
      vehicleId: string;
      tripId: string;
      reason: 'missing_shadow' | 'newer_ds4_run';
    }>
  > {
    if (allowedVehicleIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        tire_trip_usage_ledger_id: string;
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        catchup_reason: string;
      }>
    >`
      WITH latest_succeeded AS (
        SELECT DISTINCT ON (r.organization_id, r.vehicle_id, r.trip_id)
          r.organization_id,
          r.vehicle_id,
          r.trip_id,
          r.id AS run_id,
          r.created_at
        FROM di_v0_motion_core_shadow_runs_v1 r
        WHERE r.shadow_status = 'SUCCEEDED'
        ORDER BY r.organization_id, r.vehicle_id, r.trip_id, r.created_at DESC
      )
      SELECT l.id AS tire_trip_usage_ledger_id,
             l.organization_id,
             l.vehicle_id,
             l.trip_id,
             'newer_ds4_run' AS catchup_reason
      FROM tire_trip_usage_ledger l
      INNER JOIN latest_succeeded ls
        ON ls.organization_id = l.organization_id
       AND ls.vehicle_id = l.vehicle_id
       AND ls.trip_id = l.trip_id
      LEFT JOIN tire_ds4_motion_shadow_input_v1 mat
        ON mat.tire_trip_usage_ledger_id = l.id
       AND mat.adapter_version = ${adapterVersion}
       AND mat.di_v0_motion_core_shadow_run_id = ls.run_id
      WHERE l.invalidated_at IS NULL
        AND mat.id IS NULL
        AND l.vehicle_id = ANY(${allowedVehicleIds}::text[])
      ORDER BY l.processed_at ASC
      LIMIT ${limit}`;

    return rows.map((r) => ({
      tireTripUsageLedgerId: r.tire_trip_usage_ledger_id,
      organizationId: r.organization_id,
      vehicleId: r.vehicle_id,
      tripId: r.trip_id,
      reason: r.catchup_reason === 'newer_ds4_run' ? 'newer_ds4_run' : 'missing_shadow',
    }));
  }
}

export { isTireDs4ShadowTerminalRunId };
