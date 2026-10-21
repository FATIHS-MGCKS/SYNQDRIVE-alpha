import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { VsiP3aCatalogAxisClassification } from './vsi-p3a-catalog-axis.classifier';
import {
  buildVsiP3aCatalogAxisContentFingerprint,
  buildVsiP3aCatalogSnapshotBatchFingerprint,
  mapDeclaredStatusForPersistence,
  sortCatalogAxesForPersistence,
  type VsiP3aCatalogAxisUpsertOutcome,
} from './vsi-p3a-catalog-axis.persistence';
import {
  VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION,
  VsiProviderCatalogAxisProvenance,
  type VsiProviderCatalogSnapshotCompleteness,
} from './vsi-p3a-catalog-axis.contract';
import type { VsiP3aVerifiedDimoLinkContext } from './vsi-p3a-per-link-catalog-link-resolution';

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

export type UpsertVsiP3aCatalogAxesResult = {
  written: number;
  outcomes: VsiP3aCatalogAxisUpsertOutcome[];
  equalTimestampConflicts: Array<{
    providerNativeSignalName: string;
    existingContentFingerprint: string;
    incomingContentFingerprint: string;
  }>;
  catalogSnapshotBatchFingerprint: string;
};

@Injectable()
export class VsiP3aPerLinkCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically persists all catalog axes for one preflight snapshot.
   * Monotone rule: only strictly newer checked_at may overwrite; equal checked_at is
   * idempotent when content matches and rejected (documented) when content diverges.
   */
  async upsertCatalogAxes(input: UpsertVsiP3aCatalogAxisInput): Promise<UpsertVsiP3aCatalogAxesResult> {
    const sorted = sortCatalogAxesForPersistence(input.classifications);
    const catalogSnapshotBatchFingerprint = buildVsiP3aCatalogSnapshotBatchFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.link.providerSourceLinkId,
      checkedAtIso: input.checkedAt.toISOString(),
      catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
      classifications: sorted,
      sharedMetadata: input.metadata,
    });

    return this.prisma.$transaction(async (tx) => {
      const outcomes: VsiP3aCatalogAxisUpsertOutcome[] = [];
      const equalTimestampConflicts: UpsertVsiP3aCatalogAxesResult['equalTimestampConflicts'] =
        [];
      let written = 0;

      for (const row of sorted) {
        const declared = mapDeclaredStatusForPersistence(row.declaredCatalogStatus);
        const axisMetadata = {
          ...input.metadata,
          ...row.metadata,
          catalogSnapshotBatchFingerprint,
        };
        const contentFingerprint = buildVsiP3aCatalogAxisContentFingerprint({
          declaredCatalogStatus: declared,
          catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
          canonicalSignalKey: row.canonicalSignalKey,
          catalogSnapshotBatchFingerprint,
          axisMetadata: { ...row.metadata },
        });
        const metadataJson = {
          ...axisMetadata,
          catalogAxisContentFingerprint: contentFingerprint,
        } as Prisma.InputJsonValue;

        const existing = await tx.vsiProviderCatalogAxis.findUnique({
          where: {
            organizationId_vehicleId_providerSourceLinkId_providerNativeSignalName: {
              organizationId: input.organizationId,
              vehicleId: input.vehicleId,
              providerSourceLinkId: input.link.providerSourceLinkId,
              providerNativeSignalName: row.providerNativeSignalName,
            },
          },
          select: {
            checkedAt: true,
            metadataJson: true,
            declaredCatalogStatus: true,
            catalogSnapshotCompleteness: true,
            canonicalSignalKey: true,
          },
        });

        if (existing) {
          const existingCheckedMs = existing.checkedAt.getTime();
          const incomingCheckedMs = input.checkedAt.getTime();
          if (existingCheckedMs > incomingCheckedMs) {
            outcomes.push('skipped_older_checked_at');
            continue;
          }
          if (existingCheckedMs === incomingCheckedMs) {
            const existingMeta =
              existing.metadataJson && typeof existing.metadataJson === 'object'
                ? (existing.metadataJson as Record<string, unknown>)
                : {};
            const existingFingerprint =
              typeof existingMeta.catalogAxisContentFingerprint === 'string'
                ? existingMeta.catalogAxisContentFingerprint
                : buildVsiP3aCatalogAxisContentFingerprint({
                    declaredCatalogStatus: existing.declaredCatalogStatus,
                    catalogSnapshotCompleteness: existing.catalogSnapshotCompleteness,
                    canonicalSignalKey: existing.canonicalSignalKey,
                    catalogSnapshotBatchFingerprint:
                      typeof existingMeta.catalogSnapshotBatchFingerprint === 'string'
                        ? existingMeta.catalogSnapshotBatchFingerprint
                        : '',
                    axisMetadata: {},
                  });
            if (existingFingerprint === contentFingerprint) {
              outcomes.push('skipped_equal_timestamp_replay');
              continue;
            }
            equalTimestampConflicts.push({
              providerNativeSignalName: row.providerNativeSignalName,
              existingContentFingerprint: existingFingerprint,
              incomingContentFingerprint: contentFingerprint,
            });
            outcomes.push('skipped_equal_timestamp_conflict');
            continue;
          }
        }

        const inserted = await tx.$queryRaw<{ id: string }[]>`
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
          WHERE vsi_provider_catalog_axes.checked_at < EXCLUDED.checked_at
          RETURNING id
        `;

        if (inserted.length > 0) {
          written += 1;
          outcomes.push(existing ? 'updated_newer_checked_at' : 'inserted');
        } else if (existing) {
          outcomes.push('skipped_older_checked_at');
        }
      }

      return {
        written,
        outcomes,
        equalTimestampConflicts,
        catalogSnapshotBatchFingerprint,
      };
    });
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
