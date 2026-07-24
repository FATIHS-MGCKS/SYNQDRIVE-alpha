export const DATA_PROCESSING_SECTIONS = [
  'activities',
  'enforcement',
  'providers',
  'consents',
  'partners',
  'audit',
] as const;

export type DataProcessingSectionId = (typeof DATA_PROCESSING_SECTIONS)[number];

export const DATA_PROCESSING_DISCLAIMER =
  'Technische Übersicht zur Datenverarbeitungs-Governance — keine pauschale DSGVO-Konformitätsbehauptung.';

export const ENFORCEMENT_STATUS_LABELS: Record<string, string> = {
  ENFORCED: 'Durchgesetzt',
  PARTIALLY_ENFORCED: 'Teilweise',
  NOT_IMPLEMENTED: 'Nicht implementiert',
  ENFORCEMENT_ERROR: 'Fehler',
  DISABLED: 'Deaktiviert',
};

export const LIFECYCLE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf',
  APPROVED: 'Freigegeben',
  SCHEDULED: 'Geplant',
  ACTIVE: 'Aktiv',
  SUSPENDED: 'Ausgesetzt',
  REVOKED: 'Widerrufen',
  EXPIRED: 'Abgelaufen',
  SUPERSEDED: 'Ersetzt',
  REJECTED: 'Abgelehnt',
};
