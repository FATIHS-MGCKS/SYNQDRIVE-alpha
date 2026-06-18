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

export type ComplianceStatusSource = 'service_compliance_service' | 'rental_health_service';

export interface ComplianceDisplayItem {
  label: string;
  status: 'good' | 'warning' | 'critical' | 'unknown' | 'not_applicable';
  uiStatus: Extract<VehicleDocumentUiStatus, 'verified' | 'expiring_soon' | 'expired' | 'missing'>;
  validTill: string | null;
  lastDate: string | null;
  source: ComplianceStatusSource;
  detail: string;
}

export interface TechnicalSpecRow {
  key: string;
  label: string;
  value: string | number | null;
  source: string;
  updatedAt: string | null;
}

export interface VehicleDocumentExtractionSummary {
  id: string;
  documentType: string;
  status: string;
  sourceFileName: string | null;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  errorMessage: string | null;
  uiStatus: VehicleDocumentUiStatus;
}

export interface VehicleDocumentCategorySummary {
  id: VehicleDocumentCategoryId;
  label: string;
  uiStatus: VehicleDocumentUiStatus;
  statusSource:
    | 'document_extraction'
    | 'service_compliance_service'
    | 'vehicle_master_data'
    | 'insurance_module'
    | 'not_available';
  documentCount: number;
  latestExtractionId: string | null;
  latestFileName: string | null;
  complianceDisplay: ComplianceDisplayItem | null;
}

export interface VehicleFileTimelineItem {
  id: string;
  kind: 'document' | 'service_event' | 'compliance';
  title: string;
  subtitle: string | null;
  occurredAt: string;
  uiStatus: VehicleDocumentUiStatus | 'info';
  source: string;
  relatedExtractionId: string | null;
  relatedServiceEventId: string | null;
}

export interface VehicleFileFixedCostItem {
  key: 'leasing' | 'financing' | 'insurance' | 'tax' | 'telematics' | 'other';
  label: string;
  amountMonthly: number | null;
  amountYearly: number | null;
  source: 'vehicle_master_data' | 'document_evidence' | 'manual' | 'not_available';
  evidenceDocumentId: string | null;
  evidenceFileName: string | null;
  status: 'verified' | 'missing_evidence' | 'not_configured';
}

export interface VehicleFileVariableCostAverages {
  serviceAverageMonthly: number | null;
  repairAverageMonthly: number | null;
  sampleServiceEvents: number;
  sampleRepairEvents: number;
  source: 'service_events' | 'not_available';
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
  mandatoryDocumentCoverage: {
    configured: number;
    total: number;
  };

  fixedCosts: {
    currency: string;
    monthlyTotal: number | null;
    items: VehicleFileFixedCostItem[];
  };

  variableCostAverages: VehicleFileVariableCostAverages;

  technicalSpecs: {
    general: TechnicalSpecRow[];
    lvBattery: TechnicalSpecRow[];
    hvBattery: TechnicalSpecRow[] | null;
    tankEngine: TechnicalSpecRow[] | null;
  };

  pendingReviews: {
    count: number;
    items: VehicleDocumentExtractionSummary[];
  };

  evidenceCounts: {
    tuv: number;
    service: number;
    repair: number;
  };

  timeline: VehicleFileTimelineItem[];
}
