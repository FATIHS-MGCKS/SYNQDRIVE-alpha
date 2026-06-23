import type {
  ApiTask,
  ApiTaskPriority,
  ApiTaskType,
  ComplianceTaskSignal,
  RentalHealthModule,
  RentalHealthState,
  Vendor,
} from '../../lib/api';
import { preferredVendorsForVehicle } from './service-task-semantics';

export type HealthActionModule =
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'error_codes'
  | 'service_compliance'
  | 'vehicle_alerts'
  | 'complaints';

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
  metadata: Record<string, unknown>;
}

const OPEN_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING']);

const MODULE_TASK_TYPES: Record<HealthActionModule, ApiTaskType[]> = {
  tires: ['TIRE_CHECK', 'REPAIR'],
  brakes: ['BRAKE_CHECK', 'REPAIR'],
  battery: ['BATTERY_CHECK', 'REPAIR'],
  error_codes: ['REPAIR', 'CUSTOM'],
  service_compliance: ['VEHICLE_INSPECTION', 'VEHICLE_SERVICE'],
  vehicle_alerts: ['REPAIR', 'VEHICLE_SERVICE'],
  complaints: ['CUSTOM', 'VEHICLE_SERVICE'],
};

const MODULE_SERVICE_KEYWORDS: Record<HealthActionModule, string[]> = {
  tires: ['tire', 'reifen'],
  brakes: ['brake', 'bremse'],
  battery: ['battery', 'ev'],
  error_codes: ['electrical', 'workshop', 'general'],
  service_compliance: ['tüv', 'inspection', 'service', 'hu'],
  vehicle_alerts: ['workshop', 'general'],
  complaints: [],
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

export function buildHealthTaskPrefill(opts: {
  module: HealthActionModule;
  vehicleId: string;
  rentalModule?: RentalHealthModule | null;
  contextLines?: string[];
  dtcCodes?: string[];
  dueDate?: string | null;
  vendors?: Vendor[];
  blocksRental?: boolean;
}): HealthTaskPrefill {
  const state = opts.rentalModule?.state ?? 'warning';
  const priority = priorityForHealthState(state);
  const reason = opts.rentalModule?.reason?.trim();
  const context = [
    reason,
    ...(opts.contextLines ?? []),
  ].filter(Boolean).join('\n');

  const baseMeta = {
    healthModule: opts.module,
    healthState: state,
    healthReason: reason ?? undefined,
    origin: 'HEALTH_UI',
    vehicleId: opts.vehicleId,
  };

  const vendorId = opts.vendors?.length
    ? suggestedVendorForHealthModule(opts.vendors, opts.vehicleId, opts.module)
    : undefined;

  switch (opts.module) {
    case 'tires':
      return {
        title: state === 'critical' ? 'Reifen kritisch — prüfen/wechseln' : 'Reifen prüfen',
        description: context || 'Auslöser: Reifen-Gesundheit im Health-Tab.',
        type: 'TIRE_CHECK',
        priority,
        category: 'Reifen',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: 'HEALTH_TIRES',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata: baseMeta,
      };
    case 'brakes':
      return {
        title: state === 'critical' ? 'Bremsen kritisch — prüfen' : 'Bremsen prüfen',
        description: context || 'Auslöser: Bremsen-Gesundheit im Health-Tab.',
        type: 'BRAKE_CHECK',
        priority,
        category: 'Bremsen',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: 'HEALTH_BRAKES',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata: baseMeta,
      };
    case 'battery':
      return {
        title: state === 'critical' ? 'Batterie kritisch — prüfen' : 'Batterie prüfen',
        description: context || 'Auslöser: Batterie-Gesundheit im Health-Tab.',
        type: 'BATTERY_CHECK',
        priority,
        category: 'Batterie',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: 'HEALTH_BATTERY',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata: baseMeta,
      };
    case 'error_codes': {
      const codes = opts.dtcCodes?.filter(Boolean) ?? [];
      return {
        title: codes.length ? `DTC-Diagnose (${codes.slice(0, 3).join(', ')})` : 'DTC-Diagnose / Reparatur',
        description: [
          context,
          codes.length ? `Aktive Codes: ${codes.join(', ')}` : '',
        ].filter(Boolean).join('\n'),
        type: 'REPAIR',
        priority,
        category: 'Diagnose / Fehlercodes',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: 'HEALTH_DTC',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata: { ...baseMeta, dtcCodes: codes },
      };
    }
    case 'service_compliance':
      return {
        title: 'TÜV/HU oder Service-Termin planen',
        description: context || 'Auslöser: Service & Compliance im Health-Tab.',
        type: 'VEHICLE_INSPECTION',
        priority,
        category: 'TÜV/HU',
        dueDate: opts.dueDate ?? undefined,
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: 'HEALTH_COMPLIANCE',
        blocksVehicleAvailability: opts.blocksRental ?? state === 'critical',
        metadata: { ...baseMeta, complianceKind: 'service_compliance' },
      };
    case 'vehicle_alerts':
      return {
        title: 'OEM-Warnung prüfen',
        description: context || 'Auslöser: Fahrzeug-Warnungen im Health-Tab.',
        type: 'REPAIR',
        priority,
        category: 'Diagnose / Fehlercodes',
        vendorId,
        sourceType: 'HEALTH',
        sourceKey: 'HEALTH_ALERTS',
        metadata: baseMeta,
      };
    default:
      return {
        title: 'Health-Hinweis bearbeiten',
        description: context || 'Auslöser: Health-Tab.',
        type: 'VEHICLE_SERVICE',
        priority,
        sourceType: 'HEALTH',
        sourceKey: 'HEALTH_GENERAL',
        metadata: baseMeta,
      };
  }
}

export function findDuplicateHealthTask(
  tasks: ApiTask[],
  vehicleId: string,
  module: HealthActionModule,
  preferredType: ApiTaskType,
): ApiTask | null {
  const types = MODULE_TASK_TYPES[module];
  for (const task of tasks) {
    if (task.vehicleId !== vehicleId) continue;
    if (!OPEN_STATUSES.has(task.status)) continue;
    const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : null;
    if (meta?.healthModule === module) return task;
    if (types.includes(task.type) || task.type === preferredType) return task;
    if (task.sourceType === 'HEALTH' && types.includes(task.type)) return task;
    if (task.source?.startsWith('INSIGHT_') && types.includes(task.type)) return task;
  }
  return null;
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
