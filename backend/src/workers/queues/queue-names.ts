export const QUEUE_NAMES = {
  DIMO_SNAPSHOT: 'dimo.snapshot.poll',
  DIMO_VEHICLE_SYNC: 'dimo.vehicle.sync',
  DTC_POLL: 'dimo.dtc.poll',
  TIRE_RECALCULATION: 'dimo.tire.recalculation',
  BRAKE_RECALCULATION: 'dimo.brake.recalculation',
  TRIP_TRACKING: 'dimo.trip-tracking',
  TRIP_BEHAVIOR_ENRICHMENT: 'trip.behavior.enrichment',
  /** Driving Impact Engine V1 — runs after HF enrichment completes. */
  DRIVING_IMPACT_COMPUTE: 'trip.driving-impact.compute',
  /** Driving Intelligence V2 — typed persistent job envelope (P18). */
  DRIVING_INTELLIGENCE: 'driving.intelligence.jobs',
  /** AI Document Upload — async text extraction + DIMO agent structuring. */
  DOCUMENT_EXTRACTION: 'document.extraction',
  /** Booking document lifecycle — async PDF generation with durable workflow state. */
  BOOKING_DOCUMENT_GENERATION: 'booking.document.generation',
  /** DTC Knowledge Base — async AI enrichment of error codes (generic + vehicle). */
  DTC_KNOWLEDGE_ENRICHMENT: 'dtc.knowledge.enrichment',
  /** Notification evaluation — org-scoped BI + V2 producer sync (debounced/scheduled). */
  NOTIFICATION_EVALUATION: 'notification.evaluation',
  /** Notification delivery — transactional outbox channel dispatch. */
  NOTIFICATION_DELIVERY: 'notification.delivery',
  PAYMENT_EMAIL: 'payment.email',
  TASK_AUTOMATION: 'task.automation',
  /** Booking domain events — transactional outbox dispatch. */
  BOOKING_DOMAIN_EVENTS: 'booking.domain.events',
  /** Battery Health V2 — typed async jobs (observation, assessment, HV reconcile). */
  BATTERY_V2: 'battery.v2',
  /** Voice provider webhook async processing — lifecycle correlation. */
  VOICE_WEBHOOK_PROCESS: 'voice.webhook.process',
  /** Device connection webhook inbox async processing — connectivity retry/DLQ. */
  CONNECTIVITY_WEBHOOK_PROCESS: 'connectivity.webhook.process',
} as const;
