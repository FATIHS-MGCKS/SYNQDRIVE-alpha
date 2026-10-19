import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { VsiP3aCatalogAxisClassification } from './vsi-p3a-catalog-axis.classifier';
import {
  VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION,
  VsiProviderCatalogAxisProvenance,
  type VsiProviderCatalogSnapshotCompleteness,
} from './vsi-p3a-catalog-axis.contract';
import type { VsiP3aVerifiedDimoLinkContext } from './vsi-p3a-per-link-catalog-link-resolution';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

export type UpsertVsiP3aCatalogAxisInput = {
  organizationId: string;
  vehicleId: string;
  link: VsiP3aVerifiedDimoLinkContext;
  checkedAt: Date;
  catalogSnapshotCompleteness: VsiProviderCatalogSnapshotCompleteness;
  provenance: VsiProviderCatalogAxisProvenance;
  classifications: readonly VsiP3aCatalogAxisClassification[];
  metadata: Record<string, unknown>;
};

function mapDeclaredStatus(status: VsiProviderCatalogStatus): 'LISTED' | 'NOT_LISTED' | 'UNKNOWN' {
  switch (status) {
    case VsiProviderCatalogStatus.LISTED:
      return 'LISTED';
    case VsiProviderCatalogStatus.NOT_LISTED:
      return 'NOT_LISTED';
    default:
      return 'UNKNOWN';
  }
}

@Injectable()
export class VsiP3aPerLinkCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertCatalogAxes(input: UpsertVsiP3aCatalogAxisInput): Promise<number> {
    let written = 0;
    for (const row of input.classifications) {
      const declared = mapDeclaredStatus(row.declaredCatalogStatus);
      const metadataJson = {
        ...input.metadata,
        ...row.metadata,
      } as Prisma.InputJsonValue;

      const existing = await this.prisma.vsiProviderCatalogAxis.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId_providerNativeSignalName: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            providerSourceLinkId: input.link.providerSourceLinkId,
            providerNativeSignalName: row.providerNativeSignalName,
          },
        },
        select: { checkedAt: true },
      });

      if (existing && existing.checkedAt.getTime() > input.checkedAt.getTime()) {
        continue;
      }

      await this.prisma.vsiProviderCatalogAxis.upsert({
        where: {
          organizationId_vehicleId_providerSourceLinkId_providerNativeSignalName: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            providerSourceLinkId: input.link.providerSourceLinkId,
            providerNativeSignalName: row.providerNativeSignalName,
          },
        },
        create: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: input.link.providerSourceLinkId,
          providerIdentity: input.link.providerIdentity,
          providerNativeSignalName: row.providerNativeSignalName,
          canonicalSignalKey: row.canonicalSignalKey,
          declaredCatalogStatus: declared,
          catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
          provenance: input.provenance,
          contractVersion: VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION,
          checkedAt: input.checkedAt,
          verifiedModality: input.link.verifiedModality,
          telemetrySourceFamily: input.link.telemetrySourceFamily,
          connectionIdentityContractVersion: input.link.connectionIdentityContractVersion,
          metadataJson,
        },
        update: {
          providerIdentity: input.link.providerIdentity,
          canonicalSignalKey: row.canonicalSignalKey,
          declaredCatalogStatus: declared,
          catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
          provenance: input.provenance,
          contractVersion: VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION,
          checkedAt: input.checkedAt,
          verifiedModality: input.link.verifiedModality,
          telemetrySourceFamily: input.link.telemetrySourceFamily,
          connectionIdentityContractVersion: input.link.connectionIdentityContractVersion,
          metadataJson,
        },
      });
      written += 1;
    }
    return written;
  }

  async findLatestAxesForLink(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
  }) {
    return this.prisma.vsiProviderCatalogAxis.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      },
    });
  }
}
