import { Injectable, Logger } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { conversationToResolverExisting, CommunicationContextResolverService } from './communication-context-resolver.service';
import { CommunicationContextApplierService } from './communication-context-applier.service';
import { CommunicationNativeContextLoader } from './communication-native-context.loader';
import type { CommunicationContextBackfillResult } from './communication-context.types';

@Injectable()
export class CommunicationContextEnrichmentService {
  private readonly logger = new Logger(CommunicationContextEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nativeLoader: CommunicationNativeContextLoader,
    private readonly resolver: CommunicationContextResolverService,
    private readonly applier: CommunicationContextApplierService,
  ) {}

  async enrichAfterProjection(input: {
    organizationId: string;
    channel: CommunicationChannel;
    nativeConversationId: string;
    communicationConversationId: string;
    occurredAt?: Date;
  }): Promise<void> {
    try {
      const conversation = await this.prisma.communicationConversation.findFirst({
        where: {
          id: input.communicationConversationId,
          organizationId: input.organizationId,
        },
      });
      if (!conversation) return;

      const facts = await this.nativeLoader.loadFacts(
        input.organizationId,
        input.channel,
        input.nativeConversationId,
      );

      const resolution = await this.resolver.resolve({
        organizationId: input.organizationId,
        conversationId: conversation.id,
        channel: input.channel,
        occurredAt: input.occurredAt ?? conversation.lastActivityAt,
        nativeContext: facts?.nativeContext,
        identityHints: facts?.identityHints,
        existingCanonical: conversationToResolverExisting(conversation),
      });

      if (Object.keys(resolution.patch).length === 0) {
        return;
      }

      await this.applier.applyResolvedContext({
        organizationId: input.organizationId,
        communicationConversationId: conversation.id,
        patch: resolution.patch,
        resolved: resolution.resolved,
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          msg: 'communication_context_enrichment_failed',
          organizationId: input.organizationId,
          communicationConversationId: input.communicationConversationId,
          channel: input.channel,
          errorCode: error instanceof Error ? error.name : 'UNKNOWN',
        }),
      );
    }
  }
}

@Injectable()
export class CommunicationContextBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nativeLoader: CommunicationNativeContextLoader,
    private readonly resolver: CommunicationContextResolverService,
    private readonly applier: CommunicationContextApplierService,
  ) {}

  async backfillOrganization(options: {
    organizationId: string;
    channel?: CommunicationChannel;
    batchSize?: number;
    unresolvedOnly?: boolean;
    dryRun?: boolean;
  }): Promise<CommunicationContextBackfillResult> {
    const batchSize = options.batchSize ?? 100;
    const unresolvedOnly = options.unresolvedOnly ?? true;
    const dryRun = options.dryRun ?? true;

    const result: CommunicationContextBackfillResult = {
      scanned: 0,
      alreadyResolved: 0,
      customerResolved: 0,
      bookingResolved: 0,
      vehicleResolved: 0,
      stationResolved: 0,
      ambiguous: 0,
      conflicted: 0,
      unresolved: 0,
      applied: 0,
    };

    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.communicationConversation.findMany({
        where: {
          organizationId: options.organizationId,
          ...(options.channel ? { channel: options.channel } : {}),
          ...(unresolvedOnly
            ? {
                OR: [
                  { customerId: null },
                  { bookingId: null },
                  { vehicleId: null },
                  { stationId: null },
                ],
              }
            : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;

      for (const conversation of rows) {
        result.scanned += 1;
        const hasAllCore =
          conversation.customerId
          && conversation.bookingId
          && conversation.vehicleId
          && conversation.stationId;
        if (hasAllCore) {
          result.alreadyResolved += 1;
          continue;
        }

        const facts = await this.nativeLoader.loadFacts(
          conversation.organizationId,
          conversation.channel,
          conversation.nativeConversationId,
        );

        const resolution = await this.resolver.resolve({
          organizationId: conversation.organizationId,
          conversationId: conversation.id,
          channel: conversation.channel,
          occurredAt: conversation.lastActivityAt,
          nativeContext: facts?.nativeContext,
          identityHints: facts?.identityHints,
          existingCanonical: conversationToResolverExisting(conversation),
        });

        if (resolution.conflicts.length > 0) {
          result.conflicted += 1;
        }

        const ambiguous = resolution.conflicts.some((c) =>
          c.code.includes('MULTIPLE') || c.code.includes('CONFLICTING') || c.code.includes('UNCLEAR'),
        );
        if (ambiguous) {
          result.ambiguous += 1;
        }

        if (resolution.patch.customerId) result.customerResolved += 1;
        if (resolution.patch.bookingId) result.bookingResolved += 1;
        if (resolution.patch.vehicleId) result.vehicleResolved += 1;
        if (resolution.patch.stationId) result.stationResolved += 1;

        if (Object.keys(resolution.patch).length === 0) {
          result.unresolved += 1;
          continue;
        }

        if (!dryRun) {
          const applied = await this.applier.applyResolvedContext({
            organizationId: conversation.organizationId,
            communicationConversationId: conversation.id,
            patch: resolution.patch,
            resolved: resolution.resolved,
          });
          if (applied.applied) {
            result.applied += 1;
          }
        }
      }

      if (rows.length < batchSize) break;
    }

    return result;
  }
}
