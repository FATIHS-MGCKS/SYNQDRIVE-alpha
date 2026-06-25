import type {
  ComplaintLifecycleStatus,
  ComplaintSource,
  ComplaintUrgency,
  TechnicalObservationAffectedArea,
  TechnicalObservationCategory,
  VehicleComplaint,
} from '@prisma/client';

export type TechnicalObservationSeverity = 'low' | 'medium' | 'high' | 'critical';

export type TechnicalObservationStatus =
  | 'new'
  | 'active'
  | 'in_review'
  | 'converted'
  | 'resolved'
  | 'dismissed';

export type TechnicalObservationSource =
  | 'manual'
  | 'operator_return'
  | 'operator_handover'
  | 'customer_report'
  | 'staff_inspection'
  | 'ai_upload'
  | 'system_import'
  | 'field_agent';

export type TechnicalObservationCategoryApi =
  | 'exterior'
  | 'interior'
  | 'lights'
  | 'wipers_windows'
  | 'wheels_tires'
  | 'electronics_controls'
  | 'noise_vibration'
  | 'driving_behavior'
  | 'comfort'
  | 'other';

export type TechnicalObservationAffectedAreaApi =
  | 'front'
  | 'rear'
  | 'left'
  | 'right'
  | 'interior'
  | 'dashboard'
  | 'lights'
  | 'wheels'
  | 'tires'
  | 'engine_bay'
  | 'trunk'
  | 'unknown';

export interface TechnicalObservationDto {
  id: string;
  orgId: string;
  vehicleId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  createdByWorkerId: string | null;
  source: TechnicalObservationSource;
  title: string | null;
  shortLabel: string | null;
  description: string;
  category: TechnicalObservationCategoryApi | null;
  affectedArea: TechnicalObservationAffectedAreaApi | null;
  severity: TechnicalObservationSeverity;
  status: TechnicalObservationStatus;
  blocksRental: boolean;
  bookingId: string | null;
  customerId: string | null;
  driverId: string | null;
  handoverProtocolId: string | null;
  stationId: string | null;
  locationContext: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  dismissedAt: string | null;
  convertedToTaskId: string | null;
  linkedDamageId: string | null;
  linkedServiceEventId: string | null;
  linkedServiceCaseId: string | null;
  linkedServiceTaskId: string | null;
  notes: string | null;
  /** Legacy region field (free text) */
  region: string | null;
  /** Legacy impact classification — read-only for backward compatibility */
  impact: string | null;
}

export const ACTIVE_OBSERVATION_DB_STATUSES: ComplaintLifecycleStatus[] = [
  'ACTIVE',
  'OPEN',
  'IN_REVIEW',
  'CONFIRMED',
  'NEW',
];

const SEVERITY_TO_URGENCY: Record<TechnicalObservationSeverity, ComplaintUrgency> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

const URGENCY_TO_SEVERITY: Record<ComplaintUrgency, TechnicalObservationSeverity> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

const STATUS_TO_DB: Record<TechnicalObservationStatus, ComplaintLifecycleStatus> = {
  new: 'NEW',
  active: 'ACTIVE',
  in_review: 'IN_REVIEW',
  converted: 'CONVERTED',
  resolved: 'RESOLVED',
  dismissed: 'DISMISSED',
};

const DB_TO_STATUS: Record<string, TechnicalObservationStatus> = {
  NEW: 'new',
  ACTIVE: 'active',
  OPEN: 'active',
  IN_REVIEW: 'in_review',
  CONFIRMED: 'active',
  CONVERTED: 'converted',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
  REJECTED: 'dismissed',
};

const SOURCE_TO_DB: Record<TechnicalObservationSource, ComplaintSource> = {
  manual: 'MANUAL',
  field_agent: 'FIELD_AGENT',
  operator_return: 'OPERATOR_RETURN',
  operator_handover: 'OPERATOR_HANDOVER',
  customer_report: 'CUSTOMER_REPORT',
  staff_inspection: 'STAFF_INSPECTION',
  ai_upload: 'AI_UPLOAD',
  system_import: 'SYSTEM_IMPORT',
};

const DB_TO_SOURCE: Record<string, TechnicalObservationSource> = {
  MANUAL: 'manual',
  FIELD_AGENT: 'field_agent',
  OPERATOR_RETURN: 'operator_return',
  OPERATOR_HANDOVER: 'operator_handover',
  CUSTOMER_REPORT: 'customer_report',
  STAFF_INSPECTION: 'staff_inspection',
  AI_UPLOAD: 'ai_upload',
  SYSTEM_IMPORT: 'system_import',
};

