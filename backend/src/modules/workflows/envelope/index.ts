export {
  WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION,
  WORKFLOW_EVENT_MAX_PAYLOAD_BYTES,
  WORKFLOW_EVENT_MAX_METADATA_BYTES,
  WORKFLOW_EVENT_TIMESTAMP_FORMAT,
} from './workflow-domain-event-envelope.constants';

export type {
  WorkflowDomainEventEnvelope,
  WorkflowDomainEventEnvelopeSchemaVersion,
  CreateWorkflowDomainEventEnvelopeInput,
  WorkflowDomainEventEnvelopeWireInput,
  WorkflowEventRejectionReason,
  WorkflowEventRejection,
  WorkflowEventEnvelopeResult,
  WorkflowEventIdStore,
  WorkflowEventEnvelopeValidateOptions,
  WorkflowEventPiiClass,
} from './workflow-domain-event-envelope.types';

export {
  createWorkflowEventRejection,
  rejectionToDeadLetterPayload,
} from './workflow-domain-event-envelope.rejection';

export {
  normalizeWorkflowEventInput,
  legacyEngineEventToWireInput,
} from './workflow-domain-event-envelope.normalizer';

export type { NormalizedEnvelopeInput } from './workflow-domain-event-envelope.normalizer';

export {
  toSafeLogEnvelope,
  toSafeLogString,
  classifyPiiKeys,
  containsMetadataSecrets,
} from './workflow-domain-event-envelope.safe-log';

export {
  createWorkflowDomainEventEnvelope,
  serializeWorkflowDomainEventEnvelope,
  deserializeWorkflowDomainEventEnvelope,
  freezeEnvelope,
} from './workflow-domain-event-envelope.factory';

export {
  buildWorkflowDomainEventEnvelope,
  buildWorkflowDomainEventEnvelopeAsync,
} from './workflow-domain-event-envelope.validator';

export {
  InMemoryWorkflowEventIdStore,
  FIXTURE_ORG_ID,
  FIXTURE_BOOKING_ID,
  FIXTURE_VEHICLE_ID,
  FIXTURE_EVENT_ID,
  FIXTURE_CORRELATION_ID,
  FIXTURE_CAUSATION_ID,
  FIXTURE_OCCURRED_AT,
  FIXTURE_RECEIVED_AT,
  validBookingReturnedInput,
  legacyVehicleReturnedInput,
} from './workflow-domain-event-envelope.fixtures';
