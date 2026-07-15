import type { InsightType, TaskPriority, TaskSource, TaskType } from '@prisma/client';

/** Stable catalog key for canonical materialization rules (no magic strings in services). */
export type TaskAutomationCatalogKey =
  | 'BOOKING_PREPARATION'
  | 'BOOKING_PICKUP'
  | 'BOOKING_RETURN'
  | 'DOCUMENT_PACKAGE_INCOMPLETE'
  | 'INVOICE_PAYMENT_CHECK'
  | 'VEHICLE_CLEANING_REQUIRED'
  | 'VEHICLE_SERVICE_OVERDUE'
  | 'VEHICLE_INSPECTION_TUV_DUE'
  | 'VEHICLE_INSPECTION_BOKRAFT_DUE'
  | 'REPAIR_REQUIRED'
  | 'TIRE_CRITICAL_HEALTH'
  | 'BRAKE_CRITICAL_HEALTH'
  | 'BATTERY_CRITICAL_HEALTH';

export type TaskAutomationRuleScope = 'ORG' | 'PLATFORM';

export type TaskAutomationActivationStrategy =
  | 'ON_BOOKING_CONFIRMED'
  | 'ON_BOOKING_ACTIVE'
  | 'ON_DOCUMENT_PACKAGE_GAP'
  | 'ON_INVOICE_PAYMENT_OPEN'
  | 'ON_VEHICLE_NEEDS_CLEANING'
  | 'ON_INSIGHT_MATERIALIZE'
  | 'ON_VENDOR_REPAIR_REQUEST'
  | 'ON_LIFECYCLE_EVENT'
  | 'MANUAL_ONLY';

export type TaskAutomationDueStrategy =
  | 'BOOKING_PREPARATION_TIMING'
  | 'BOOKING_PICKUP_MILESTONE'
  | 'BOOKING_RETURN_MILESTONE'
  | 'INVOICE_DUE_DATE'
  | 'INSIGHT_TIME_CONTEXT'
  | 'IMMEDIATE'
  | 'NONE';

export type TaskAutomationAssignmentStrategy =
  | 'UNASSIGNED'
  | 'STATION_FROM_BOOKING'
  | 'INHERIT_FROM_CONTEXT';

export type TaskAutomationDedupScopeKind =
  | 'PER_BOOKING'
  | 'PER_BOOKING_PHASE'
  | 'PER_INVOICE'
  | 'PER_VEHICLE_CLEANING_WINDOW'
  | 'PER_VEHICLE'
  | 'PER_VEHICLE_VENDOR_REASON'
  | 'NONE';

export interface TaskAutomationDedupScope {
  kind: TaskAutomationDedupScopeKind;
  /** Human-readable template — builders live in domain utils, not in JSON config. */
  keyTemplate: string;
  legacyKeyTemplates?: string[];
}

export interface TaskAutomationConfigurableField {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  defaultValue: string | number | boolean | null;
  descriptionDe?: string;
  /** When true, organizations may override this field via OrgTaskAutomationRuleOverride. */
  orgOverridable?: boolean;
}

/** Standard org override columns backed by OrgTaskAutomationRuleOverride. */
export type TaskAutomationOrgOverrideFieldKey =
  | 'enabled'
  | 'activationOffsetMinutes'
  | 'dueOffsetMinutes'
  | 'priority'
  | 'assignmentStrategy'
  | 'assignedUserId'
  | 'assignedRoleKey'
  | 'stationScope'
  | 'escalationConfig'
  | 'notificationConfig'
  | 'checklistOverrides';

export const TASK_AUTOMATION_ORG_OVERRIDE_FIELD_KEYS: readonly TaskAutomationOrgOverrideFieldKey[] = [
  'enabled',
  'activationOffsetMinutes',
  'dueOffsetMinutes',
  'priority',
  'assignmentStrategy',
  'assignedUserId',
  'assignedRoleKey',
  'stationScope',
  'escalationConfig',
  'notificationConfig',
  'checklistOverrides',
] as const;

export type TaskAutomationConfigSource = 'PLATFORM_DEFAULT' | 'ORG_OVERRIDE';

export interface EffectiveTaskAutomationField<T> {
  value: T;
  source: TaskAutomationConfigSource;
}

export interface TaskAutomationPlatformDefaults {
  enabled: boolean;
  activationOffsetMinutes: number;
  dueOffsetMinutes: number;
  priority: TaskPriority;
  assignmentStrategy: TaskAutomationAssignmentStrategy;
  assignedUserId: string | null;
  assignedRoleKey: string | null;
  stationScope: string | null;
  escalationConfig: Record<string, unknown> | null;
  notificationConfig: Record<string, unknown> | null;
  checklistOverrides: Record<string, unknown> | null;
  ruleConfig: Record<string, string | number | boolean | null>;
}

export interface TaskAutomationOrgOverrideSnapshot {
  id: string;
  organizationId: string;
  ruleId: string;
  enabled: boolean | null;
  activationOffsetMinutes: number | null;
  dueOffsetMinutes: number | null;
  priority: TaskPriority | null;
  assignmentStrategy: string | null;
  assignedUserId: string | null;
  assignedRoleKey: string | null;
  stationScope: string | null;
  escalationConfig: Record<string, unknown> | null;
  notificationConfig: Record<string, unknown> | null;
  checklistOverrides: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedTaskAutomationRule {
  ruleId: string;
  catalogVersion: number;
  catalogKey: TaskAutomationCatalogKey | null;
  materializesTask: boolean;
  default: TaskAutomationPlatformDefaults;
  override: TaskAutomationOrgOverrideSnapshot | null;
  effective: TaskAutomationPlatformDefaults;
  fieldProvenance: Record<string, EffectiveTaskAutomationField<unknown>>;
  /** False when the org disabled the rule — future materializations must be skipped. */
  effectivelyEnabled: boolean;
}

export interface TaskAutomationRuleDefinition {
  /** Present on materialization rules; lifecycle helpers omit this. */
  catalogKey?: TaskAutomationCatalogKey;
  ruleId: string;
  version: number;
  nameDe: string;
  descriptionDe: string;
  sourceType: TaskSource;
  taskType: TaskType | null;
  defaultEnabled: boolean;
  activationStrategy: TaskAutomationActivationStrategy;
  dueStrategy: TaskAutomationDueStrategy;
  defaultPriority: TaskPriority;
  assignmentStrategy: TaskAutomationAssignmentStrategy;
  dedupScope: TaskAutomationDedupScope;
  autoResolveCondition: string;
  supersedeConditions: string[];
  checklistTemplateId: TaskType | null;
  configurableFields: TaskAutomationConfigurableField[];
  protectedFields: string[];
  /** Operational source label stored on OrgTask.source */
  source: string;
  /** UI category label */
  category: string;
  /** When set, maps insight detector type to this catalog rule */
  insightType?: InsightType;
  /** Whether this rule materializes an OrgTask row */
  materializesTask: boolean;
}

export interface TaskAutomationMetadataRef {
  ruleId: string;
  ruleVersion: number;
  ruleScope: TaskAutomationRuleScope;
}
