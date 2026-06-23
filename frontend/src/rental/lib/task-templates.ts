import type { ApiTaskType } from '../../lib/api';

/** Mirrors backend `task-templates.ts` — checklist preview for manual task creation. */
export const TASK_CHECKLIST_PREVIEW: Partial<Record<ApiTaskType, string[]>> = {
  BOOKING_PREPARATION: [
    'Fahrzeug reinigen',
    'Ladestand/Tankstand prüfen',
    'Kilometerstand prüfen',
    'Dokumente vorbereiten',
    'Zubehör prüfen',
  ],
  BOOKING_PICKUP: [
    'Kunde identifizieren',
    'Mietvertrag unterschreiben',
    'Kaution erfassen',
    'Fahrzeugzustand dokumentieren',
    'Fotos aufnehmen',
    'Schlüssel übergeben',
  ],
  BOOKING_RETURN: [
    'Kilometerstand erfassen',
    'Tankstand/Ladestand erfassen',
    'Außenkontrolle durchführen',
    'Innenkontrolle durchführen',
    'Schäden dokumentieren',
    'Rückgabeprotokoll abschließen',
    'Schlussrechnung prüfen',
  ],
  TIRE_CHECK: ['Reifendruck prüfen', 'Profiltiefe prüfen', 'Sichtprüfung Beschädigungen', 'Ergebnis dokumentieren'],
  BRAKE_CHECK: [
    'Sichtprüfung',
    'Probefahrt',
    'Messwerte eintragen',
    'Ergebnis dokumentieren',
    'Rechnung/Dokument hochladen',
  ],
  BATTERY_CHECK: ['Spannung/SOH prüfen', 'Startverhalten prüfen', 'Messwert dokumentieren'],
  VEHICLE_CLEANING: ['Innenraum reinigen', 'Außenreinigung prüfen', 'Müll entfernen', 'Fotos (optional)'],
  VEHICLE_SERVICE: ['Servicehistorie prüfen', 'Fälligkeit / Kilometerstand prüfen', 'Werkstatttermin planen', 'Ergebnis dokumentieren'],
  VEHICLE_INSPECTION: [
    'Termin buchen',
    'Fahrzeug vorbereiten',
    'Prüfung durchführen',
    'Ergebnis dokumentieren',
    'Dokument hochladen',
  ],
};

export function checklistPreviewForType(type: ApiTaskType): string[] {
  return TASK_CHECKLIST_PREVIEW[type] ?? [];
}

export const MANUAL_TASK_TYPES: ApiTaskType[] = [
  'CUSTOM',
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_CLEANING',
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
  'DOCUMENT_REVIEW',
  'INVOICE_REQUIRED',
  'REPAIR',
  'CUSTOMER_FOLLOWUP',
];
