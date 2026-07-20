import type {
  ApiServiceCase,
  ApiServiceCaseCategory,
  ApiServiceCaseStatus,
  Vendor,
} from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { buildMMY } from '../../lib/vehicleMmy';
import { formatCostCents, TASK_PRIORITY_LABEL_DE } from '../../lib/service-task-semantics';
import { isActiveServiceCase } from './fleet-health-service-case.view-model';
import { resolveServiceCaseOpenTaskCount } from './service-case-task-actions';

export type FleetHealthServiceCaseFilter =
  | 'open'
  | 'scheduled'
  | 'in-progress'
  | 'waiting-vendor'
  | 'waiting-parts'
  | 'blocks-vehicle'
  | 'completed';

export const FLEET_HEALTH_SERVICE_CASE_FILTER_ORDER: FleetHealthServiceCaseFilter[] = [
  'open',
  'scheduled',
  'in-progress',
  'waiting-vendor',
  'waiting-parts',
  'blocks-vehicle',
  'completed',
];

export const FLEET_HEALTH_SERVICE_CASE_FILTER_LABELS: Record<FleetHealthServiceCaseFilter, string> =
  {
    open: 'Offen',
    scheduled: 'Geplant',
    'in-progress': 'In Bearbeitung',
    'waiting-vendor': 'Wartet Partner',
    'waiting-parts': 'Wartet Teile',
    'blocks-vehicle': 'Blockiert Fahrzeug',
    completed: 'Abgeschlossen',
  };

export const SERVICE_CASE_CATEGORY_LABEL_DE: Record<ApiServiceCaseCategory, string> = {
  SERVICE: 'Service',
  REPAIR: 'Reparatur',
  INSPECTION: 'Inspektion',
  TUV_HU: 'TÜV/HU',
  TIRES: 'Reifen',
  BRAKES: 'Bremsen',
  BATTERY: 'Batterie',
  DAMAGE: 'Schaden',
  DIAGNOSTIC: 'Diagnose',
};

export const SERVICE_CASE_STATUS_LABEL_DE: Record<ApiServiceCaseStatus, string> = {
  OPEN: 'Offen',
  SCHEDULED: 'Geplant',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING_VENDOR: 'Wartet Partner',
  WAITING_PARTS: 'Wartet Teile',
  COMPLETED: 'Abgeschlossen',
  CANCELLED: 'Storniert',
};

export interface FleetHealthServiceCaseListRow {
  serviceCase: ApiServiceCase;
  licensePlate: string;
  vehicleName: string;
  titleLine: string;
  categoryLabel: string;
  statusLabel: string;
  priorityLabel: string;
  vendorName: string | null;
  scheduledAtLabel: string | null;
  expectedReadyAtLabel: string | null;
  openTasksCount: number;
  costStatusLabel: string;
  costStatusDetail: string | null;
  blocksRental: boolean;
  updatedAtLabel: string;
}

export function formatServiceCaseDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function resolveServiceCaseVehicleDisplay(
  vehicle: VehicleData | null | undefined,
): { licensePlate: string; vehicleName: string } {
  if (!vehicle) {
    return { licensePlate: '—', vehicleName: 'Fahrzeug unbekannt' };
  }
  const licensePlate = vehicle.license?.trim() || '—';
  const vehicleName = buildMMY(vehicle);
  return { licensePlate, vehicleName };
}

export function countOpenServiceCaseTasks(serviceCase: ApiServiceCase): number {
  return resolveServiceCaseOpenTaskCount(serviceCase);
}

export function deriveServiceCaseCostStatus(
  serviceCase: Pick<ApiServiceCase, 'estimatedCostCents' | 'actualCostCents'>,
): { label: string; detail: string | null } {
  const actual = formatCostCents(serviceCase.actualCostCents);
  const estimated = formatCostCents(serviceCase.estimatedCostCents);
  if (actual) {
    return {
      label: 'Ist erfasst',
      detail: estimated ? `${actual} (geschätzt ${estimated})` : actual,
    };
  }
  if (estimated) {
    return { label: 'Geschätzt', detail: estimated };
  }
  return { label: 'Offen', detail: null };
}

export function filterServiceCasesByWorkFilter(
  serviceCases: ApiServiceCase[],
  filter: FleetHealthServiceCaseFilter,
): ApiServiceCase[] {
  switch (filter) {
    case 'open':
      return serviceCases.filter((serviceCase) => serviceCase.status === 'OPEN');
    case 'scheduled':
      return serviceCases.filter((serviceCase) => serviceCase.status === 'SCHEDULED');
    case 'in-progress':
      return serviceCases.filter((serviceCase) => serviceCase.status === 'IN_PROGRESS');
    case 'waiting-vendor':
      return serviceCases.filter((serviceCase) => serviceCase.status === 'WAITING_VENDOR');
    case 'waiting-parts':
      return serviceCases.filter((serviceCase) => serviceCase.status === 'WAITING_PARTS');
    case 'blocks-vehicle':
      return serviceCases.filter(
        (serviceCase) => serviceCase.blocksRental && isActiveServiceCase(serviceCase),
      );
    case 'completed':
      return serviceCases.filter((serviceCase) => serviceCase.status === 'COMPLETED');
    default:
      return serviceCases;
  }
}

export function buildFleetHealthServiceCaseListRows(input: {
  serviceCases: ApiServiceCase[];
  vehicleById: Map<string, VehicleData>;
  vendorById: Map<string, Vendor>;
  filter: FleetHealthServiceCaseFilter;
}): FleetHealthServiceCaseListRow[] {
  const filtered = filterServiceCasesByWorkFilter(input.serviceCases, input.filter);

  return filtered
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((serviceCase) => {
      const vehicle = input.vehicleById.get(serviceCase.vehicleId);
      const { licensePlate, vehicleName } = resolveServiceCaseVehicleDisplay(vehicle);
      const vendorName = serviceCase.vendorId
        ? (input.vendorById.get(serviceCase.vendorId)?.name ?? 'Partner unbekannt')
        : null;
      const costStatus = deriveServiceCaseCostStatus(serviceCase);

      return {
        serviceCase,
        licensePlate,
        vehicleName,
        titleLine: serviceCase.title,
        categoryLabel: SERVICE_CASE_CATEGORY_LABEL_DE[serviceCase.category],
        statusLabel: SERVICE_CASE_STATUS_LABEL_DE[serviceCase.status],
        priorityLabel: TASK_PRIORITY_LABEL_DE[serviceCase.priority],
        vendorName,
        scheduledAtLabel: formatServiceCaseDateTime(serviceCase.scheduledAt),
        expectedReadyAtLabel: formatServiceCaseDateTime(serviceCase.expectedReadyAt),
        openTasksCount: countOpenServiceCaseTasks(serviceCase),
        costStatusLabel: costStatus.label,
        costStatusDetail: costStatus.detail,
        blocksRental: serviceCase.blocksRental,
        updatedAtLabel:
          formatServiceCaseDateTime(serviceCase.updatedAt) ??
          formatServiceCaseDateTime(serviceCase.createdAt) ??
          '—',
      };
    });
}

export function countServiceCasesForFilter(
  serviceCases: ApiServiceCase[],
  filter: FleetHealthServiceCaseFilter,
): number {
  return filterServiceCasesByWorkFilter(serviceCases, filter).length;
}
