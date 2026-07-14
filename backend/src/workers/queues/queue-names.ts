export const QUEUE_NAMES = {
  DIMO_SNAPSHOT: 'dimo.snapshot.poll',
  DIMO_VEHICLE_SYNC: 'dimo.vehicle.sync',
  DTC_POLL: 'dimo.dtc.poll',
  TIRE_RECALCULATION: 'dimo.tire.recalculation',
  TRIP_TRACKING: 'dimo.trip-tracking',
  TRIP_BEHAVIOR_ENRICHMENT: 'trip.behavior.enrichment',
  /** Driving Impact Engine V1 — runs after HF enrichment completes. */
  DRIVING_IMPACT_COMPUTE: 'trip.driving-impact.compute',
  /** AI Document Upload — async text extraction + DIMO agent structuring. */
  DOCUMENT_EXTRACTION: 'document.extraction',
  /** DTC Knowledge Base — async AI enrichment of error codes (generic + vehicle). */
  DTC_KNOWLEDGE_ENRICHMENT: 'dtc.knowledge.enrichment',
  /** Notification evaluation — org-scoped BI + V2 producer sync (debounced/scheduled). */
  NOTIFICATION_EVALUATION: 'notification.evaluation',
  /** Notification delivery — transactional outbox channel dispatch. */
  NOTIFICATION_DELIVERY: 'notification.delivery',
  PAYMENT_EMAIL: 'payment.email',
} as const;
