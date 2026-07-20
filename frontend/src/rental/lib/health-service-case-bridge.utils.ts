import type {
  ApiServiceCase,
  ApiServiceCaseCategory,
  ApiTaskPriority,
  RentalHealthModule,
  RentalHealthState,
  Vendor,
} from '../../lib/api';
import { isActiveServiceCase } from '../components/fleet-health-service/fleet-health-service-case.view-model';
import {
  type HealthActionModule,
  priorityForHealthState,
  suggestedVendorForHealthModule,
} from './health-task-bridge.utils';

export interface HealthServiceCasePrefill {
  title: string;
  description: string;
  category: ApiServiceCaseCategory;
  priority: ApiTaskPriority;
  source: 'HEALTH';
  vendorId?: string;
  blocksRental?: boolean;
  metadata: Record<string, unknown>;
}

export const HEALTH_SERVICE_CASE_WORKFLOW_HINT_DE =
  'Ein Servicefall bündelt mehrstufige Werkstattprozesse — Diagnose, Termin, Teile, Partner, Freigabe und Kosten. Für einfache Einzelarbeiten reicht eine Service-Aufgabe.';

const MODULE_CATEGORY: Record<HealthActionModule, ApiServiceCaseCategory> = {
  tires: 'TIRES',
  brakes: 'BRAKES',
  battery: 'BATTERY',
  error_codes: 'DIAGNOSTIC',
  service_compliance: 'TUV_HU',
  vehicle_alerts: 'DIAGNOSTIC',
  complaints: 'REPAIR',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function defaultHealthFindingCode(
  healthModule: HealthActionModule,
  explicitCode?: string | null,
): string {
  const trimmed = explicitCode?.trim();
  if (trimmed) return trimmed;
  return `rental-${healthModule}`;
}

export function buildHealthSourceFindingId(input: {
  vehicleId: string;
  healthModule: HealthActionModule;
  findingCode?: string | null;
}): string {
  const code = defaultHealthFindingCode(input.healthModule, input.findingCode).toLowerCase();
  return `hf:${input.vehicleId}:${input.healthModule}:${code}`;
}

export function buildHealthServiceCasePrefill(opts: {
  module: HealthActionModule;
  vehicleId: string;
  rentalModule?: RentalHealthModule | null;
  findingCode?: string | null;
  findingTitle?: string | null;
  contextLines?: string[];
  dtcCodes?: string[];
  vendors?: Vendor[];
  blocksRental?: boolean;
  blockingReasons?: string[];
}): HealthServiceCasePrefill {
  const state = opts.rentalModule?.state ?? 'warning';
  const priority = priorityForHealthState(state);
  const reason = opts.rentalModule?.reason?.trim();
  const findingCode = defaultHealthFindingCode(opts.module, opts.findingCode);
  const sourceFindingId = buildHealthSourceFindingId({
    vehicleId: opts.vehicleId,
    healthModule: opts.module,
    findingCode,
  });

  const blockadeLines =
    opts.blocksRental || opts.blockingReasons?.length
      ? [
          opts.blocksRental ? 'Technische Mietblockade aktiv.' : null,
          ...(opts.blockingReasons ?? []),
        ].filter(Boolean)
      : [];

  const context = [
    reason,
    opts.findingTitle?.trim(),
    ...(opts.contextLines ?? []),
    ...blockadeLines,
  ]
    .filter(Boolean)
    .join('\n');

  const vendorId = opts.vendors?.length
    ? suggestedVendorForHealthModule(opts.vendors, opts.vehicleId, opts.module)
    : undefined;

  const category = MODULE_CATEGORY[opts.module];
  const blocksRental = opts.blocksRental ?? state === 'critical';

  const baseMeta = {
    healthModule: opts.module,
    healthState: state,
    healthReason: reason ?? undefined,
    findingCode,
    sourceFindingId,
    origin: 'HEALTH_UI',
    vehicleId: opts.vehicleId,
    rentalBlocked: opts.blocksRental ?? false,
    blockingContext: blockadeLines.length ? blockadeLines.join(' · ') : undefined,
  };

  switch (opts.module) {
    case 'tires':
      return {
        title:
          opts.findingTitle?.trim() ||
          (state === 'critical' ? 'Reifen-Werkstattfall — kritisch' : 'Reifen-Werkstattfall'),
        description:
          context ||
          'Auslöser: Reifen-Gesundheit. Servicefall für Werkstattkoordination (Prüfung, Termin, Wechsel).',
        category,
        priority,
        vendorId,
        source: 'HEALTH',
        blocksRental,
        metadata: baseMeta,
      };
    case 'brakes':
      return {
        title:
          opts.findingTitle?.trim() ||
          (state === 'critical' ? 'Bremsen-Werkstattfall — kritisch' : 'Bremsen-Werkstattfall'),
        description:
          context ||
          'Auslöser: Bremsen-Gesundheit. Servicefall für Diagnose, Termin und Instandsetzung.',
        category,
        priority,
        vendorId,
        source: 'HEALTH',
        blocksRental,
        metadata: baseMeta,
      };
    case 'battery':
      return {
        title:
          opts.findingTitle?.trim() ||
          (state === 'critical' ? 'Batterie-Werkstattfall — kritisch' : 'Batterie-Werkstattfall'),
        description:
          context ||
          'Auslöser: Batterie-Gesundheit. Servicefall für Prüfung und ggf. Reparatur/Austausch.',
        category,
        priority,
        vendorId,
        source: 'HEALTH',
        blocksRental,
        metadata: baseMeta,
      };
    case 'error_codes': {
      const codes = opts.dtcCodes?.filter(Boolean) ?? [];
      return {
        title:
          opts.findingTitle?.trim() ||
          (codes.length ? `DTC-Werkstattfall (${codes.slice(0, 3).join(', ')})` : 'DTC-Werkstattfall'),
        description: [
          context,
          codes.length ? `Aktive Codes: ${codes.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n') || 'Auslöser: Fehlercodes. Servicefall für Diagnose und Reparatur.',
        category,
        priority,
        vendorId,
        source: 'HEALTH',
        blocksRental,
        metadata: { ...baseMeta, dtcCodes: codes },
      };
    }
    case 'service_compliance':
      return {
        title: opts.findingTitle?.trim() || 'TÜV/HU-Servicefall',
        description:
          context ||
          'Auslöser: Service & Compliance. Servicefall für Terminplanung und Freigabe.',
        category,
        priority,
        vendorId,
        source: 'HEALTH',
        blocksRental,
        metadata: { ...baseMeta, complianceKind: 'service_compliance' },
      };
    case 'vehicle_alerts':
      return {
        title: opts.findingTitle?.trim() || 'OEM-Warnung — Werkstattfall',
        description:
          context ||
          'Auslöser: OEM-Warnung. Servicefall für Diagnose und Werkstattabstimmung.',
        category,
        priority,
        vendorId,
        source: 'HEALTH',
        blocksRental,
        metadata: baseMeta,
      };
    default:
      return {
        title: opts.findingTitle?.trim() || 'Health-Werkstattfall',
        description: context || 'Auslöser: Health-Hinweis. Servicefall für Werkstattkoordination.',
        category: 'REPAIR',
        priority,
        vendorId,
        source: 'HEALTH',
        blocksRental,
        metadata: baseMeta,
      };
  }
}

export function findDuplicateHealthServiceCase(
  cases: ApiServiceCase[],
  vehicleId: string,
  healthModule: HealthActionModule,
  sourceFindingId: string,
  findingCode?: string | null,
): ApiServiceCase | null {
  const code = defaultHealthFindingCode(healthModule, findingCode);
  for (const serviceCase of cases) {
    if (serviceCase.vehicleId !== vehicleId) continue;
    if (!isActiveServiceCase(serviceCase)) continue;
    const meta = asRecord(serviceCase.metadata);
    if (!meta) continue;

    const metaFindingId =
      typeof meta.sourceFindingId === 'string' ? meta.sourceFindingId : null;
    if (metaFindingId && metaFindingId === sourceFindingId) return serviceCase;

    const metaModule =
      typeof meta.healthModule === 'string' ? meta.healthModule : null;
    const metaCode = typeof meta.findingCode === 'string' ? meta.findingCode : null;
    if (metaModule === healthModule && metaCode && metaCode === code) return serviceCase;

    if (
      serviceCase.source === 'HEALTH' &&
      metaModule === healthModule &&
      metaFindingId === sourceFindingId
    ) {
      return serviceCase;
    }
  }
  return null;
}

export function healthModuleLabelDe(module: HealthActionModule | string): string {
  const labels: Record<string, string> = {
    tires: 'Reifen',
    brakes: 'Bremsen',
    battery: 'Batterie',
    error_codes: 'Fehlercodes',
    service_compliance: 'Service / TÜV',
    vehicle_alerts: 'OEM-Warnungen',
    complaints: 'Beschwerden',
  };
  return labels[module] ?? String(module);
}

export function healthStateLabelDe(state: RentalHealthState | string | undefined): string {
  const labels: Record<string, string> = {
    critical: 'Kritisch',
    warning: 'Warnung',
    good: 'Gut',
    unknown: 'Unbekannt',
    n_a: 'Kein Tracking',
  };
  return labels[state ?? ''] ?? state ?? '—';
}
