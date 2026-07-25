import { Injectable } from '@nestjs/common';
import { OutboundSmsEventType, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class OutboundSmsService {
  constructor(private readonly prisma: PrismaService) {}

  recordEvent(
    outboundSmsId: string,
    eventType: OutboundSmsEventType,
    payload?: Record<string, unknown>,
    webhookIdempotencyKey?: string,
  ) {
    return this.prisma.outboundSmsEvent.create({
      data: {
        outboundSmsId,
        eventType,
        payload: payload ? (payload as Prisma.InputJsonValue) : undefined,
        webhookIdempotencyKey: webhookIdempotencyKey ?? null,
      },
    });
  }
}
