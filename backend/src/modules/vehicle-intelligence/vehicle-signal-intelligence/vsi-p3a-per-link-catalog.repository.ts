import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

  /**
   * Monotone upsert: never downgrade checked_at; equal timestamps remain idempotent.
   */
  async upsertCatalogAxes(input: UpsertVsiP3aCatalogAxisInput): Promise<number> {
    let written = 0;
    for (const row of input.classifications) {
      const declared = mapDeclaredStatus(row.declaredCatalogStatus);
      const metadataJson = {
        ...input.metadata,
        ...row.metadata,
      } as Prisma.InputJsonValue;

      const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO vsi_provider_catalog_axes (
          id,
          organization_id,
          vehicle_id,
          provider_source_link_id,
          provider_identity,
          provider_native_signal_name,
          canonical_signal_key,
          declared_catalog_status,
          catalog_snapshot_completeness,
          provenance,
          contract_version,
          checked_at,
          verified_modality,
          telemetry_source_family,
          connection_identity_contract_version,
          metadata_json,
          created_at,
          updated_at
        ) VALUES (
          ${randomUUID()}::text,
          ${input.organizationId},
          ${input.vehicleId},
          ${input.link.providerSourceLinkId},
          ${input.link.providerIdentity},
          ${row.providerNativeSignalName},
          ${row.canonicalSignalKey},
          ${declared}::"VsiProviderCatalogAxisDeclaredStatus",
          ${input.catalogSnapshotCompleteness}::"VsiProviderCatalogSnapshotCompleteness",
          ${input.provenance}::"VsiProviderCatalogAxisProvenance",
          ${VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION},
          ${input.checkedAt},
          ${input.link.verifiedModality},
          ${input.link.telemetrySourceFamily},
          ${input.link.connectionIdentityContractVersion},
          ${metadataJson}::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT (organization_id, vehicle_id, provider_source_link_id, provider_native_signal_name)
        DO UPDATE SET
          provider_identity = EXCLUDED.provider_identity,
          canonical_signal_key = EXCLUDED.canonical_signal_key,
          declared_catalog_status = EXCLUDED.declared_catalog_status,
          catalog_snapshot_completeness = EXCLUDED.catalog_snapshot_completeness,
          provenance = EXCLUDED.provenance,
          contract_version = EXCLUDED.contract_version,
          checked_at = EXCLUDED.checked_at,
          verified_modality = EXCLUDED.verified_modality,
          telemetry_source_family = EXCLUDED.telemetry_source_family,
          connection_identity_contract_version = EXCLUDED.connection_identity_contract_version,
          metadata_json = EXCLUDED.metadata_json,
          updated_at = NOW()
        WHERE vsi_provider_catalog_axes.checked_at <= EXCLUDED.checked_at
        RETURNING id
      `;
      if (inserted.length > 0) {
        written += 1;
      }
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
