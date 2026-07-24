import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, StationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowScopeDef } from './workflow-definition.validator';
import type { WorkflowDomainEvent } from './workflow-engine.service';
import {
  extractWorkflowEntityRefs,
  type WorkflowEntityRefs,
} from './workflow-entity-refs.util';
import {
  IMPLEMENTED_WORKFLOW_SCOPE_TYPES,
  SCOPE_ID_FIELD_BY_TYPE,
} from './workflow.constants';

const TERMINAL_BOOKING_STATUSES = new Set<BookingStatus>([
  'CANCELLED',
  'NO_SHOW',
]);

export type WorkflowEntityValidationCode =
  | 'MISSING_ORGANIZATION'
  | 'ENTITY_NOT_IN_ORG'
  | 'ENTITY_ARCHIVED'
  | 'ENTITY_UNAVAILABLE'
  | 'SCOPE_ENTITY_INVALID'
  | 'SCOPE_LIST_EMPTY'
  | 'UNKNOWN_SCOPE_TYPE';

@Injectable()
export class WorkflowTenantGuardService {
  constructor(private readonly prisma: PrismaService) {}

  assertOrganizationId(organizationId: string | undefined | null): string {
    const normalized = organizationId?.trim();
    if (!normalized) {
      throw new BadRequestException('Organization context is required');
    }
    return normalized;
  }

  assertEventOrganization(event: WorkflowDomainEvent): string {
    return this.assertOrganizationId(event.organizationId);
  }

  async validateScopeDefinition(
    organizationId: string,
    scope: WorkflowScopeDef,
  ): Promise<void> {
    const orgId = this.assertOrganizationId(organizationId);
    const scopeType = scope?.type?.trim();
    if (!scopeType) {
      throw new BadRequestException('Workflow scope.type is required');
    }
    if (!(IMPLEMENTED_WORKFLOW_SCOPE_TYPES as readonly string[]).includes(scopeType)) {
      throw new BadRequestException(`Unsupported workflow scope type: ${scopeType}`);
    }

    if (scopeType === 'organization') {
      return;
    }

    const idField =
      SCOPE_ID_FIELD_BY_TYPE[
        scopeType as keyof typeof SCOPE_ID_FIELD_BY_TYPE
      ];
    const ids = (scope[idField as keyof WorkflowScopeDef] as string[] | undefined) ?? [];
    if (!ids.length) {
      throw new BadRequestException(
        `${scopeType} scope requires at least one configured entity`,
      );
    }

    await this.validateScopeIdsBelongToOrg(orgId, scopeType, ids);
  }

  async validateEventEntities(
    organizationId: string,
    event: WorkflowDomainEvent,
  ): Promise<void> {
    const orgId = this.assertOrganizationId(organizationId);
    if (event.organizationId?.trim() !== orgId) {
      throw new BadRequestException('Event organization does not match request context');
    }
    await this.validateEntityRefs(orgId, extractWorkflowEntityRefs(event));
  }

  async validateEntityRefs(
    organizationId: string,
    refs: WorkflowEntityRefs,
  ): Promise<void> {
    const orgId = this.assertOrganizationId(organizationId);

    if (refs.vehicleId) {
      await this.assertActiveVehicle(orgId, refs.vehicleId);
    }
    if (refs.stationId) {
      await this.assertActiveStation(orgId, refs.stationId);
    }
    if (refs.bookingId) {
      await this.assertActiveBooking(orgId, refs.bookingId);
    }
    if (refs.customerId) {
      await this.assertActiveCustomer(orgId, refs.customerId);
    }
  }

  async validateScopeIdsBelongToOrg(
    organizationId: string,
    scopeType: string,
    ids: string[],
  ): Promise<void> {
    const orgId = this.assertOrganizationId(organizationId);
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) {
      throw new BadRequestException(`${scopeType} scope requires configured entities`);
    }

    for (const id of uniqueIds) {
      switch (scopeType) {
        case 'vehicle':
          await this.assertActiveVehicle(orgId, id);
          break;
        case 'station':
          await this.assertActiveStation(orgId, id);
          break;
        case 'booking':
          await this.assertActiveBooking(orgId, id);
          break;
        case 'customer':
          await this.assertActiveCustomer(orgId, id);
          break;
        default:
          throw new BadRequestException(`Unsupported workflow scope type: ${scopeType}`);
      }
    }
  }

  private async assertActiveVehicle(organizationId: string, vehicleId: string): Promise<void> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Referenced vehicle is not available in this organization');
    }
  }

  private async assertActiveStation(organizationId: string, stationId: string): Promise<void> {
    const row = await this.prisma.station.findFirst({
      where: {
        id: stationId,
        organizationId,
        archivedAt: null,
        status: StationStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Referenced station is not available in this organization');
    }
  }

  private async assertActiveBooking(organizationId: string, bookingId: string): Promise<void> {
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true, status: true },
    });
    if (!row || TERMINAL_BOOKING_STATUSES.has(row.status)) {
      throw new NotFoundException('Referenced booking is not available in this organization');
    }
  }

  private async assertActiveCustomer(organizationId: string, customerId: string): Promise<void> {
    const row = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Referenced customer is not available in this organization');
    }
  }

  async tryValidateEntityRefs(
    organizationId: string,
    refs: WorkflowEntityRefs,
  ): Promise<string | null> {
    try {
      await this.validateEntityRefs(organizationId, refs);
      return null;
    } catch (err: unknown) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        return err.message;
      }
      throw err;
    }
  }
}
