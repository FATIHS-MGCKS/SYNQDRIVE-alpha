import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { classifyVsiP3aCatalogAxes } from './vsi-p3a-catalog-axis.classifier';
import {
  VsiProviderCatalogAxisProvenance,
  VsiProviderCatalogSnapshotCompleteness,
} from './vsi-p3a-catalog-axis.contract';
import { isVsiP3aPerLinkCatalogWriteEnabled } from './vsi-p3a-per-link-catalog.config';
import { resolveVerifiedDimoProviderSourceLinkForPreflight } from './vsi-p3a-per-link-catalog-link-resolution';
import { VsiP3aPerLinkCatalogRepository } from './vsi-p3a-per-link-catalog.repository';

@Injectable()
export class VsiP3aPerLinkCatalogWriterService {
  private readonly logger = new Logger(VsiP3aPerLinkCatalogWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VsiP3aPerLinkCatalogRepository,
  ) {}

  /**
   * Persists per-link catalog axes from an existing DIMO availableSignals preflight payload.
   * No additional provider HTTP — caller must pass the same snapshot used for driving probes.
   */
  async persistFromAvailableSignalsPreflight(input: {
    organizationId: string;
    vehicleId: string;
    dimoTokenId: number;
    availableSignals: readonly string[];
    fuelType: string | null | undefined;
    checkedAt: Date;
    catalogSnapshotCompleteness: VsiProviderCatalogSnapshotCompleteness;
    preflightMetadata: Record<string, unknown>;
  }): Promise<{ wrote: number; skippedReason?: string }> {
    if (!isVsiP3aPerLinkCatalogWriteEnabled()) {
      return { wrote: 0, skippedReason: 'gate_off' };
    }

    const linkResolution = await resolveVerifiedDimoProviderSourceLinkForPreflight(this.prisma, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      dimoTokenId: input.dimoTokenId,
    });
    if (!linkResolution.ok) {
      this.logger.debug(
        `P3A catalog skip org=${input.organizationId} vehicle=${input.vehicleId} reason=${linkResolution.reason}`,
      );
      return { wrote: 0, skippedReason: linkResolution.reason };
    }

    const classifications = classifyVsiP3aCatalogAxes({
      availableSignals: input.availableSignals,
      fuelType: input.fuelType,
      catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
    });

    const persistResult = await this.repository.upsertCatalogAxes({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      link: linkResolution.context,
      checkedAt: input.checkedAt,
      catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications,
      metadata: input.preflightMetadata,
    });

    if (persistResult.equalTimestampConflicts.length > 0) {
      this.logger.warn(
        `P3A equal-timestamp catalog conflicts org=${input.organizationId} vehicle=${input.vehicleId} ` +
          `link=${linkResolution.context.providerSourceLinkId} count=${persistResult.equalTimestampConflicts.length} ` +
          `batch=${persistResult.catalogSnapshotBatchFingerprint}`,
      );
    }

    return { wrote: persistResult.written };
  }
}
