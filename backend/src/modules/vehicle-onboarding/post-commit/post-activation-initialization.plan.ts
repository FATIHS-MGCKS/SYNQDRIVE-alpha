export type PostCommitEffectClass =
  | 'POST_COMMIT_IDEMPOTENT'
  | 'OPTIONAL_ASYNC'
  | 'FUTURE_OUTBOX_CONSUMER';

export interface PostActivationInitializationPlanItem {
  effect: string;
  classification: PostCommitEffectClass;
  notes: string;
}

/** VO-3 classification only — canonical activation does not invoke these pre-commit. */
export const POST_ACTIVATION_INITIALIZATION_PLAN: PostActivationInitializationPlanItem[] = [
  {
    effect: 'capabilityLifecycle.refreshOnNewIntegration',
    classification: 'POST_COMMIT_IDEMPOTENT',
    notes: 'Enqueue after VEHICLE_ACTIVATED outbox consumer or explicit post-commit runner.',
  },
  {
    effect: 'batteryCapabilityRefresh.enqueueForDimoVehicle',
    classification: 'POST_COMMIT_IDEMPOTENT',
    notes: 'Must not run inside activation transaction; tied to provider consent change.',
  },
  {
    effect: 'VehicleEnrichmentJob',
    classification: 'POST_COMMIT_IDEMPOTENT',
    notes: 'Async enrichment from mirrors.',
  },
  {
    effect: 'DataAuthorizationsService.ensureDimoTelemetryAuthorization',
    classification: 'POST_COMMIT_IDEMPOTENT',
    notes: 'Org-scoped telemetry authorization bootstrap.',
  },
  {
    effect: 'telemetry snapshot init',
    classification: 'OPTIONAL_ASYNC',
    notes: 'Provider network — never pre-commit.',
  },
  {
    effect: 'billingQuantity.onVehicleProvisioned',
    classification: 'POST_COMMIT_IDEMPOTENT',
    notes:
      'VO5B-AB1: VehicleRegistryLifecycleOutboxProcessor consumes VEHICLE_ACTIVATED; event-time effectiveAt; idempotency vehicle-registry:<eventId>:billing-activate:v1. Legacy registerFromDimo/create fire-and-forget hooks remain disjoint (later cutover).',
  },
  {
    effect: 'tire/brake/battery baseline materialization',
    classification: 'POST_COMMIT_IDEMPOTENT',
    notes: 'Deferred to VO-4 readiness/baseline authority; legacy registerFromDimo still owns cutover path.',
  },
];
