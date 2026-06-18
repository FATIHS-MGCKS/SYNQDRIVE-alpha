import type {
  VehicleDocumentCategoryId,
  VehicleDocumentCategorySummary,
  VehicleDocumentUiStatus,
} from '../../lib/vehicle-file-summary.types';

export const MANDATORY_CATEGORY_IDS: VehicleDocumentCategoryId[] = [
  'registration',
  'insurance',
  'tax',
  'leasing_financing',
];

export const CATEGORY_TO_DOC_TYPE: Record<VehicleDocumentCategoryId, string> = {
  registration: 'VEHICLE_CONDITION',
  insurance: 'OTHER',
  tax: 'INVOICE',
  leasing_financing: 'INVOICE',
  tuv_hu: 'TUV_REPORT',
  bokraft: 'BOKRAFT_REPORT',
  service_proof: 'SERVICE',
  repair_proof: 'INVOICE',
  tire_proof: 'TIRE',
  brake_proof: 'BRAKE',
  battery_proof: 'BATTERY',
  damage_accident: 'DAMAGE',
  other: 'OTHER',
};

export interface CategoryUiMeta {
  icon: string;
  shortTitle: string;
  description: string;
  emptyHint: string;
  tone: 'brand' | 'info' | 'success' | 'warning' | 'critical' | 'neutral';
}

export const CATEGORY_UI_META: Record<VehicleDocumentCategoryId, CategoryUiMeta> = {
  registration: {
    icon: 'car',
    shortTitle: 'Zulassung',
    description: 'Fahrzeugschein und Halterdaten',
    emptyHint: 'Lade den Fahrzeugschein hoch, damit Zulassungsdaten als Evidenz sichtbar werden.',
    tone: 'brand',
  },
  insurance: {
    icon: 'shield',
    shortTitle: 'Versicherung',
    description: 'Police, Deckung und Selbstbeteiligung',
    emptyHint: 'Lade die Versicherungspolice hoch, damit Kosten und Laufzeit als Evidenz sichtbar werden.',
    tone: 'success',
  },
  tax: {
    icon: 'receipt',
    shortTitle: 'Kfz-Steuer',
    description: 'Steuerbescheid und jährliche Last',
    emptyHint: 'Lade den Steuerbescheid hoch, um die Kfz-Steuer als Nachweis zu hinterlegen.',
    tone: 'warning',
  },
  leasing_financing: {
    icon: 'credit-card',
    shortTitle: 'Leasing / Finanzierung',
    description: 'Vertrag, Laufzeit und monatliche Rate',
    emptyHint: 'Lade den Leasing- oder Finanzierungsvertrag hoch.',
    tone: 'info',
  },
  tuv_hu: {
    icon: 'clipboard-check',
    shortTitle: 'HU / TÜV',
    description: 'Prüftermine und HU-Nachweise',
    emptyHint: 'TÜV-Status kommt aus Service Compliance — Nachweise ergänzen die Akte.',
    tone: 'success',
  },
  bokraft: {
    icon: 'shield-check',
    shortTitle: 'BOKraft',
    description: 'Betriebsgenehmigung und Prüfungen',
    emptyHint: 'BOKraft-Status kommt aus Service Compliance — Nachweise ergänzen die Akte.',
    tone: 'info',
  },
  service_proof: {
    icon: 'wrench',
    shortTitle: 'Service-Nachweise',
    description: 'Inspektionen, Ölwechsel und Wartung',
    emptyHint: 'Noch keine Service-Nachweise hinterlegt.',
    tone: 'info',
  },
  repair_proof: {
    icon: 'file-signature',
    shortTitle: 'Reparatur-Nachweise',
    description: 'Werkstattrechnungen und Belege',
    emptyHint: 'Noch keine Reparaturbelege hinterlegt.',
    tone: 'neutral',
  },
  tire_proof: {
    icon: 'circle',
    shortTitle: 'Reifen-Nachweise',
    description: 'Reifenwechsel und Profiltiefen',
    emptyHint: 'Noch keine Reifen-Nachweise hinterlegt.',
    tone: 'neutral',
  },
  brake_proof: {
    icon: 'disc',
    shortTitle: 'Bremsen-Nachweise',
    description: 'Bremsenservice und Messungen',
    emptyHint: 'Noch keine Bremsen-Nachweise hinterlegt.',
    tone: 'neutral',
  },
  battery_proof: {
    icon: 'battery',
    shortTitle: 'Batterie-Nachweise',
    description: 'LV/HV Batterie Service und Tests',
    emptyHint: 'Noch keine Batterie-Nachweise hinterlegt.',
    tone: 'neutral',
  },
  damage_accident: {
    icon: 'alert-triangle',
    shortTitle: 'Damage / Accident',
    description: 'Schadens- und Unfallberichte',
    emptyHint: 'Noch keine Schadens- oder Unfallberichte hinterlegt.',
    tone: 'critical',
  },
  other: {
    icon: 'file',
    shortTitle: 'Sonstige',
    description: 'Weitere Fahrzeugdokumente',
    emptyHint: 'Noch keine sonstigen Dokumente hinterlegt.',
    tone: 'neutral',
  },
};

const STATUS_SORT_RANK: Record<VehicleDocumentUiStatus, number> = {
  expired: 0,
  error: 1,
  missing: 2,
  needs_review: 3,
  processing: 4,
  uploaded: 5,
  expiring_soon: 6,
  verified: 7,
  applied: 8,
  archived: 9,
};

export function categorySortPriority(cat: VehicleDocumentCategorySummary): number {
  let rank = STATUS_SORT_RANK[cat.uiStatus] ?? 50;
  if (cat.complianceDisplay?.status === 'critical') rank -= 20;
  if (cat.uiStatus === 'missing' && MANDATORY_CATEGORY_IDS.includes(cat.id)) rank -= 5;
  if (cat.uiStatus === 'needs_review') rank -= 3;
  return rank;
}

export function sortDocumentCategories(
  categories: VehicleDocumentCategorySummary[],
): VehicleDocumentCategorySummary[] {
  return [...categories].sort((a, b) => categorySortPriority(a) - categorySortPriority(b));
}

export function formatStatusSource(source: string): string {
  const map: Record<string, string> = {
    rental_health_service: 'RentalHealth',
    service_compliance_service: 'Service Compliance',
    vehicle_master_data: 'Vehicle Master Data',
    document_extraction: 'AI Document Extraction',
    insurance_module: 'Versicherungsmodul',
    telemetry: 'Telemetry / Latest State',
    vehicle_battery_spec: 'Vehicle Master Data',
    service_events: 'Service Events',
    not_available: 'Nicht verfügbar',
  };
  return map[source] ?? source;
}

export function rentalHealthLabelDe(
  status: 'healthy' | 'warning' | 'critical' | 'blocked' | 'unknown' | null | undefined,
): string {
  switch (status) {
    case 'healthy':
      return 'Bereit';
    case 'warning':
      return 'Hinweis';
    case 'critical':
      return 'Kritisch';
    case 'blocked':
      return 'Gesperrt';
    default:
      return 'Unbekannt';
  }
}
