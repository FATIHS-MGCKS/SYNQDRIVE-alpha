import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from '../communication-tenant-context.validation';
import type { ConversationContextPatch } from '../normalization/communication-normalization.types';
import {
  COMMUNICATION_CONTEXT_FIELDS,
  CommunicationContextField,
  CommunicationContextResolutionByField,
  CommunicationContextResolutionSource,
} from './communication-context.types';
import { isStrongerCommunicationContextSource } from './communication-context-source.util';

export interface ApplyResolvedContextInput {
  organizationId: string;
  communicationConversationId: string;
  patch: ConversationContextPatch;
  resolved: CommunicationContextResolutionByField;
}

export interface ApplyResolvedContextResult {
  applied: boolean;
  fieldsUpdated: CommunicationContextField[];
}

@Injectable()
export class CommunicationContextApplierService {
  private readonly logger = new Logger(CommunicationContextApplierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: CommunicationTenantContextValidation,
  ) {}

  async applyResolvedContext(
    input: ApplyResolvedContextInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ApplyResolvedContextResult> {
    const client = tx ?? this.prisma;
    const conversation = await client.communicationConversation.findFirst({
      where: {
        id: input.communicationConversationId,
        organizationId: input.organizationId,
      },
    });
    if (!conversation) {
      return { applied: false, fieldsUpdated: [] };
    }

    const existingSources = readContextResolutionSources(conversation.metadata);
    const updateData: Prisma.CommunicationConversationUpdateInput = {};
    const fieldsUpdated: CommunicationContextField[] = [];

    for (const field of COMMUNICATION_CONTEXT_FIELDS) {
      const nextValue = input.patch[field];
      if (nextValue === undefined || nextValue === null) continue;

      const currentValue = conversation[field] ?? null;
      const resolution = input.resolved[field];
      if (!resolution?.value || resolution.value !== nextValue) continue;

      if (currentValue === nextValue) continue;

      const incumbentSource = existingSources[field];
      if (currentValue && incumbentSource) {
        if (!isStrongerCommunicationContextSource(resolution.source, incumbentSource)) {
          this.logger.warn(
            JSON.stringify({
              msg: 'communication_context_enrichment_skipped_weaker',
              organizationId: input.organizationId,
              communicationConversationId: input.communicationConversationId,
              field,
              resolutionSource: resolution.source,
              incumbentSource,
            }),
          );
          continue;
        }
      }

      if (currentValue && !incumbentSource) {
        // Existing non-null without recorded source — treat as verified canonical.
        if (resolution.source !== CommunicationContextResolutionSource.NATIVE_RELATION) {
          continue;
        }
      }

      (updateData as Record<string, unknown>)[field] = nextValue;
      existingSources[field] = resolution.source;
      fieldsUpdated.push(field);
    }

    if (fieldsUpdated.length === 0) {
      return { applied: false, fieldsUpdated: [] };
    }

    await this.tenantContext.assertConversationContextBelongsToOrg(
      input.organizationId,
      Object.fromEntries(
        fieldsUpdated.map((field) => [field, input.patch[field]]),
      ) as ConversationContextPatch,
      tx,
    );

    const nextMetadata = mergeContextResolutionMetadata(conversation.metadata, existingSources);
    updateData.metadata = nextMetadata;

    const whereGuard = buildConditionalWhereGuard(conversation, fieldsUpdated, input.patch);
    const updated = await client.communicationConversation.updateMany({
      where: {
        id: conversation.id,
        organizationId: input.organizationId,
        ...whereGuard,
      },
      data: updateData as Prisma.CommunicationConversationUpdateManyMutationInput,
    });

    if (updated.count === 0) {
      return { applied: false, fieldsUpdated: [] };
    }

    this.logger.log(
      JSON.stringify({
        msg: 'communication_context_enriched',
        organizationId: input.organizationId,
        communicationConversationId: input.communicationConversationId,
        fields: fieldsUpdated,
      }),
    );

    return { applied: true, fieldsUpdated };
  }
}

type StoredContextSources = Partial<
  Record<CommunicationContextField, CommunicationContextResolutionSource>
>;

function readContextResolutionSources(metadata: unknown): StoredContextSources {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const raw = (metadata as Record<string, unknown>).contextResolutionSources;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const parsed: StoredContextSources = {};
  for (const field of COMMUNICATION_CONTEXT_FIELDS) {
    const value = (raw as Record<string, unknown>)[field];
    if (
      typeof value === 'string'
      && Object.values(CommunicationContextResolutionSource).includes(
        value as CommunicationContextResolutionSource,
      )
    ) {
      parsed[field] = value as CommunicationContextResolutionSource;
    }
  }
  return parsed;
}

function mergeContextResolutionMetadata(
  metadata: unknown,
  sources: StoredContextSources,
): Prisma.InputJsonValue {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return {
    ...base,
    contextResolutionSources: sources,
  } as Prisma.InputJsonValue;
}

function buildConditionalWhereGuard(
  conversation: {
    customerId: string | null;
    bookingId: string | null;
    vehicleId: string | null;
    stationId: string | null;
    assignedUserId: string | null;
    assignedAgentRef: string | null;
    assignedAgentType: string | null;
  },
  fieldsUpdated: CommunicationContextField[],
  patch: ConversationContextPatch,
): Prisma.CommunicationConversationWhereInput {
  const guard: Prisma.CommunicationConversationWhereInput = {};
  for (const field of fieldsUpdated) {
    const current = conversation[field] ?? null;
    const next = patch[field] ?? null;
    if (current === null) {
      (guard as Record<string, unknown>)[field] = null;
    } else if (current === next) {
      (guard as Record<string, unknown>)[field] = current;
    }
  }
  return guard;
}
