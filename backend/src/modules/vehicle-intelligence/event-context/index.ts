/**
 * SynqDrive — LTE_R1 Event / Trigger Context module barrel.
 *
 * Types + guardrails (foundation) and the EventContextEnrichmentService (Phase 2)
 * for the LTE_R1 Misuse/Event architecture. Wired into LteR1BehaviorEnrichmentService
 * (required DI); best-effort per-event enrichment after native DIMO events commit.
 */
export * from './event-context.types';
export * from './engine-context.guards';
export * from './event-context-assessment.types';
export * from './event-context-window';
export * from './event-context-stats';
export * from './event-context-classifier';
export * from './event-context-enrichment.service';
export * from './event-context.config';
export * from './event-context-status';
export * from './driving-event-context-job.contract';
export * from './driving-event-context-job.service';
export * from './driving-event-context-enrich.handler';
