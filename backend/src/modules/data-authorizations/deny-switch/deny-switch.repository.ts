import { Injectable } from '@nestjs/common';
import {
  DataAuthorizationDenySwitchScopeType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildDenySwitchIdempotencyKey,
  buildDenySwitchScopeKey,
} from './deny-switch.constants';
import type { DenySwitchActivateInput } from './deny-switch.types';

@Injectable()
export class DenySwitchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async activateInTransaction(
    tx: Prisma.TransactionClient,
    input: DenySwitchActivateInput & { idempotencyKey: string },
  ) {
    const existing = await tx.dataAuthorizationDenySwitch.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return { row: existing, idempotentReplay: true };

    const scopeKey = buildDenySwitchScopeKey(input);
    const prior = await tx.dataAuthorizationDenySwitch.findFirst({
      where: {
        organizationId: input.organizationId,
        scopeType: input.scopeType,
        scopeEntityId: input.scopeEntityId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
      },
    });

    const orgMax = await tx.dataAuthorizationDenySwitch.aggregate({
      where: { organizationId: input.organizationId },
      _max: { sequence: true },
    });
    const nextSequence = (orgMax._max.sequence ?? 0n) + 1n;

    if (prior) {
      const row = await tx.dataAuthorizationDenySwitch.update({
        where: { id: prior.id },
        data: {
          active: true,
          sequence: nextSequence,
          trigger: input.trigger,
          reason: input.reason?.trim() || prior.reason,
          correlationId: input.correlationId,
          actorUserId: input.actorUserId ?? prior.actorUserId,
          blocksIngest: input.blocksIngest ?? true,
          blocksRead: input.blocksRead ?? true,
          blocksQueueEnqueue: input.blocksQueueEnqueue ?? true,
          activatedAt: new Date(),
          deactivatedAt: null,
        },
      });
      return { row, idempotentReplay: false, scopeKey };
    }

    try {
      const row = await tx.dataAuthorizationDenySwitch.create({
        data: {
          organizationId: input.organizationId,
          scopeType: input.scopeType,
          scopeEntityId: input.scopeEntityId ?? null,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null,
          trigger: input.trigger,
          sequence: nextSequence,
          active: true,
          blocksIngest: input.blocksIngest ?? true,
          blocksRead: input.blocksRead ?? true,
          blocksQueueEnqueue: input.blocksQueueEnqueue ?? true,
          reason: input.reason?.trim() || null,
          correlationId: input.correlationId,
          actorUserId: input.actorUserId ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { row, idempotentReplay: false, scopeKey };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        const dup = await tx.dataAuthorizationDenySwitch.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (dup) return { row: dup, idempotentReplay: true, scopeKey };
      }
      throw error;
    }
  }

  findActiveForOrganization(organizationId: string) {
    return this.prisma.dataAuthorizationDenySwitch.findMany({
      where: { organizationId, active: true },
      orderBy: { sequence: 'asc' },
    });
  }

  findAllActive() {
    return this.prisma.dataAuthorizationDenySwitch.findMany({
      where: { active: true },
      orderBy: [{ organizationId: 'asc' }, { sequence: 'asc' }],
    });
  }

  findByOrganization(organizationId: string) {
    return this.prisma.dataAuthorizationDenySwitch.findMany({
      where: { organizationId, active: true },
      orderBy: { sequence: 'desc' },
    });
  }

  buildIdempotencyKey(input: DenySwitchActivateInput): string {
    return (
      input.idempotencyKey ??
      buildDenySwitchIdempotencyKey({
        organizationId: input.organizationId,
        scopeType: input.scopeType,
        scopeEntityId: input.scopeEntityId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        correlationId: input.correlationId,
      })
    );
  }
}
