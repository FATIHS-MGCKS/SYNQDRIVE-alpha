import type {
  ApiTask,
  ApiTaskPriority,
  ApiTaskType,
  ComplianceTaskSignal,
  RentalHealthModule,
  RentalHealthSourceFinding,
  RentalHealthState,
  Vendor,
} from '../../lib/api';
import { HEALTH_FINDING_IDENTITY_VERSION } from './health-finding-identity.types';
import { preferredVendorsForVehicle } from './service-task-semantics';

export type HealthActionModule =
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'error_codes'
  | 'service_compliance'
  | 'vehicle_alerts'
  | 'complaints';

export interface HealthTaskMetadata {
  sourceType: 'HEALTH';
  organizationId: string;
  vehicleId: string;
  healthModule: HealthActionModule;
  sourceFindingId?: string;
  findingCode?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  findingVersion?: string;
  blockingReasonCode?: string;
  healthState?: RentalHealthState;
  healthReason?: string;
  origin?: string;
  notificationId?: string;
  notificationEventType?: string;
  complianceKind?: string;
}

export interface HealthTaskPrefill {
  title: string;
  description: string;
  type: ApiTaskType;
  priority: ApiTaskPriority;
  category?: string;
  dueDate?: string;
  blocksVehicleAvailability?: boolean;
  vendorId?: string;
  sourceType: 'HEALTH';
  sourceKey: string;
  metadata: HealthTaskMetadata;
}

const OPEN_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING']);

/**
 * Default task types for Health→Task prefill only.
 * Never used as finding identity or duplicate-match signal.
 */
export const MODULE_PREFILL_TASK_TYPES: Record<HealthActionModule, ApiTaskType> = {
  tires: 'TIRE_CHECK',
  brakes: 'BRAKE_CHECK',
  battery: 'BATTERY_CHECK',
  error_codes: 'REPAIR',
  service_compliance: 'VEHICLE_INSPECTION',
  vehicle_alerts: 'REPAIR',
  complaints: 'VEHICLE_SERVICE',
};

/** Legacy module-only matching — only semantically unambiguous task types. */
const MODULE_LEGACY_UNAMBIGUOUS_TYPES: Record<HealthActionModule, ApiTaskType[]> = {
  tires: ['TIRE_CHECK'],
  brakes: ['BRAKE_CHECK'],
  battery: ['BATTERY_CHECK'],
  error_codes: [],
  service_compliance: ['VEHICLE_INSPECTION'],
  vehicle_alerts: [],
  complaints: [],
};

export type HealthTaskDuplicateMatchKind = 'exact' | 'legacy' | 'possibly_related' | 'none';

export interface HealthTaskDuplicateQuery {
  organizationId: string;
  vehicleId: string;
  module: HealthActionModule;
  sourceFindingId?: string | null;
}

export interface HealthTaskDuplicateResult {
  /** Confirmed duplicate (exact or controlled legacy). */
  task: ApiTask | null;
  matchKind: HealthTaskDuplicateMatchKind;
  /** Weak module/type signal — informational only, never suppresses create. */
  possiblyRelatedTask: ApiTask | null;
}

const MODULE_SERVICE_KEYWORDS: Record<HealthActionModule, string[]> = {
  tires: ['tire', 'reifen'],
  brakes: ['brake', 'bremse'],
  battery: ['battery', 'ev'],
  error_codes: ['electrical', 'workshop', 'general'],
  service_compliance: ['tüv', 'inspection', 'service', 'hu'],
  vehicle_alerts: ['workshop', 'general'],
  complaints: [],
};

const SEVERITY_RANK: Record<RentalHealthSourceFinding['severity'], number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  info: 3,
};

export function healthModuleNeedsAction(
  mod: RentalHealthModule | undefined | null,
): boolean {
  if (!mod) return false;
  return mod.state === 'critical' || mod.state === 'warning';
}

