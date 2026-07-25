export {
  WORKFLOW_DOMAIN_EVENT_REGISTRY,
  WORKFLOW_DOMAIN_EVENT_DEFINITIONS,
  WORKFLOW_DOMAIN_EVENT_TYPES,
  WORKFLOW_LEGACY_EVENT_ADAPTERS,
  WORKFLOW_LEGACY_EVENT_ADAPTER_MAP,
  getWorkflowEventDefinition,
  requireWorkflowEventDefinition,
  isRegisteredWorkflowEventType,
  listWorkflowEventTypes,
  listWorkflowEventsByDomain,
  getLegacyEventAdapter,
  listLegacyEventAdapters,
  resolveCanonicalEventType,
  adaptLegacyWorkflowEvent,
  getSupportedEventVersions,
  resolveEventVersion,
  inferEntityFromPayload,
  toRegistryDomainEvent,
  WorkflowDomainEventRegistryError,
} from './workflow-domain-event-registry';

export {
  validateWorkflowEventPayload,
  validateAndNormalizeWorkflowEvent,
  isValidWorkflowEventType,
  WorkflowDomainEventValidationError,
} from './workflow-domain-event-registry.validator';

export type {
  WorkflowEventDomain,
  WorkflowEventKind,
  WorkflowPayloadFieldType,
  WorkflowPayloadFieldSchema,
  WorkflowEventPayloadSchema,
  WorkflowDomainEventVersionDefinition,
  WorkflowDomainEventDefinition,
  WorkflowLegacyEventAdapter,
  WorkflowRegistryDomainEvent,
  WorkflowRegistryValidateInput,
} from './workflow-domain-event-registry.types';

export { LEGACY_TRIGGER_TO_EVENT } from './workflow-domain-event-registry.legacy';
