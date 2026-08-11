import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildEvaluationsEntityReferenceDedupeKey,
  type EvaluationsEntityReference,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { assertValidEvaluationsEntityReference } from '@synq/evaluations-analytics/evaluations-analytics.validator';
import {
  resolveEvaluationsOwnerInOrganization,
  resolveEvaluationsTargetInOrganization,
  type EvaluationsResolverClient,
} from './evaluations-entity-reference.resolver';

/**
 * The single controlled write path for analytics entity references. Production
 * code MUST create references through this gate; no other module performs direct
 * `evaluationsEntityReference.create/createMany/upsert`. Test fixtures may write
 * directly.
 *
 * Same-tenant referential integrity is fully enforced in one transaction:
 * the organization exists; the owner (`ownerType`/`ownerId`) exists and belongs
 * to that organization; the target (`entityType`/`entityId`) exists and belongs
 * to that organization; any `stationId` belongs to that organization. Because
 * every check is anchored on the reference's `organizationId`, owner, target and
 * station are guaranteed to share the same tenant. Unsupported owner/target
 * types (no canonical organization-scoped entity) are rejected fail-closed.
 */
@Injectable()
export class EvaluationsEntityReferenceWriteService {
  constructor(private readonly prisma: PrismaService) {}

  async createReference(input: EvaluationsEntityReference): Promise<{ id: string }> {
    assertValidEvaluationsEntityReference(input);
    const dedupeKey = buildEvaluationsEntityReferenceDedupeKey(input);

    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as EvaluationsResolverClient;

      const organization = await tx.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true },
      });
      if (!organization) {
        throw new BadRequestException('Unknown organization');
      }

      const owner = await resolveEvaluationsOwnerInOrganization(
        client,
        input.organizationId,
        input.ownerType,
        input.ownerId,
      );
      if (!owner.persistable) {
        throw new BadRequestException(
          `Owner type ${input.ownerType} is not persistable`,
        );
      }
      if (!owner.belongsToOrganization) {
        throw new ForbiddenException('Reference owner is not in the organization');
      }

      const target = await resolveEvaluationsTargetInOrganization(
        client,
        input.organizationId,
        input.entityType,
        input.entityId,
      );
      if (!target.persistable) {
        throw new BadRequestException(
          `Entity type ${input.entityType} is not persistable`,
        );
      }
      if (!target.belongsToOrganization) {
        // Fail closed without leaking whether the target exists elsewhere.
        throw new ForbiddenException('Target entity is not in the organization');
      }

      if (input.stationId !== null) {
        const station = await tx.station.findFirst({
          where: { id: input.stationId, organizationId: input.organizationId },
          select: { id: true },
        });
        if (!station) {
          throw new ForbiddenException('Station does not belong to the organization');
        }
      }

      // Idempotent: a duplicate relation retry maps to the same row (unique on
      // organizationId + dedupeKey) and never creates a second reference.
      return tx.evaluationsEntityReference.upsert({
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