const CATEGORY_TO_DB: Record<TechnicalObservationCategoryApi, TechnicalObservationCategory> = {
  exterior: 'EXTERIOR',
  interior: 'INTERIOR',
  lights: 'LIGHTS',
  wipers_windows: 'WIPERS_WINDOWS',
  wheels_tires: 'WHEELS_TIRES',
  electronics_controls: 'ELECTRONICS_CONTROLS',
  noise_vibration: 'NOISE_VIBRATION',
  driving_behavior: 'DRIVING_BEHAVIOR',
  comfort: 'COMFORT',
  other: 'OTHER',
};

const DB_TO_CATEGORY: Record<string, TechnicalObservationCategoryApi> = Object.fromEntries(
  Object.entries(CATEGORY_TO_DB).map(([k, v]) => [v, k as TechnicalObservationCategoryApi]),
) as Record<string, TechnicalObservationCategoryApi>;

const AREA_TO_DB: Record<TechnicalObservationAffectedAreaApi, TechnicalObservationAffectedArea> = {
  front: 'FRONT',
  rear: 'REAR',
  left: 'LEFT',
  right: 'RIGHT',
  interior: 'INTERIOR',
  dashboard: 'DASHBOARD',
  lights: 'LIGHTS',
  wheels: 'WHEELS',
  tires: 'TIRES',
  engine_bay: 'ENGINE_BAY',
  trunk: 'TRUNK',
  unknown: 'UNKNOWN',
};

const DB_TO_AREA: Record<string, TechnicalObservationAffectedAreaApi> = Object.fromEntries(
  Object.entries(AREA_TO_DB).map(([k, v]) => [v, k as TechnicalObservationAffectedAreaApi]),
) as Record<string, TechnicalObservationAffectedAreaApi>;

export function parseSeverity(input?: string | null): ComplaintUrgency {
  const key = (input ?? 'medium').toLowerCase() as TechnicalObservationSeverity;
  return SEVERITY_TO_URGENCY[key] ?? 'MEDIUM';
}

export function parseSource(input?: string | null): ComplaintSource {
  const key = (input ?? 'manual').toLowerCase() as TechnicalObservationSource;
  return SOURCE_TO_DB[key] ?? 'MANUAL';
}

export function parseCategory(input?: string | null): TechnicalObservationCategory | null {
  if (!input) return null;
  const key = input.toLowerCase() as TechnicalObservationCategoryApi;
  return CATEGORY_TO_DB[key] ?? null;
}

export function parseAffectedArea(input?: string | null): TechnicalObservationAffectedArea | null {
  if (!input) return null;
  const key = input.toLowerCase() as TechnicalObservationAffectedAreaApi;
  return AREA_TO_DB[key] ?? null;
}

export function parseStatus(input?: string | null): ComplaintLifecycleStatus | null {
  if (!input) return null;
  const key = input.toLowerCase() as TechnicalObservationStatus;
  return STATUS_TO_DB[key] ?? null;
}

export function mapObservationRow(row: VehicleComplaint): TechnicalObservationDto {
  const shortLabel =
    row.title?.trim() ||
    (row.description.length > 72 ? `${row.description.slice(0, 72)}…` : row.description);

  return {
    id: row.id,
    orgId: row.organizationId,
    vehicleId: row.vehicleId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByWorkerId: row.createdByWorkerId,
    source: DB_TO_SOURCE[row.source] ?? 'manual',
    title: row.title,
    shortLabel,
    description: row.description,
    category: row.category ? DB_TO_CATEGORY[row.category] ?? null : null,
    affectedArea: row.affectedArea ? DB_TO_AREA[row.affectedArea] ?? null : null,
    severity: URGENCY_TO_SEVERITY[row.urgency],
    status: DB_TO_STATUS[row.status] ?? 'active',
    blocksRental: row.blocksRental,
    bookingId: row.bookingId,
    customerId: row.customerId,
    driverId: row.driverId,
    handoverProtocolId: row.handoverProtocolId,
    stationId: row.stationId,
    locationContext: row.locationContext,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: row.resolvedByUserId,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
    convertedToTaskId: row.convertedToTaskId,
    linkedDamageId: row.linkedDamageId,
    linkedServiceEventId: row.linkedServiceEventId,
    linkedServiceCaseId: row.linkedServiceCaseId,
    linkedServiceTaskId: row.linkedServiceTaskId,
    notes: row.notes,
    region: row.region,
    impact: row.impact,
  };
}

export function isActiveObservation(row: Pick<VehicleComplaint, 'status'>): boolean {
  return ACTIVE_OBSERVATION_DB_STATUSES.includes(row.status);
}
