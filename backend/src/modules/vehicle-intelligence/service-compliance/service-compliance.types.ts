export type ServiceTrackingStatus = 'TRACKED' | 'NO_TRACKING' | 'STALE';
export type ServiceComplianceSeverity = 'GOOD' | 'WARNING' | 'CRITICAL' | 'INFO';
export type ServiceNextSource = 'HM_OEM' | null;

/** Canonical HM/OEM next-service read model — single source for all consumers. */
export interface NextServiceComplianceDto {
  trackingStatus: ServiceTrackingStatus;
  source: ServiceNextSource;
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
  lastUpdatedAt: string | null;
  serviceSourceLabel: string | null;
  severity: ServiceComplianceSeverity;
  blocksRental: boolean;
  title: string;
  description: string;
  message: string;
  hmDistanceFromOem: boolean;
  hmTimeFromOem: boolean;
  /** Projected due date derived from HM days — never a manual operator due date. */
  hmDerivedDueDate: string | null;
}

export interface TuvBokraftComplianceDto {
  tuvValidTill: string | null;
  tuvRemainingMonths: number | null;
  tuvRemainingDays: number | null;
  tuvOverdue: boolean;
  tuvLastDate: string | null;
  bokraftValidTill: string | null;
  bokraftRemainingMonths: number | null;
  bokraftRemainingDays: number | null;
  bokraftOverdue: boolean;
  bokraftLastDate: string | null;
}

export interface ServiceComplianceEvaluation {
  nextService: NextServiceComplianceDto;
  tuvBokraft: TuvBokraftComplianceDto;
}

import type { ServiceOverdueTaskContext } from './service-overdue-task.util';

export type ComplianceTaskSignalKind =
  | 'SERVICE_SCHEDULE'
  | 'SERVICE_URGENT'
  | 'TUV_SCHEDULE'
  | 'TUV_URGENT'
  | 'BOKRAFT_SCHEDULE'
  | 'BOKRAFT_URGENT';

/** Actionable task signal for Health UI / manual materialization — from ServiceComplianceService only. */
export interface ComplianceTaskSignalDto {
  signalKey: string;
  dedupeKey: string;
  kind: ComplianceTaskSignalKind;
  insightType: string;
  title: string;
  message: string;
  actionLabel: string;
  severity: 'WARNING' | 'CRITICAL';
  suggestionOnly: boolean;
  blocksRental: boolean;
  dueDate: string | null;
  category: string;
  taskType: string;
  /** Structured overdue context for task materialization — single source with insights. */
  serviceOverdueContext?: ServiceOverdueTaskContext | null;
}
