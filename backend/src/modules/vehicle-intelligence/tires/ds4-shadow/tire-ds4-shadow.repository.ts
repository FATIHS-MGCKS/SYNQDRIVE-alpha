import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { TireDs4ShadowPersistInput } from './tire-ds4-shadow.types';

export type TireDs4ShadowUpsertResult = 'inserted' | 'unchanged';

@Injectable()
export class TireDs4ShadowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertShadowInput(input: TireDs4ShadowPersistInput): Promise<TireDs4ShadowUpsertResult> {
    const existing = await this.prisma.tireDs4MotionShadowInputV1.findUnique({
      where: {
        tireTripUsageLedgerId_diV0MotionCoreShadowRunId_adapterVersion: {
          tireTripUsageLedgerId: input.tireTripUsageLedgerId,
          diV0MotionCoreShadowRunId: input.diV0MotionCoreShadowRunId,
          adapterVersion: input.adapterVersion,
        },
      },
      select: { id: true, contentFingerprint: true, inputPayload: true },
    });

    if (existing?.contentFingerprint === input.contentFingerprint) {
      return 'unchanged';
    }

    const isCreate = !existing;

    await this.prisma.tireDs4MotionShadowInputV1.upsert({
      where: {
        tireTripUsageLedgerId_diV0MotionCoreShadowRunId_adapterVersion: {
          tireTripUsageLedgerId: input.tireTripUsageLedgerId,
          diV0MotionCoreShadowRunId: input.diV0MotionCoreShadowRunId,
          adapterVersion: input.adapterVersion,
        },
      },
      create: {
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
        coverage: input.coverage,
        ds4ReadStatus: input.ds4ReadStatus,
        inputPayload: input.inputPayload as Prisma.InputJsonValue,
      },
      update: {
        combinedInputIdentity: input.combinedInputIdentity,
        pinnedSnapshotHash: input.pinnedSnapshotHash,
        contentFingerprint: input.contentFingerprint,
        shadowBundleVersion: input.shadowBundleVersion,
        speedAuthority: input.speedAuthority,
        eventsAlgorithmVersion: input.eventsAlgorithmVersion,
        coverage: input.coverage,
        ds4ReadStatus: input.ds4ReadStatus,
        inputPayload: input.inputPayload as Prisma.InputJsonValue,
        workItemId: input.workItemId,
      },
    });

    return isCreate ? 'inserted' : 'unchanged';
  }

  async findLedgerIdsMissingShadow(adapterVersion: string, limit: number): Promise<
    Array<{
      tireTripUsageLedgerId: string;
      organizationId: string;
      vehicleId: string;
      tripId: string;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        tire_trip_usage_ledger_id: string;
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
      }>
    >`
      SELECT l.id AS tire_trip_usage_ledger_id,
             l.organization_id,
             l.vehicle_id,
             l.trip_id
      FROM tire_trip_usage_ledger l
      LEFT JOIN tire_ds4_motion_shadow_input_v1 s
        ON s.tire_trip_usage_ledger_id = l.id
       AND s.adapter_version = ${adapterVersion}
      WHERE l.invalidated_at IS NULL
        AND s.id IS NULL
      ORDER BY l.processed_at ASC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      tireTripUsageLedgerId: r.tire_trip_usage_ledger_id,
      organizationId: r.organization_id,
      vehicleId: r.vehicle_id,
      tripId: r.trip_id,
    }));
  }
}
