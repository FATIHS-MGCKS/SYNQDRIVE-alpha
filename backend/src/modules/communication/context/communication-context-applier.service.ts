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

const WEAKER_SOURCE_VALUES = [
  CommunicationContextResolutionSource.EXACT_PHONE,
  CommunicationContextResolutionSource.EXACT_EMAIL,
  CommunicationContextResolutionSource.BOOKING_RELATION,
  CommunicationContextResolutionSource.BOOKING_TIME_WINDOW,
] as const;

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
    const fieldsUpdated: CommunicationContextField[] = [];

    for (const field of COMMUNICATION_CONTEXT_FIELDS) {
      const nextValue = input.patch[field];
      if (nextValue === undefined || nextValue === null) continue;

      const currentValue = conversation[field] ?? null;
      const resolution = input.resolved[field];
      if (!resolution?.value || resolution.value !== nextValue) continue;
      if (currentValue === nextValue) continue;

      const incumbentSource = existingSources[field];
      if (!this.canApplyFieldUpdate(currentValue, incumbentSource, resolution.source)) {
        this.logger.warn(
          JSON.stringify({
            msg: 'communication_context_enrichment_skipped_weaker',
            organizationId: input.organizationId,
            communicationConversationId: input.communicationConversationId,
            field,
            resolutionSource: resolution.source,
            incumbentSource: incumbentSource ?? null,
          }),
        );
        continue;
      }

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

    const nextSources = { ...existingSources };
    for (const field of fieldsUpdated) {
      const resolution = input.resolved[field];
      if (resolution?.source) {
        nextSources[field] = resolution.source;
      }
    }

    let appliedCount = 0;
    for (const field of fieldsUpdated) {
      const nextValue = input.patch[field];
      const source = input.resolved[field]?.source;
      if (!nextValue || !source) continue;

      const updated = await this.applyAuthoritativeFieldUpdate(
        client,
        input.organizationId,
        conversation.id,
        field,
        nextValue,
        source,
      );
      if (updated > 0) {
        appliedCount += 1;
        existingSources[field] = source;
      }
    }

    if (appliedCount === 0) {
      return { applied: false, fieldsUpdated: [] };
    }

    await this.mergeResolutionSourcesMetadata(
      client,
      input.organizationId,
      conversation.id,
      nextSources,
    );

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

  private canApplyFieldUpdate(
    currentValue: string | null,
    incumbentSource: CommunicationContextResolutionSource | undefined,
    nextSource: CommunicationContextResolutionSource,
  ): boolean {
    if (!currentValue) {
      return true;
    }
    if (!incumbentSource) {
      return nextSource === CommunicationContextResolutionSource.NATIVE_RELATION;
    }
    return isStrongerCommunicationContextSource(nextSource, incumbentSource)
      || nextSource === incumbentSource;
  }

  private async applyAuthoritativeFieldUpdate(
    client: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    conversationId: string,
    field: CommunicationContextField,
    nextValue: string,
    source: CommunicationContextResolutionSource,
  ): Promise<number> {
    const column = FIELD_COLUMN[field];
    const weakerList = WEAKER_SOURCE_VALUES.map((v) => `'${v}'`).join(', ');

    const result = await client.$executeRawUnsafe(
      `
      UPDATE communication_conversations
      SET
        ${column} = $1,
        updated_at = NOW()
      WHERE id = $2
        AND organization_id = $3
        AND (
          ${column} IS NULL
          OR (
            $4 = 'NATIVE_RELATION'
            AND COALESCE(metadata->'contextResolutionSources'->>$5, '') IN (${weakerList})
          )
        )
      `,
      nextValue,
      conversationId,
      organizationId,
      source,
      field,
    );

    return Number(result);
  }

  private async mergeResolutionSourcesMetadata(
    client: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    conversationId: string,
    sources: Partial<Record<CommunicationContextField, CommunicationContextResolutionSource>>,
  ): Promise<void> {
    const sourcesJson = JSON.stringify(sources);
    await client.$executeRaw`
      UPDATE communication_conversations
      SET metadata = jsonb_set(
        COALESCE(metadata::jsonb, '{}'::jsonb),
        '{contextResolutionSources}',
        COALESCE(metadata::jsonb->'contextResolutionSources', '{}'::jsonb) || ${sourcesJson}::jsonb,
        true
      )
      WHERE id = ${conversationId}
        AND organization_id = ${organizationId}
    `;
  }
}

const FIELD_COLUMN: Record<CommunicationContextField, string> = {
  customerId: 'customer_id',
  bookingId: 'booking_id',
  vehicleId: 'vehicle_id',
  stationId: 'station_id',
  assignedUserId: 'assigned_user_id',
  assignedAgentRef: 'assigned_agent_ref',
  assignedAgentType: 'assigned_agent_type',
};

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
