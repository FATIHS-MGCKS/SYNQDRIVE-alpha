import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildEvaluationsEntityReferenceDedupeKey,
  type EvaluationsEntityReference,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { assertValidEvaluationsEntityReference } from '@synq/evaluations-analytics/evaluations-analytics.validator';

/**
 * The single controlled write path for analytics entity references. Production
 * code MUST create references through this gate; no other module performs direct
 * `evaluationsEntityReference.create/createMany/upsert`. Test fixtures may write
 * directly.
 *
 * The gate guarantees same-tenant integrity: the reference's `organizationId`
 * owns any `stationId`, and a `STATION`-typed target is an organization station.
 * Other entity-type ids are supplied already tenant-validated by the producing
 * domain service; because reads are always organization-scoped, a reference can
 * never surface a foreign tenant's data regardless.
 */
@Injectable()
export class EvaluationsEntityReferenceWriteService {
  constructor(private readonly prisma: PrismaService) {}

  async createReference(input: EvaluationsEntityReference): Promise<{ id: string }> {
    assertValidEvaluationsEntityReference(input);

    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new BadRequestException('Unknown organization');
    }

    if (input.stationId !== null) {
      await this.assertStationBelongsToOrg(input.organizationId, input.stationId);
    }

    if (input.entityType === 'STATION') {
      await this.assertStationBelongsToOrg(input.organizationId, input.entityId);
    }

    const dedupeKey = buildEvaluationsEntityReferenceDedupeKey(input);

    // Idempotent: a duplicate relation retry maps to the same row and does not
    // create a second reference (unique on organizationId + dedupeKey).
    const row = await this.prisma.evaluationsEntityReference.upsert({
      where: {
        organizationId_dedupeKey: {
          organizationId: input.organizationId,
          dedupeKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        stationId: input.stationId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        entityType: input.entityType,
        entityId: input.entityId,
        relationType: input.relationType,
        dedupeKey,
      },
      update: {},
      select: { id: true },
    });
    return row;
  }

  private async assertStationBelongsToOrg(
    organizationId: string,
    stationId: string,
  ): Promise<void> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true },
    });
    if (!station) {
      throw new ForbiddenException('Station does not belong to the organization');
    }
  }
}
