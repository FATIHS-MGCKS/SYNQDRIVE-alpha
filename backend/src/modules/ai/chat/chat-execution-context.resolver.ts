import { Injectable, Logger } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveStationsV2EffectiveFeatureFlags } from '@shared/stations/stations-v2-feature-flags.resolver';
import {
  buildAiExecutionContext,
  generateAiCorrelationId,
  resolveAiRequestId,
} from '../execution/ai-execution-context.builder';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import type { ChatSessionIdentity } from './chat-session.types';

@Injectable()
export class ChatExecutionContextResolver {
  private readonly logger = new Logger(ChatExecutionContextResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    organizationId: string,
    session: ChatSessionIdentity,
  ): Promise<AiExecutionContext | null> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: session.userId,
        organizationId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        role: true,
        status: true,
        permissions: true,
        stationScope: true,
        stationIds: true,
        fieldAgentAccess: true,
      },
    });

    if (!membership && session.platformRole !== 'MASTER_ADMIN') {
      this.logger.warn(
        `No active membership for user ${session.userId} in org ${organizationId}`,
      );
      return null;
    }

    const stationsFlags = resolveStationsV2EffectiveFeatureFlags(organizationId);

    return buildAiExecutionContext({
      organizationId,
      userId: session.userId,
      membershipRole: membership?.role ?? MembershipRole.WORKER,
      membershipStatus: (membership?.status as 'ACTIVE') ?? 'ACTIVE',
      permissions: membership?.permissions ?? {},
      stationScope: membership?.stationScope ?? null,
      stationIds: membership?.stationIds ?? null,
      fieldAgentAccess: membership?.fieldAgentAccess ?? false,
      platformRole: session.platformRole ?? null,
      membershipId: membership?.id ?? null,
      locale: session.locale ?? 'de',
      timezone: session.timezone ?? 'Europe/Berlin',
      correlationId: generateAiCorrelationId(),
      requestId: session.requestId ?? resolveAiRequestId(undefined),
      channel: 'fleet_chat',
      dataAccessPurpose: 'fleet_assistant_query',
      stationsScopeV2Enabled: stationsFlags.stationsScopeV2Enabled,
    });
  }
}
