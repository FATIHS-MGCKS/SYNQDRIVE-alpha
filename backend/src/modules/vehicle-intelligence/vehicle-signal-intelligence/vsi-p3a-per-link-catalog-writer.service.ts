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
    availableSignals: readonly string[];
    fuelType: string | null | undefined;
    checkedAt: Date;
    providerError: Record<string, unknown> | null;
    preflightMetadata: Record<string, unknown>;
  }): Promise<{ wrote: number; skippedReason?: string }> {
    if (!isVsiP3aPerLinkCatalogWriteEnabled()) {
      return { wrote: 0, skippedReason: 'gate_off' };
    }

    const linkResolution = await resolveVerifiedDimoProviderSourceLinkForPreflight(this.prisma, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });
    if (!linkResolution.ok) {
      this.logger.debug(
        `P3A catalog skip org=${input.organizationId} vehicle=${input.vehicleId} reason=${linkResolution.reason}`,
      );
      return { wrote: 0, skippedReason: linkResolution.reason };
    }

    const completeness = input.providerError
      ? VsiProviderCatalogSnapshotCompleteness.PROVIDER_ERROR
      : VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG;

    const classifications = classifyVsiP3aCatalogAxes({
      availableSignals: input.availableSignals,
      fuelType: input.fuelType,
      catalogSnapshotCompleteness: completeness,
    });

    const wrote = await this.repository.upsertCatalogAxes({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      link: linkResolution.context,
      checkedAt: input.checkedAt,
      catalogSnapshotCompleteness: completeness,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications,
      metadata: input.preflightMetadata,
    });

    return { wrote };
  }
}
