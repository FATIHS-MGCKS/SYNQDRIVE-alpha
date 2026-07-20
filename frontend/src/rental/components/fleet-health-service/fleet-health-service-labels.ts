import type { StatusTone } from '../../../components/patterns';
import type { RentalHealthModuleKey } from '../../lib/fleet-health-control-center';
import type { FleetHealthServiceRecommendedAction } from './fleet-health-service.view-model';

/** German UI labels for Fleet → Zustand & Service (canonical terminology P57). */
export const FHS_MODULE_LABELS_DE: Record<string, string> = {
  battery: 'Batterie',
  tires: 'Reifen',
  brakes: 'Bremsen',
  error_codes: 'DTC',
  service_compliance: 'Service',
  complaints: 'Beschwerden',
  vehicle_alerts: 'OEM-Hinweise',
};

export const FHS_HEALTH_BADGE_DE: Record<string, { label: string; tone: StatusTone }> = {
  action: { label: 'Technisch blockiert', tone: 'critical' },
  review: { label: 'Technisch prüfen', tone: 'warning' },
  limited: { label: 'Nicht bewertbar', tone: 'noData' },
  healthy: { label: 'Technisch unauffällig', tone: 'success' },
  blocked: { label: 'Mietblockade', tone: 'critical' },
  in_progress: { label: 'In Bearbeitung', tone: 'info' },
  overdue: { label: 'Überfällig', tone: 'critical' },
  vendor_waiting: { label: 'Wartet Partner', tone: 'warning' },
};

export const FHS_SOURCE_LABEL_DE = {
  task: 'Aufgabe',
  serviceCase: 'Servicefall',
  condition: 'Zustand',
  work: 'Aufgabe',
} as const;

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function formatVehiclePlateLabel(
  vehicle: {
    license?: string;
    make?: string;
    model?: string;
    year?: number;
  } | null | undefined,
): string {
  if (!vehicle) return 'Fahrzeug unbekannt';
  const plate = vehicle.license?.trim();
  if (plate && !looksLikeUuid(plate)) return plate;
  const mmy = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');
  if (mmy) return mmy;
  return 'Fahrzeug ohne Kennzeichen';
}

export function fhsModuleLabelDe(key: RentalHealthModuleKey | null | undefined): string {
  if (!key) return 'Zustand';
  return FHS_MODULE_LABELS_DE[key] ?? key.replace(/_/g, ' ');
}

export function fhsActionLabelDe(action: FleetHealthServiceRecommendedAction): string {
  switch (action) {
    case 'open_task':
      return 'Aufgabe öffnen';
    case 'create_task':
      return 'Aufgabe erstellen';
    case 'review_vehicle':
      return 'Fahrzeug prüfen';
    default:
      return 'Details';
  }
}
