/**
 * Canonical notification domain enums (backend source of truth).
 * Frontend queue model maps to/from these values at integration boundaries.
 */

/** Display / escalation severity — independent from lifecycle and read state. */
export enum NotificationSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
}

/** Persistent lifecycle of a notification record. */
export enum NotificationStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  SNOOZED = 'SNOOZED',
  RESOLVED = 'RESOLVED',
  ARCHIVED = 'ARCHIVED',
}

/** Per-user or per-recipient read tracking — does not change severity. */
export enum NotificationReadState {
  UNREAD = 'UNREAD',
  READ = 'READ',
}

/** Channel delivery outcome — orthogonal to lifecycle and read state. */
export enum NotificationDeliveryState {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  SUPPRESSED = 'SUPPRESSED',
  FAILED = 'FAILED',
}

export enum NotificationDomain {
  OPERATIONS = 'OPERATIONS',
  VEHICLE_HEALTH = 'VEHICLE_HEALTH',
  DRIVING_ANALYSIS = 'DRIVING_ANALYSIS',
  BOOKINGS = 'BOOKINGS',
  HANDOVERS = 'HANDOVERS',
  DOCUMENTS = 'DOCUMENTS',
  BILLING = 'BILLING',
  SECURITY = 'SECURITY',
  SYSTEM = 'SYSTEM',
}

export enum NotificationEntityType {
  VEHICLE = 'VEHICLE',
  BOOKING = 'BOOKING',
  STATION = 'STATION',
  CUSTOMER = 'CUSTOMER',
  INVOICE = 'INVOICE',
  TRIP = 'TRIP',
  FLEET = 'FLEET',
  ORGANIZATION = 'ORGANIZATION',
}

export enum NotificationActionType {
  OPEN_VEHICLE = 'OPEN_VEHICLE',
  OPEN_VEHICLE_MODULE = 'OPEN_VEHICLE_MODULE',
  OPEN_BOOKING = 'OPEN_BOOKING',
  OPEN_HANDOVER_PICKUP = 'OPEN_HANDOVER_PICKUP',
  OPEN_HANDOVER_RETURN = 'OPEN_HANDOVER_RETURN',
  OPEN_STATION = 'OPEN_STATION',
  OPEN_BILLING = 'OPEN_BILLING',
  OPEN_RENTAL = 'OPEN_RENTAL',
}

/** Producer system that emitted the candidate — not the UI surface. */
export enum NotificationSourceType {
  DASHBOARD_INSIGHT = 'DASHBOARD_INSIGHT',
  OPERATIONAL_ISSUE = 'OPERATIONAL_ISSUE',
  PREDICTIVE_INSIGHT = 'PREDICTIVE_INSIGHT',
  DERIVED_INSIGHT = 'DERIVED_INSIGHT',
  BOOKING_TILE = 'BOOKING_TILE',
  HEALTH_ALERT = 'HEALTH_ALERT',
  RUNTIME = 'RUNTIME',
  WORKFLOW = 'WORKFLOW',
  SYSTEM = 'SYSTEM',
}

/**
 * EVENT — point-in-time fact (booking created, vehicle returned).
 * STATE — ongoing condition until cleared (TÜV overdue, telemetry degraded).
 */
export enum NotificationEventKind {
  EVENT = 'EVENT',
  STATE = 'STATE',
}
