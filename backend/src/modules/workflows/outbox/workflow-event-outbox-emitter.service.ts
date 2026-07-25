import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import workflowEventOutboxConfig from '@config/workflow-event-outbox.config';
import { buildWorkflowOutboxIdempotencyKey } from './workflow-event-outbox.constants';
import { WorkflowEventOutboxEnqueueService } from './workflow-event-outbox-enqueue.service';
import type {
  WorkflowEventEmitGroup,
  WorkflowEventEmitInput,
  WorkflowEventEmitResult,
  WorkflowTx,
} from './workflow-event-outbox-emitter.types';

@Injectable()
export class WorkflowEventOutboxEmitterService {
  constructor(
    @Inject(workflowEventOutboxConfig.KEY)
    private readonly config: ConfigType<typeof workflowEventOutboxConfig>,
    private readonly enqueue: WorkflowEventOutboxEnqueueService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isGroupEnabled(group: WorkflowEventEmitGroup): boolean {
    if (!this.config.enabled) return false;
    const flags: Record<WorkflowEventEmitGroup, boolean> = {
      bookingLifecycle: this.config.emitBookingLifecycle,
      bookingTiming: this.config.emitBookingTiming,
      vehicleHealth: this.config.emitVehicleHealth,
      vehicleDtc: this.config.emitVehicleDtc,
      vehicleTelemetry: this.config.emitVehicleTelemetry,
      billing: this.config.emitBilling,
      customer: this.config.emitCustomer,
      damage: this.config.emitDamage,
      service: this.config.emitService,
      task: this.config.emitTask,
    };
    return flags[group] ?? true;
  }

  async enqueueInTransaction(
    tx: WorkflowTx,
    input: WorkflowEventEmitInput,
  ): Promise<WorkflowEventEmitResult> {
    if (!this.isGroupEnabled(input.group)) return null;

    const idempotencyKey =
      input.idempotencyKey?.trim()
      ?? (input.occurrenceId
        ? buildWorkflowOutboxIdempotencyKey([input.eventType, input.occurrenceId])
        : buildWorkflowOutboxIdempotencyKey([
          input.eventType,
          input.entityId ?? input.payload?.bookingId?.toString() ?? '',
        ]));

    return this.enqueue.enqueueInTransaction(tx, {
      organizationId: input.organizationId,
      eventType: input.eventType,
      source: input.source,
      payload: input.payload,
      eventVersion: input.eventVersion,
      occurredAt: input.occurredAt,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId,
      causationId: input.causationId,
      metadata: input.metadata,
      eventId: input.eventId,
      idempotencyKey,
    });
  }

  /** For schedulers/detectors without an enclosing business transaction. */
  async enqueueStandalone(input: WorkflowEventEmitInput): Promise<WorkflowEventEmitResult> {
    if (!this.isGroupEnabled(input.group)) return null;
    return this.prisma.$transaction((tx) => this.enqueueInTransaction(tx, input));
  }
}
