import { Injectable } from '@nestjs/common';
import { DimoPollJobType, DimoPollStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { loadPdiIdentityDriftObservationData } from './pdi-identity-drift-shadow.data-loader';
import { evaluateAllInstalledDevices } from './pdi-identity-drift-shadow.evaluator';
import {
  PdiIdentityDriftConfidence,
  PdiIdentityDriftReasonCode,
} from './pdi-identity-drift-shadow.types';
import { maskR1Serial } from './pdi-identity-drift-shadow.serial';

export type PdiIdentityMonitoringDeviceRowDto = {
  physicalDeviceId: string;
  vehicleId: string;
  vehicleLabel: string;
  licensePlate: string | null;
  dimoTokenId: number | null;
  expectedSerialMasked: string;
  observedSerialMasked: string | null;
  mirrorSyncedAt: string | null;
  identityStatus: PdiIdentityDriftReasonCode;
  confidence: PdiIdentityDriftConfidence;
  detailCodes: string[];
  evidenceStale: boolean;
};

export type PdiIdentityMonitoringSnapshotDto = {
  evaluatedAt: string;
  evaluationScope: 'RUPTELA_R1_ACTIVE_INSTALL';
  lastSuccessfulDimoVehicleSyncAt: string | null;
  inventoryRegisteredCount: number;
  inventoryInstalledCount: number;
  summary: {
    matchCount: number;
    driftCount: number;
    unconfirmedCount: number;
  };
  devices: PdiIdentityMonitoringDeviceRowDto[];
  note: string;
};

@Injectable()
export class PdiIdentityMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getLiveSnapshot(): Promise<PdiIdentityMonitoringSnapshotDto> {
    const now = new Date();
    const syncRunId = `master-admin-live-${now.getTime()}`;

    const [inventoryRegisteredCount, inventoryInstalledCount, lastSync, loadResult] =
      await Promise.all([
        this.prisma.physicalDevice.count({ where: { modelCode: 'RUPTELA_R1' } }),
        this.prisma.physicalDevice.count({
          where: { modelCode: 'RUPTELA_R1', status: 'INSTALLED' },
        }),
        this.prisma.dimoPollLog.findFirst({
          where: {
            jobType: DimoPollJobType.VEHICLE_SYNC,
            status: DimoPollStatus.SUCCESS,
            vehicleId: null,
          },
          orderBy: { finishedAt: 'desc' },
          select: { finishedAt: true },
        }),
        loadPdiIdentityDriftObservationData(this.prisma),
      ]);

    const { devices, knownInventorySerials } = loadResult;
    const rows = evaluateAllInstalledDevices({
      now,
      syncRunId,
      devices,
      knownInventorySerials,
    });

    const vehicleIds = [...new Set(rows.map((r) => r.vehicleId))];
    const vehicles =
      vehicleIds.length === 0
        ? []
        : await this.prisma.vehicle.findMany({
            where: { id: { in: vehicleIds } },
            select: {
              id: true,
              make: true,
              model: true,
              vehicleName: true,
              licensePlate: true,
            },
          });
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    let matchCount = 0;
    let driftCount = 0;
    let unconfirmedCount = 0;

    const deviceRows: PdiIdentityMonitoringDeviceRowDto[] = rows.map((row) => {
      if (row.reasonCode === PdiIdentityDriftReasonCode.MATCH) {
        matchCount += 1;
      } else if (row.reasonCode === PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED) {
        unconfirmedCount += 1;
      } else {
        driftCount += 1;
      }

      const vehicle = vehicleById.get(row.vehicleId);
      const vehicleLabel =
        vehicle?.vehicleName?.trim() ||
        [vehicle?.make, vehicle?.model].filter(Boolean).join(' ').trim() ||
        row.vehicleId;

      const evidenceStale = row.detailCodes.includes('PROVIDER_MIRROR_STALE_OR_MISSING');

      return {
        physicalDeviceId: row.physicalDeviceId,
        vehicleId: row.vehicleId,
        vehicleLabel,
        licensePlate: vehicle?.licensePlate ?? null,
        dimoTokenId: row.dimoTokenId,
        expectedSerialMasked: row.expectedSerialMasked,
        observedSerialMasked: row.observedSerialMasked,
        mirrorSyncedAt: row.provenance.mirrorSyncedAt,
        identityStatus: row.reasonCode,
        confidence: row.confidence,
        detailCodes: row.detailCodes,
        evidenceStale,
      };
    });

    return {
      evaluatedAt: now.toISOString(),
      evaluationScope: 'RUPTELA_R1_ACTIVE_INSTALL',
      lastSuccessfulDimoVehicleSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
      inventoryRegisteredCount,
      inventoryInstalledCount,
      summary: {
        matchCount,
        driftCount,
        unconfirmedCount,
      },
      devices: deviceRows,
      note:
        'Live identity status computed read-only from PDI INSTALL assignments and DIMO mirror serials. No persisted drift event history in V1.',
    };
  }
}
