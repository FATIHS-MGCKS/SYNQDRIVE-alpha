import { Injectable } from '@nestjs/common';
import { InsightCandidate, InsightType } from './insight.types';

const TITLE_TEMPLATES: Record<InsightType, string> = {
  [InsightType.TIGHT_HANDOVER]: 'Tight Handover',
  [InsightType.RETURN_NEEDS_INSPECTION]: 'Return Needs Attention',
  [InsightType.STATION_SHORTAGE]: 'Station Shortage',
  [InsightType.LOW_UTILIZATION]: 'Low Utilization',
  [InsightType.SERVICE_WINDOW]: 'Service Window Available',
  [InsightType.SERVICE_BEFORE_BOOKING]: 'Check Before Rental',
  // BATTERY_CRITICAL keeps whatever title the detector produced (vehicle-specific)
  // rather than a generic label — empty string here means "use candidate title".
  [InsightType.BATTERY_CRITICAL]: '',
  // TIRE_CRITICAL keeps the detector's graduated titles ("Reifen kritisch" vs
  // "Reifen beobachten") so the escalation stays visible on the dashboard.
  [InsightType.TIRE_CRITICAL]: '',
  // BRAKE_CRITICAL keeps the detector's graduated titles ("Bremsen kritisch" vs
  // "Bremsen beobachten") so the escalation stays visible on the dashboard.
  [InsightType.BRAKE_CRITICAL]: '',
  // SERVICE_OVERDUE likewise uses the detector's title so "Service überfällig"
  // and "Service fällig" can coexist as distinct labels for the same type.
  [InsightType.SERVICE_OVERDUE]: '',
  // PICKUP_OVERDUE — the detector emits graduated titles ("Kunde verspätet",
  // "Pickup überfällig", "Pickup >24 h überfällig") that must not be
  // collapsed into a single generic label.
  [InsightType.PICKUP_OVERDUE]: '',
  // TÜV / BOKraft — keep the detector's graduated titles ("… bald fällig" vs
  // "… überfällig") so the escalation stays visible on the dashboard.
  [InsightType.TUV_OVERDUE]: '',
  [InsightType.BOKRAFT_OVERDUE]: '',
};

const ACTION_LABELS: Record<InsightType, string> = {
  [InsightType.TIGHT_HANDOVER]: 'View bookings',
  [InsightType.RETURN_NEEDS_INSPECTION]: 'Review return',
  [InsightType.STATION_SHORTAGE]: 'View station',
  [InsightType.LOW_UTILIZATION]: 'Review vehicle',
  [InsightType.SERVICE_WINDOW]: 'Schedule service',
  [InsightType.SERVICE_BEFORE_BOOKING]: 'Review vehicle',
  [InsightType.BATTERY_CRITICAL]: 'Fahrzeug prüfen',
  [InsightType.TIRE_CRITICAL]: 'Fahrzeug prüfen',
  [InsightType.BRAKE_CRITICAL]: 'Fahrzeug prüfen',
  [InsightType.SERVICE_OVERDUE]: 'Fahrzeug prüfen',
  [InsightType.PICKUP_OVERDUE]: 'Buchung öffnen',
  [InsightType.TUV_OVERDUE]: 'Fahrzeug prüfen',
  [InsightType.BOKRAFT_OVERDUE]: 'Fahrzeug prüfen',
};

const MAX_TITLE = 40;
const MAX_MESSAGE = 160;
const MAX_ACTION = 24;

@Injectable()
export class InsightFormatterService {
  format(candidates: InsightCandidate[], _useLlm = false): InsightCandidate[] {
    return candidates.map((c) => {
      const template = TITLE_TEMPLATES[c.type];
      const title = template && template.length > 0 ? template : c.title;
      return {
        ...c,
        title: this.truncate(title, MAX_TITLE),
        message: this.truncate(c.message, MAX_MESSAGE),
        actionLabel: this.truncate(c.actionLabel ?? ACTION_LABELS[c.type] ?? 'View', MAX_ACTION),
      };
    });
  }

  private truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }
}
