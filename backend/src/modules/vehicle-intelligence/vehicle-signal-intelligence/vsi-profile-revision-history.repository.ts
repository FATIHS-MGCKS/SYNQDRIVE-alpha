import type { PrismaService } from '../../../shared/database/prisma.service';
import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';

export class VsiProfileRevisionHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRevisionsForLink(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    maxRows?: number;
  }): Promise<VsiProfileRevisionHistoryRowV1[]> {
    const limit = Math.min(Math.max(input.maxRows ?? 128, 1), 512);
    const rows = await this.prisma.vehicleSignalCapabilityProfileRevision.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      },
      orderBy: [{ profileRevision: 'desc' }],
      take: limit,
    });

    return rows.map((row) => ({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      providerSourceLinkId: row.providerSourceLinkId,
      profileRevision: row.profileRevision,
      profileContractVersion: row.profileContractVersion,
      contentFingerprint: row.contentFingerprint,
      providerIdentity: row.providerIdentity,
      verifiedModality: row.verifiedModality,
      telemetrySourceFamily: row.telemetrySourceFamily,
      evaluatedAt: row.evaluatedAt,
      recordedAt: row.recordedAt,
      signalsSnapshot: row.signalsSnapshot,
      profileLimitations: Array.isArray(row.profileLimitations)
        ? (row.profileLimitations as string[])
        : [],
      materializationTrigger: row.materializationTrigger as VsiProfileRevisionHistoryRowV1['materializationTrigger'],
      sourceLinkLifecycleContext: row.sourceLinkLifecycleContext as VsiProfileRevisionHistoryRowV1['sourceLinkLifecycleContext'],
      sourceProvenance: row.sourceProvenance as VsiProfileRevisionHistoryRowV1['sourceProvenance'],
    }));
  }
}
