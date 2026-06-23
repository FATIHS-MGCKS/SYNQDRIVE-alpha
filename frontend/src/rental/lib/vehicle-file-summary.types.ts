export type VehicleDocumentUiStatus =
  | 'missing'
  | 'uploaded'
  | 'processing'
  | 'needs_review'
  | 'verified'
  | 'applied'
  | 'expiring_soon'
  | 'expired'
  | 'error'
  | 'archived';

export type VehicleDocumentCategoryId =
  | 'registration'
  | 'insurance'
  | 'tax'
  | 'leasing_financing'
  | 'tuv_hu'
  | 'bokraft'
  | 'service_proof'
  | 'repair_proof'
  | 'tire_proof'
  | 'brake_proof'
  | 'battery_proof'
  | 'damage_accident'
  | 'other';

export interface ComplianceDisplayItem {
  label: string;
  status: 'good' | 'warning' | 'critical' | 'unknown' | 'not_applicable';
  uiStatus: Extract<VehicleDocumentUiStatus, 'verified' | 'expiring_soon' | 'expired' | 'missing'>;
  validTill: string | null;
  lastDate: string | null;
  source: 'service_compliance_service' | 'rental_health_service';
  detail: string;
}

export interface VehicleDocumentCategorySummary {
  id: VehicleDocumentCategoryId;
  label: string;
  uiStatus: VehicleDocumentUiStatus;
  statusSource: string;
  documentCount: number;
  latestExtractionId: string | null;
  latestFileName: string | null;
  complianceDisplay: ComplianceDisplayItem | null;
}

export interface VehicleFileSummary {
  vehicle: {
    id: string;
    vin: string | null;
    licensePlate: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    odometerKm: number | null;
    organizationId: string | null;
  };
  canonicalStatus: {
    rentalHealthStatus: 'healthy' | 'warning' | 'critical' | 'blocked' | 'unknown' | null;
    rentalHealthSource: 'rental_health_service' | 'not_available';
    rentalBlocked: boolean;
    blockingReasons: string[];
    serviceCompliance: {
      tuv: ComplianceDisplayItem | null;
      bokraft: ComplianceDisplayItem | null;
      nextService: ComplianceDisplayItem | null;
    };
    note: string;
  };
  documentCategories: VehicleDocumentCategorySummary[];
  mandatoryDocumentCoverage: { configured: number; total: number };
  fixedCosts: {
    currency: string;
    monthlyTotal: number | null;
    items: Array<{
      key: string;
      label: string;
      amountMonthly: number | null;
      amountYearly: number | null;
      source: string;
      evidenceDocumentId: string | null;
      evidenceFileName: string | null;
      status: string;
    }>;
  };
  variableCostAverages: {
    serviceAverageMonthly: number | null;
    repairAverageMonthly: number | null;
    sampleServiceEvents: number;
    sampleRepairEvents: number;
    source: string;
  };
  technicalSpecs: {
    general: Array<{ key: string; label: string; value: string | number | null; source: string }>;
    lvBattery: Array<{ key: string; label: string; value: string | number | null; source: string }>;
    hvBattery: Array<{ key: string; label: string; value: string | number | null; source: string }> | null;
    tankEngine: Array<{ key: string; label: string; value: string | number | null; source: string }> | null;
  };
  pendingReviews: {
    count: number;
    items: Array<{
      id: string;
      documentType: string;
      status: string;
      sourceFileName: string | null;
      uiStatus: VehicleDocumentUiStatus;
    }>;
  };
  evidenceCounts: { tuv: number; service: number; repair: number };
  timeline: Array<{
    id: string;
    kind: string;
    title: string;
    subtitle: string | null;
    occurredAt: string;
    uiStatus: string;
    source: string;
    relatedExtractionId?: string | null;
    relatedServiceEventId?: string | null;
  }>;
}

export function formatEuroAmount(value: number | null | undefined, locale = 'de-DE'): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

export function uiStatusLabel(status: VehicleDocumentUiStatus, de: boolean): string {
  const map: Record<VehicleDocumentUiStatus, [string, string]> = {
    missing: ['Missing', 'Fehlt'],
    uploaded: ['Uploaded', 'Hochgeladen'],
    processing: ['Processing', 'Verarbeitung'],
    needs_review: ['Needs review', 'Review nötig'],
    verified: ['Verified', 'Verifiziert'],
    applied: ['Applied', 'Angewendet'],
    expiring_soon: ['Expiring soon', 'Läuft ab'],
    expired: ['Expired', 'Abgelaufen'],
    error: ['Error', 'Fehler'],
    archived: ['Archived', 'Archiviert'],
  };
  return de ? map[status][1] : map[status][0];
}

export function uiStatusTone(
  status: VehicleDocumentUiStatus,
): 'success' | 'watch' | 'critical' | 'info' | 'neutral' {
  if (status === 'applied' || status === 'verified') return 'success';
  if (status === 'needs_review' || status === 'processing' || status === 'expiring_soon') return 'watch';
  if (status === 'expired' || status === 'error') return 'critical';
  if (status === 'uploaded') return 'info';
  return 'neutral';
}
