import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BillingCommandStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import {
  BillingCommandErrorCode,
  BillingCommandType,
  buildBillingCommandOutboxIdempotencyKey,
  hashBillingCommandRequest,
  sanitizeBillingAuditPayload,
} from './domain/billing-command';
import { BillingDomainEventType } from './domain/billing-domain.events';

export interface BillingCommandActor {
  actorUserId?: string | null;
  idempotencyKey?: string;
  lockVersion?: number;
  requestId?: string | null;
}

export interface BillingCommandOutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface ExecuteBillingCommandInput<TResult> {
  organizationId: string;
  commandType: BillingCommandType;
  actor: BillingCommandActor;
  payload: Record<string, unknown>;
  aggregateId?: string;
  audit: {
    action: string;
    entityType: string;
    entityId?: string | null;
    reason?: string;
    changedFields?: string[];
    before?: unknown;
  };
  buildOutboxEvents?: (
    result: TResult,
    commandId: string,
  ) => BillingCommandOutboxEventInput[];
    handler: () => Promise<{
      result: TResult;
      after?: unknown;
      before?: unknown;
      aggregateId?: string;
      resultReference?: string;
    }>;
}

export interface ExecuteBillingCommandResult<TResult> {
  created: boolean;
  replayed: boolean;
  commandId: string;
  result: TResult;
}

@Injectable()
export class BillingCommandService {
  private readonly logger = new Logger(BillingCommandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BillingAuditService,
    private readonly outbox: BillingDomainEventOutboxService,
  ) {}

