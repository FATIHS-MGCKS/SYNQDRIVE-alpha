import type { StatusTone } from '../../../components/patterns';
import type { RentalHealthModuleKey } from '../../lib/fleet-health-control-center';
import type { FleetHealthServiceRecommendedAction } from './fleet-health-service.view-model';

/** German UI labels for Fleet → Zustand & Service (no English mix in DE surfaces). */
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
  action: { label: 'Handlungsbedarf', tone: 'critical' },
  review: { label: 'Prüfen', tone: 'warning' },
  limited: { label: 'Daten begrenzt', tone: 'noData' },
  healthy: { label: 'Gesund', tone: 'success' },
  blocked: { label: 'Vermietung blockiert', tone: 'critical' },
  in_progress: { label: 'In Bearbeitung', tone: 'info' },
  overdue: { label: 'Überfällig', tone: 'critical' },
  vendor_waiting: { label: 'Wartet Partner', tone: 'warning' },
};

export function fhsModuleLabelDe(key: RentalHealthModuleKey | null | undefined): string {
  if (!key) return 'Daten';
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
