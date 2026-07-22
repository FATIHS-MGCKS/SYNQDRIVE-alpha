import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { AppendPickupGateAuditInput } from './booking-pickup-gate.types';

type Tx = Prisma.TransactionClient;

@Injectable()
export class BookingPickupGateAuditService {
  constructor(private readonly prisma: PrismaService) {}

  appendInTransaction(tx: Tx, input: AppendPickupGateAuditInput) {
    return tx.bookingPickupGateAuditEvent.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        eventType: input.eventType,
        outcome: input.outcome,
        actorUserId: input.actor.userId,
        actorDisplayName: input.actor.displayName,
        overrideReason: input.overrideReason ?? null,
        gateCode: input.gateCode ?? null,
        missingRequirements: input.missingRequirements
          ? (input.missingRequirements as unknown as Prisma.InputJsonValue)
          : undefined,
        correlationId: input.correlationId ?? null,
      },
    });
  }

  async appendBlocked(input: AppendPickupGateAuditInput) {
    return this.prisma.bookingPickupGateAuditEvent.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        eventType: input.eventType,
        outcome: input.outcome,
        actorUserId: input.actor.userId,
        actorDisplayName: input.actor.displayName,
        overrideReason: input.overrideReason ?? null,
        gateCode: input.gateCode ?? null,
        missingRequirements: input.missingRequirements
          ? (input.missingRequirements as unknown as Prisma.InputJsonValue)
          : undefined,
        correlationId: input.correlationId ?? null,
      },
    });
  }
}
