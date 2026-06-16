import { NotificationCategory } from '@prisma/client';

export interface NotificationCategoryMeta {
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  sms: boolean;
  criticalOnly: boolean;
}

export const NOTIFICATION_CATEGORY_ORDER: NotificationCategory[] = [
  NotificationCategory.BOOKINGS,
  NotificationCategory.PICKUPS_RETURNS,
  NotificationCategory.TASKS,
  NotificationCategory.INVOICES_PAYMENTS,
  NotificationCategory.VEHICLE_HEALTH,
  NotificationCategory.DAMAGE_MISUSE,
  NotificationCategory.DOCUMENTS,
  NotificationCategory.WEEKLY_REPORTS,
  NotificationCategory.SECURITY,
];

export const NOTIFICATION_CATEGORY_META: Record<
  NotificationCategory,
  NotificationCategoryMeta
> = {
  [NotificationCategory.BOOKINGS]: {
    label: 'Buchungen',
    description: 'Neue, geänderte oder stornierte Buchungen',
    inApp: true,
    email: true,
    push: false,
    sms: false,
    criticalOnly: false,
  },
  [NotificationCategory.PICKUPS_RETURNS]: {
    label: 'Abholungen & Rückgaben',
    description: 'Heutige Pickups, Returns und Verspätungen',
    inApp: true,
    email: true,
    push: true,
    sms: false,
    criticalOnly: false,
  },
  [NotificationCategory.TASKS]: {
    label: 'Aufgaben',
    description: 'Zugewiesene Tasks und Fälligkeiten',
    inApp: true,
    email: true,
    push: false,
    sms: false,
    criticalOnly: false,
  },
  [NotificationCategory.INVOICES_PAYMENTS]: {
    label: 'Rechnungen & Zahlungen',
    description: 'Offene Rechnungen und Zahlungsstatus',
    inApp: true,
    email: true,
    push: false,
    sms: false,
    criticalOnly: false,
  },
  [NotificationCategory.VEHICLE_HEALTH]: {
    label: 'Fahrzeug-Gesundheit',
    description: 'Kritische Health-Warnungen und Wartung',
    inApp: true,
    email: true,
    push: true,
    sms: false,
    criticalOnly: true,
  },
  [NotificationCategory.DAMAGE_MISUSE]: {
    label: 'Schäden & Missbrauch',
    description: 'Schadensmeldungen und Prüffälle',
    inApp: true,
    email: true,
    push: true,
    sms: false,
    criticalOnly: false,
  },
  [NotificationCategory.DOCUMENTS]: {
    label: 'Dokumente',
    description: 'Dokument-Uploads und fehlende Unterlagen',
    inApp: true,
    email: false,
    push: false,
    sms: false,
    criticalOnly: false,
  },
  [NotificationCategory.WEEKLY_REPORTS]: {
    label: 'Wochenberichte',
    description: 'Zusammenfassung der Wochenaktivität',
    inApp: false,
    email: true,
    push: false,
    sms: false,
    criticalOnly: false,
  },
  [NotificationCategory.SECURITY]: {
    label: 'Sicherheit',
    description: 'Anmeldungen, Passwortänderungen und Sitzungen',
    inApp: true,
    email: true,
    push: false,
    sms: false,
    criticalOnly: false,
  },
};
