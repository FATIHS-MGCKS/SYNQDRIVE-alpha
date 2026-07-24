import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { EvaluationsRecommendationEntityType } from '@synq/evaluations-insights/evaluations-recommendation-integrations';

@Injectable()
export class RecommendationEntityValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertEntityInOrg(
    organizationId: string,
    entityType: EvaluationsRecommendationEntityType,
    entityId: string,
  ): Promise<void> {
    const id = entityId.trim();
    if (!id) {
      throw new NotFoundException({
        message: 'Entity id is required',
        code: 'RECOMMENDATION_ENTITY_INVALID',
      });
    }

    let exists = false;
    switch (entityType) {
      case 'vehicle': {
        const row = await this.prisma.vehicle.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        exists = row != null;
        break;
      }
      case 'booking': {
        const row = await this.prisma.booking.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        exists = row != null;
        break;
      }
      case 'customer': {
        const row = await this.prisma.customer.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        exists = row != null;
        break;
      }
      case 'invoice': {
        const row = await this.prisma.orgInvoice.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        exists = row != null;
        break;
      }
      case 'station': {
        const row = await this.prisma.station.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        exists = row != null;
        break;
      }
      case 'driver': {
        const row = await this.prisma.customer.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });
        exists = row != null;
        break;
      }
      case 'organization':
        exists = organizationId === id;
        break;
      default:
        exists = false;
    }

    if (!exists) {
      throw new NotFoundException({
        message: 'Entity not found for organization',
        code: 'RECOMMENDATION_ENTITY_NOT_FOUND',
        entityType,
        entityId: id,
      });
    }
  }

  async assertRecommendationEntitiesInOrg(
    organizationId: string,
    entities: Array<{ entityType: string; entityId: string }>,
  ): Promise<void> {
    for (const entity of entities) {
      const type = entity.entityType.trim().toLowerCase() as EvaluationsRecommendationEntityType;
      await this.assertEntityInOrg(organizationId, type, entity.entityId);
    }
  }

  assertSameOrganization(organizationId: string, resourceOrgId: string): void {
    if (organizationId !== resourceOrgId) {
      throw new ForbiddenException({
        message: 'Cross-tenant access denied',
        code: 'RECOMMENDATION_TENANT_MISMATCH',
      });
    }
  }
}