  async execute<TResult>(
    input: ExecuteBillingCommandInput<TResult>,
  ): Promise<ExecuteBillingCommandResult<TResult>> {
    const idempotencyKey = input.actor.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: BillingCommandErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        message: BillingCommandErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      });
    }

    const requestHash = hashBillingCommandRequest(input.payload);
    const claim = await this.claimCommand({
      organizationId: input.organizationId,
      commandType: input.commandType,
      idempotencyKey,
      requestHash,
      requestPayload: input.payload,
      actorUserId: input.actor.actorUserId,
      requestId: input.actor.requestId,
      lockVersion: input.actor.lockVersion,
      aggregateId: input.aggregateId,
    });

    if (claim.replayed && claim.resultJson != null) {
      return {
        created: false,
        replayed: true,
        commandId: claim.commandId,
        result: claim.resultJson as TResult,
      };
    }

    try {
      const handlerResult = await input.handler();
      const finalized = await this.finalizeCommand({
        commandId: claim.commandId,
        organizationId: input.organizationId,
        idempotencyKey,
        actorUserId: input.actor.actorUserId,
        requestId: input.actor.requestId,
        audit: input.audit,
        handlerResult,
        buildOutboxEvents: input.buildOutboxEvents,
      });

      return {
        created: claim.created,
        replayed: false,
        commandId: finalized.commandId,
        result: handlerResult.result,
      };
    } catch (error) {
      await this.markFailed(claim.commandId, error);
      throw error;
    }
  }

  private async claimCommand(params: {
    organizationId: string;
    commandType: BillingCommandType;
    idempotencyKey: string;
    requestHash: string;
    requestPayload: Record<string, unknown>;
    actorUserId?: string | null;
    requestId?: string | null;
    lockVersion?: number;
    aggregateId?: string;
  }): Promise<{
    commandId: string;
    created: boolean;
    replayed: boolean;
    resultJson?: unknown;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.billingCommand.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: params.organizationId,
            idempotencyKey: params.idempotencyKey,
          },
        },
      });

      if (existing) {
        if (existing.requestHash !== params.requestHash) {
          throw new ConflictException({
            code: BillingCommandErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
            message: BillingCommandErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          });
        }

        if (existing.status === BillingCommandStatus.COMPLETED) {
          return {
            commandId: existing.id,
            created: false,
            replayed: true,
            resultJson: existing.resultJson,
          };
        }

        if (existing.status === BillingCommandStatus.PROCESSING) {
          throw new ConflictException({
            code: BillingCommandErrorCode.CONCURRENT_COMMAND_IN_PROGRESS,
            message: BillingCommandErrorCode.CONCURRENT_COMMAND_IN_PROGRESS,
          });
        }

        if (existing.status === BillingCommandStatus.FAILED) {
          const resumed = await tx.billingCommand.update({
            where: { id: existing.id },
            data: {
              status: BillingCommandStatus.PROCESSING,
              failedAt: null,
              errorCode: null,
              errorMessage: null,
              actorUserId: params.actorUserId ?? existing.actorUserId,
              requestId: params.requestId ?? existing.requestId,
              lockVersion: params.lockVersion ?? existing.lockVersion,
              aggregateId: params.aggregateId ?? existing.aggregateId,
            },
          });
          return { commandId: resumed.id, created: false, replayed: false };
        }
      }

      const created = await tx.billingCommand.create({
        data: {
          organizationId: params.organizationId,
          commandType: params.commandType,
          idempotencyKey: params.idempotencyKey,
          requestHash: params.requestHash,
          requestPayload: sanitizeBillingAuditPayload(
            params.requestPayload,
          ) as Prisma.InputJsonValue,
          actorUserId: params.actorUserId ?? null,
          requestId: params.requestId ?? null,
          status: BillingCommandStatus.PROCESSING,
          lockVersion: params.lockVersion ?? null,
          aggregateId: params.aggregateId ?? null,
        },
      });

      return { commandId: created.id, created: true, replayed: false };
    });
  }

  private async finalizeCommand<TResult>(params: {
    commandId: string;
    organizationId: string;
    idempotencyKey: string;
    actorUserId?: string | null;
    requestId?: string | null;
    audit: ExecuteBillingCommandInput<TResult>['audit'];
    handlerResult: {
      result: TResult;
      after?: unknown;
      before?: unknown;
      aggregateId?: string;
      resultReference?: string;
    };
    buildOutboxEvents?: ExecuteBillingCommandInput<TResult>['buildOutboxEvents'];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const command = await tx.billingCommand.findUniqueOrThrow({
        where: { id: params.commandId },
      });

      if (
        command.status === BillingCommandStatus.COMPLETED &&
        command.resultJson != null
      ) {
        return { commandId: command.id };
      }

      const aggregateId =
        params.handlerResult.aggregateId ??
        params.handlerResult.resultReference ??
        command.aggregateId ??
        params.organizationId;

      await this.audit.logInTransaction(tx, {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: params.audit.action,
        entityType: params.audit.entityType,
        entityId: params.audit.entityId ?? aggregateId,
        before: params.handlerResult.before ?? params.audit.before,
        after: params.handlerResult.after ?? params.handlerResult.result,
        requestId: params.requestId,
        idempotencyKey: params.idempotencyKey,
        reason: params.audit.reason,
        changedFields: params.audit.changedFields,
      });

      const outboxEvents =
        params.buildOutboxEvents?.(params.handlerResult.result, params.commandId) ??
        [
          {
            eventType: BillingDomainEventType.SUBSCRIPTION_STATUS_CHANGED,
            aggregateType: 'BillingSubscription',
            aggregateId,
            payload: {
              commandId: params.commandId,
              commandType: command.commandType,
              organizationId: params.organizationId,
            },
          },
        ];

      for (const event of outboxEvents) {
        await this.outbox.enqueue(tx, {
          ...event,
          idempotencyKey: buildBillingCommandOutboxIdempotencyKey(
            params.commandId,
            event.eventType,
          ),
        });
      }

      const completed = await tx.billingCommand.update({
        where: { id: params.commandId },
        data: {
          status: BillingCommandStatus.COMPLETED,
          resultJson: sanitizeBillingAuditPayload(
            params.handlerResult.result,
          ) as Prisma.InputJsonValue,
          resultReference:
            params.handlerResult.resultReference ?? aggregateId ?? null,
          aggregateId: params.handlerResult.aggregateId ?? command.aggregateId,
          completedAt: new Date(),
        },
      });

      return { commandId: completed.id };
    });
  }

  private async markFailed(commandId: string, error: unknown) {
    const errorCode =
      typeof error === 'object' &&
      error != null &&
      'response' in error &&
      typeof (error as { response?: { code?: string } }).response?.code === 'string'
        ? (error as { response: { code: string } }).response.code
        : BillingCommandErrorCode.COMMAND_FINALIZE_FAILED;

    const errorMessage =
      error instanceof Error ? error.message : BillingCommandErrorCode.COMMAND_FINALIZE_FAILED;

    await this.prisma.billingCommand.updateMany({
      where: {
        id: commandId,
        status: BillingCommandStatus.PROCESSING,
      },
      data: {
        status: BillingCommandStatus.FAILED,
        errorCode,
        errorMessage: errorMessage.slice(0, 500),
        failedAt: new Date(),
      },
    });
  }
}