export function priorityForHealthState(state: RentalHealthState | undefined): ApiTaskPriority {
  if (state === 'critical') return 'CRITICAL';
  if (state === 'warning') return 'HIGH';
  return 'NORMAL';
}

export function suggestedVendorForHealthModule(
  vendors: Vendor[],
  vehicleId: string,
  module: HealthActionModule,
): string | undefined {
  const preferred = preferredVendorsForVehicle(vendors, vehicleId);
  if (!preferred.length) return undefined;
  const keywords = MODULE_SERVICE_KEYWORDS[module];
  if (!keywords.length) return preferred[0]?.id;
  const match = vendors.find((v) =>
    preferred.some((p) => p.id === v.id) &&
    v.serviceAreas?.some((sa) =>
      keywords.some((kw) => sa.toLowerCase().includes(kw)),
    ),
  );
  return match?.id ?? preferred[0]?.id;
}

export function pickPrimarySourceFinding(
  rentalModule?: RentalHealthModule | null,
): RentalHealthSourceFinding | null {
  const findings = listActionableSourceFindings(rentalModule);
  if (findings.length) return findings[0];
  const all = rentalModule?.source_findings ?? [];
  if (!all.length) return null;
  return [...all].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  )[0];
}

/** Actionable findings for task/case linking — one row per finding, not merged by module. */
export function listActionableSourceFindings(
  rentalModule?: RentalHealthModule | null,
): RentalHealthSourceFinding[] {
  const findings = rentalModule?.source_findings ?? [];
  if (!findings.length) return [];
  return [...findings]
    .filter((f) => f.severity === 'critical' || f.severity === 'warning')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export interface HealthFindingTaskState {
  finding: RentalHealthSourceFinding | null;
  prefill: HealthTaskPrefill;
  duplicate: HealthTaskDuplicateResult;
  hasExactTask: boolean;
  canCreate: boolean;
}

export interface ModuleFindingTaskCoverage {
  findings: RentalHealthSourceFinding[];
  findingCount: number;
  findingStates: HealthFindingTaskState[];
  linkedFindingCount: number;
  unlinkedFindingCount: number;
  primaryLinkedTaskId: string | null;
  primaryPossiblyRelatedTaskId: string | null;
}

export function buildModuleFindingTaskCoverage(opts: {
  module: HealthActionModule;
  organizationId: string;
  vehicleId: string;
  rentalModule?: RentalHealthModule | null;
  openTasks: ApiTask[];
  contextLines?: string[];
  dtcCodes?: string[];
  dueDate?: string | null;
  vendors?: Vendor[];
  blocksRental?: boolean;
  blockingReasonCode?: string | null;
  origin?: string;
}): ModuleFindingTaskCoverage {
  const actionable = listActionableSourceFindings(opts.rentalModule);
  const findingSeeds: Array<RentalHealthSourceFinding | null> =
    actionable.length > 0
      ? actionable
      : healthModuleNeedsAction(opts.rentalModule)
        ? [null]
        : [];

  const findingStates: HealthFindingTaskState[] = findingSeeds.map((finding) => {
    const prefill = buildHealthTaskPrefill({
      module: opts.module,
      organizationId: opts.organizationId,
      vehicleId: opts.vehicleId,
      rentalModule: opts.rentalModule,
      sourceFinding: finding,
      contextLines: finding?.reason
        ? [finding.reason, ...(opts.contextLines ?? [])]
        : opts.contextLines,
      dtcCodes:
        opts.module === 'error_codes' && finding?.source_entity_type === 'dtc_code'
          ? [finding.source_entity_id.toUpperCase()]
          : opts.dtcCodes,
      dueDate: opts.dueDate,
      vendors: opts.vendors,
      blocksRental: opts.blocksRental,
      blockingReasonCode: opts.blockingReasonCode,
      origin: opts.origin,
    });
    const duplicate = findDuplicateHealthTask(opts.openTasks, {
      organizationId: opts.organizationId,
      vehicleId: opts.vehicleId,
      module: opts.module,
      sourceFindingId: finding?.source_finding_id ?? prefill.metadata.sourceFindingId,
    });
    const hasExactTask = duplicate.matchKind === 'exact';
    return {
      finding,
      prefill,
      duplicate,
      hasExactTask,
      canCreate: !hasExactTask,
    };
  });

  const linkedFindingCount = findingStates.filter((s) => s.hasExactTask).length;
  const unlinkedFindingCount = findingStates.filter((s) => s.canCreate).length;
  const primaryLinked = findingStates.find((s) => s.hasExactTask);
  const primaryPossiblyRelated = findingStates.find(
    (s) =>
      !s.hasExactTask &&
      (s.duplicate.matchKind === 'legacy' || s.duplicate.matchKind === 'possibly_related'),
  );

  return {
    findings: actionable,
    findingCount: actionable.length || findingStates.length,
    findingStates,
    linkedFindingCount,
    unlinkedFindingCount,
    primaryLinkedTaskId: primaryLinked?.duplicate.task?.id ?? null,
    primaryPossiblyRelatedTaskId:
      primaryPossiblyRelated?.duplicate.task?.id ??
      primaryPossiblyRelated?.duplicate.possiblyRelatedTask?.id ??
      null,
  };
}

export function formatHealthFindingLabel(
  finding: RentalHealthSourceFinding | null,
  fallback?: string,
): string {
  if (!finding) return fallback?.trim() || 'Health-Signal';
  if (finding.reason?.trim()) return finding.reason.trim();
  return finding.finding_code.replace(/_/g, ' ');
}

export function deriveBlockingReasonCode(
  rentalModule?: RentalHealthModule | null,
): string | undefined {
  return (
    rentalModule?.tire_read_model?.rentalBlockingEvidence?.reasonCode ??
    rentalModule?.brake_read_model?.rentalBlockingEvidence?.reasonCode
  );
}

function buildHealthTaskMetadata(opts: {
  organizationId: string;
  vehicleId: string;
  module: HealthActionModule;
  state: RentalHealthState;
  reason?: string;
  sourceFinding?: RentalHealthSourceFinding | null;
  blockingReasonCode?: string | null;
  origin?: string;
  extra?: Partial<HealthTaskMetadata>;
}): HealthTaskMetadata {
  const metadata: HealthTaskMetadata = {
    sourceType: 'HEALTH',
    organizationId: opts.organizationId,
    vehicleId: opts.vehicleId,
    healthModule: opts.module,
    healthState: opts.state,
    ...(opts.reason ? { healthReason: opts.reason } : {}),
    origin: opts.origin ?? 'HEALTH_UI',
    ...(opts.extra ?? {}),
  };

  if (opts.sourceFinding) {
    metadata.sourceFindingId = opts.sourceFinding.source_finding_id;
    metadata.findingCode = opts.sourceFinding.finding_code;
    metadata.sourceEntityType = opts.sourceFinding.source_entity_type;
    metadata.sourceEntityId = opts.sourceFinding.source_entity_id;
    metadata.findingVersion = opts.sourceFinding.version ?? HEALTH_FINDING_IDENTITY_VERSION;
  }

  const blockingReasonCode = opts.blockingReasonCode?.trim();
  if (blockingReasonCode) {
    metadata.blockingReasonCode = blockingReasonCode;
  }

  return metadata;
}

export function buildHealthTaskPrefill(opts: {
  module: HealthActionModule;
  organizationId: string;
  vehicleId: string;
  rentalModule?: RentalHealthModule | null;
  sourceFinding?: RentalHealthSourceFinding | null;
  contextLines?: string[];
  dtcCodes?: string[];
  dueDate?: string | null;
  vendors?: Vendor[];
  blocksRental?: boolean;
  blockingReasonCode?: string | null;
  origin?: string;
}): HealthTaskPrefill {
  const state = opts.rentalModule?.state ?? 'warning';
  const priority = priorityForHealthState(state);
  const reason = opts.rentalModule?.reason?.trim();
  const sourceFinding = opts.sourceFinding ?? pickPrimarySourceFinding(opts.rentalModule);
  const blockingReasonCode =
    opts.blockingReasonCode ?? deriveBlockingReasonCode(opts.rentalModule) ?? null;

  const context = [reason, ...(opts.contextLines ?? [])].filter(Boolean).join('\n');
  const metadata = buildHealthTaskMetadata({
    organizationId: opts.organizationId,
    vehicleId: opts.vehicleId,
    module: opts.module,
    state,
    reason,
    sourceFinding,
    blockingReasonCode,
    origin: opts.origin,
  });

  const vendorId = opts.vendors?.length
    ? suggestedVendorForHealthModule(opts.vendors, opts.vehicleId, opts.module)
    : undefined;

  switch (opts.module) {
    case 'tires':
      return {
        title: state === 'critical' ? 'Reifen kritisch — prüfen/wechseln' : 'Reifen prüfen',
        description: context || 'Auslöser: Reifen-Gesundheit im Health-Tab.',
        type: MODULE_PREFILL_TASK_TYPES.tires,
        priority,
        category: 'Reifen',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: sourceFinding?.source_finding_id ?? 'HEALTH_TIRES',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata,
      };
    case 'brakes':
      return {
        title: state === 'critical' ? 'Bremsen kritisch — prüfen' : 'Bremsen prüfen',
        description: context || 'Auslöser: Bremsen-Gesundheit im Health-Tab.',
        type: MODULE_PREFILL_TASK_TYPES.brakes,
        priority,
        category: 'Bremsen',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: sourceFinding?.source_finding_id ?? 'HEALTH_BRAKES',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata,
      };
    case 'battery':
      return {
        title: state === 'critical' ? 'Batterie kritisch — prüfen' : 'Batterie prüfen',
        description: context || 'Auslöser: Batterie-Gesundheit im Health-Tab.',
        type: MODULE_PREFILL_TASK_TYPES.battery,
        priority,
        category: 'Batterie',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: sourceFinding?.source_finding_id ?? 'HEALTH_BATTERY',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata,
      };
    case 'error_codes': {
      const codes = opts.dtcCodes?.filter(Boolean) ?? [];
      return {
        title: codes.length ? `DTC-Diagnose (${codes.slice(0, 3).join(', ')})` : 'DTC-Diagnose / Reparatur',
        description: [
          context,
          codes.length ? `Aktive Codes: ${codes.join(', ')}` : '',
        ].filter(Boolean).join('\n'),
        type: MODULE_PREFILL_TASK_TYPES.error_codes,
        priority,
        category: 'Diagnose / Fehlercodes',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: sourceFinding?.source_finding_id ?? 'HEALTH_DTC',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata,
      };
    }
    case 'service_compliance':
      return {
        title: 'TÜV/HU oder Service-Termin planen',
        description: context || 'Auslöser: Service & Compliance im Health-Tab.',
        type: MODULE_PREFILL_TASK_TYPES.service_compliance,
        priority,
        category: 'TÜV/HU',
        dueDate: opts.dueDate ?? undefined,
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: sourceFinding?.source_finding_id ?? 'HEALTH_COMPLIANCE',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata: {
          ...metadata,
          complianceKind: 'service_compliance',
        },
      };
    case 'vehicle_alerts':
      return {
        title: 'OEM-Warnung prüfen',
        description: context || 'Auslöser: Fahrzeug-Warnungen im Health-Tab.',
        type: MODULE_PREFILL_TASK_TYPES.vehicle_alerts,
        priority,
        category: 'Diagnose / Fehlercodes',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: sourceFinding?.source_finding_id ?? 'HEALTH_ALERTS',
        metadata,
      };
    default:
      return {
        title: 'Health-Hinweis bearbeiten',
        description: context || 'Auslöser: Health-Tab.',
        type: MODULE_PREFILL_TASK_TYPES.complaints,
        priority,
        sourceType: 'HEALTH',
        sourceKey: sourceFinding?.source_finding_id ?? 'HEALTH_GENERAL',
        metadata,
      };
  }
}

function taskMetadataRecord(task: ApiTask): Record<string, unknown> | null {
  return task.metadata && typeof task.metadata === 'object' ? task.metadata : null;
}

function taskOrganizationId(task: ApiTask): string | null {
  const meta = taskMetadataRecord(task);
  const fromMeta = meta?.organizationId;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  return task.organizationId?.trim() || null;
}

function taskSourceFindingId(task: ApiTask): string | null {
  const meta = taskMetadataRecord(task);
  const id = meta?.sourceFindingId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function taskHealthModule(task: ApiTask): HealthActionModule | null {
  const meta = taskMetadataRecord(task);
  const moduleKey = meta?.healthModule;
  if (
    moduleKey === 'tires' ||
    moduleKey === 'brakes' ||
    moduleKey === 'battery' ||
    moduleKey === 'error_codes' ||
    moduleKey === 'service_compliance' ||
    moduleKey === 'vehicle_alerts' ||
    moduleKey === 'complaints'
  ) {
    return moduleKey;
  }
  return null;
}

function taskHealthSourceType(task: ApiTask): 'HEALTH' | null {
  if (task.sourceType === 'HEALTH') return 'HEALTH';
  const meta = taskMetadataRecord(task);
  if (meta?.sourceType === 'HEALTH') return 'HEALTH';
  return null;
}

function isOpenRelevantTaskStatus(status: ApiTask['status']): boolean {
  return OPEN_STATUSES.has(status);
}

function isLegacyUnambiguousMatch(
  module: HealthActionModule,
  taskType: ApiTaskType,
): boolean {
  return MODULE_LEGACY_UNAMBIGUOUS_TYPES[module].includes(taskType);
}

/**
 * Weak module association — never uses task type or blocksVehicleAvailability alone.
 * Requires HEALTH origin + matching healthModule metadata.
 */
function isPossiblyRelatedHealthTask(
  query: HealthTaskDuplicateQuery,
  queryFindingId: string | null,
  task: ApiTask,
  taskFindingId: string | null,
  taskModule: HealthActionModule | null,
  taskSource: 'HEALTH' | null,
): boolean {
  if (taskSource !== 'HEALTH' || taskModule !== query.module) return false;

  if (queryFindingId && taskFindingId === queryFindingId) return false;

  if (
    !queryFindingId &&
    !taskFindingId &&
    isLegacyUnambiguousMatch(query.module, task.type)
  ) {
    return false;
  }

  if (queryFindingId && taskFindingId && queryFindingId !== taskFindingId) {
    return true;
  }

  if (queryFindingId && !taskFindingId) {
    return true;
  }

  if (!queryFindingId && !taskFindingId && !isLegacyUnambiguousMatch(query.module, task.type)) {
    return true;
  }

  return false;
}

/**
 * Primary: exact finding identity (org + vehicle + HEALTH + sourceFindingId + open).
 * Secondary legacy: module + unambiguous type when both sides lack sourceFindingId.
 * Possibly related: weak module signal only — never suppresses create/open_task.
 * Never matches on task type alone, blocksVehicleAvailability, or rental_blocked.
 */
export function findDuplicateHealthTask(
  tasks: ApiTask[],
  query: HealthTaskDuplicateQuery,
): HealthTaskDuplicateResult {
  const organizationId = query.organizationId.trim();
  const vehicleId = query.vehicleId.trim();
  const queryFindingId = query.sourceFindingId?.trim() || null;

  if (!organizationId || !vehicleId) {
    return { task: null, matchKind: 'none', possiblyRelatedTask: null };
  }

  let legacyCandidate: ApiTask | null = null;
  let possiblyRelatedCandidate: ApiTask | null = null;

  for (const task of tasks) {
    if (task.vehicleId !== vehicleId) continue;
    if (!isOpenRelevantTaskStatus(task.status)) continue;

    const taskOrg = taskOrganizationId(task);
    if (!taskOrg || taskOrg !== organizationId) continue;

    const taskFindingId = taskSourceFindingId(task);
    const taskModule = taskHealthModule(task);
    const taskSource = taskHealthSourceType(task);

    if (
      queryFindingId &&
      taskFindingId === queryFindingId &&
      taskSource === 'HEALTH'
    ) {
      return { task, matchKind: 'exact', possiblyRelatedTask: null };
    }

    if (
      !queryFindingId &&
      !taskFindingId &&
      taskModule === query.module &&
      taskSource === 'HEALTH' &&
      isLegacyUnambiguousMatch(query.module, task.type)
    ) {
      legacyCandidate = task;
      continue;
    }

    if (
      !possiblyRelatedCandidate &&
      isPossiblyRelatedHealthTask(query, queryFindingId, task, taskFindingId, taskModule, taskSource)
    ) {
      possiblyRelatedCandidate = task;
    }
  }

  if (legacyCandidate) {
    return {
      task: legacyCandidate,
      matchKind: 'legacy',
      possiblyRelatedTask: possiblyRelatedCandidate,
    };
  }

  if (possiblyRelatedCandidate) {
    return {
      task: null,
      matchKind: 'possibly_related',
      possiblyRelatedTask: possiblyRelatedCandidate,
    };
  }

  return { task: null, matchKind: 'none', possiblyRelatedTask: null };
}

export function isHealthOriginatedTask(task: ApiTask): boolean {
  if (task.sourceType === 'HEALTH') return true;
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : null;
  if (meta?.origin === 'HEALTH_UI' || meta?.healthModule) return true;
  if (task.source?.startsWith('INSIGHT_')) return true;
  return false;
}

export function healthContextFromTask(task: ApiTask): {
  moduleLabel: string;
  stateLabel: string;
  reason: string | null;
  explanation: string;
  findingCode: string | null;
  sourceFindingId: string | null;
} | null {
  if (!isHealthOriginatedTask(task)) return null;
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const moduleKey = String(meta.healthModule ?? '');
  const labels: Record<string, string> = {
    tires: 'Reifen',
    brakes: 'Bremsen',
    battery: 'Batterie',
    error_codes: 'Fehlercodes (DTC)',
    service_compliance: 'Service & Compliance',
    vehicle_alerts: 'OEM-Warnungen',
    complaints: 'Beschwerden',
  };
  const state = String(meta.healthState ?? '');
  const stateDe: Record<string, string> = {
    critical: 'Kritisch',
    warning: 'Warnung',
    good: 'Gut',
    unknown: 'Unbekannt',
    n_a: 'Kein Tracking',
  };
  return {
    moduleLabel: labels[moduleKey] || 'Health',
    stateLabel: stateDe[state] || state || '—',
    reason: typeof meta.healthReason === 'string' ? meta.healthReason : null,
    findingCode: typeof meta.findingCode === 'string' ? meta.findingCode : null,
    sourceFindingId: typeof meta.sourceFindingId === 'string' ? meta.sourceFindingId : null,
    explanation: 'Diese Aufgabe wurde aus einem Health-Signal erstellt. Details und Messwerte finden Sie im Health-Tab des Fahrzeugs.',
  };
}

export function complianceSignalsForModule(
  signals: ComplianceTaskSignal[] | null | undefined,
  kinds: string[],
): ComplianceTaskSignal[] {
  if (!signals?.length) return [];
  return signals.filter((s) => kinds.some((k) => s.kind?.toLowerCase().includes(k.toLowerCase())));
}
