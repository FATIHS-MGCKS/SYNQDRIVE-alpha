export {
  WORKFLOW_EVENT_OUTBOX_DEFAULT_LEASE_MS,
  WORKFLOW_EVENT_OUTBOX_ERROR_SUMMARY_MAX,
  buildWorkflowOutboxIdempotencyKey,
  truncateOutboxErrorSummary,
} from './workflow-event-outbox.constants';

export type {
  WorkflowEventOutboxEnqueueInput,
  WorkflowEventOutboxRecord,
} from './workflow-event-outbox.types';

export { WorkflowEventOutboxEnqueueError } from './workflow-event-outbox.types';

export { envelopeToOutboxCreateData, outboxRowToEnvelope } from './workflow-event-outbox.mapper';

export { WorkflowEventOutboxEnqueueService } from './workflow-event-outbox-enqueue.service';
export { WorkflowEventOutboxEmitterService } from './workflow-event-outbox-emitter.service';
export { WorkflowBookingTimingEmitterService } from './workflow-booking-timing-emitter.service';
export {
  buildWorkflowOccurrenceId,
  buildBookingTimingOccurrenceId,
  buildVehicleFindingOccurrenceId,
  buildInvoiceTimingOccurrenceId,
  buildDocumentExpiringOccurrenceId,
} from './workflow-event-occurrence.util';
export type {
  WorkflowEventEmitGroup,
  WorkflowEventEmitInput,
  WorkflowEventEmitResult,
  WorkflowTx,
} from './workflow-event-outbox-emitter.types';
export { WorkflowEventOutboxRepository } from './workflow-event-outbox.repository';
export { WorkflowEventOutboxDispatchService } from './workflow-event-outbox-dispatch.service';
export { WorkflowEventOutboxProcessorService } from './workflow-event-outbox-processor.service';
export { WorkflowEventOutboxSchedulerService } from './workflow-event-outbox-scheduler.service';
export { WorkflowEventOutboxObservabilityService } from './workflow-event-outbox-observability.service';
export { WorkflowEventOutboxHealthService } from './workflow-event-outbox-health.service';
export { WorkflowEventOutboxReplayService } from './workflow-event-outbox-replay.service';
export { WorkflowEventOutboxCoreModule } from './workflow-event-outbox-core.module';
export { WorkflowEventOutboxModule } from './workflow-event-outbox.module';

export {
  resolveWorkflowEventOutboxWorkerId,
  resetWorkflowEventOutboxWorkerIdForTests,
} from './workflow-event-outbox-worker-id.util';

export {
  WorkflowEventOutboxProcessingError,
  classifyProcessingError,
  classifyRejectionReason,
  computeWorkflowOutboxBackoffMs,
  shouldRetryErrorClass,
} from './workflow-event-outbox-error.util';

export type { WorkflowEventOutboxErrorClass } from './workflow-event-outbox-error.util';

export {
  FIXTURE_OUTBOX_ORG_ID,
  FIXTURE_OUTBOX_BOOKING_ID,
  validBookingConfirmedOutboxInput,
  validBookingReturnedOutboxInput,
  validInvoiceOverdueOutboxInput,
  validVehicleHealthCriticalOutboxInput,
} from './workflow-event-outbox.fixtures';
