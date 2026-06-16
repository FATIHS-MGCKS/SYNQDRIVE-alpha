import { TaskType } from '@prisma/client';

/**
 * Code-defined checklist templates (V4.8.3). Kept in code rather than a DB
 * table: they are operational defaults, not tenant data, and live closest to
 * the TaskType enum they key off. A task created for a given type seeds these
 * items; operators can then add/remove items per task.
 */
export const TASK_CHECKLIST_TEMPLATES: Partial<Record<TaskType, string[]>> = {
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
  TIRE_CHECK: [
    'Reifendruck prüfen',
    'Profiltiefe prüfen',
    'Sichtprüfung Beschädigungen',
    'Ergebnis dokumentieren',
  ],
  BRAKE_CHECK: [
    'Bremsverhalten prüfen',
    'Belag-/Scheibenzustand prüfen',
    'Geräusche/Vibrationen prüfen',
    'Ergebnis dokumentieren',
  ],
  BATTERY_CHECK: ['Spannung/SOH prüfen', 'Startverhalten prüfen', 'Messwert dokumentieren'],
  VEHICLE_CLEANING: [
    'Innenraum reinigen',
    'Außenreinigung prüfen',
    'Müll entfernen',
    'Fotos (optional)',
  ],
  VEHICLE_SERVICE: [
    'Servicehistorie prüfen',
    'Fälligkeit / Kilometerstand prüfen',
    'Werkstatttermin planen',
    'Ergebnis dokumentieren',
  ],
  VEHICLE_INSPECTION: [
    'Fahrzeug visuell prüfen',
    'Relevante Fehlercodes prüfen',
    'Sicherheitsrelevante Mängel dokumentieren',
    'Maßnahmen festlegen',
  ],
};

export function checklistForType(type: TaskType): Array<{ title: string; sortOrder: number }> {
  const titles = TASK_CHECKLIST_TEMPLATES[type];
  if (!titles) return [];
  return titles.map((title, i) => ({ title, sortOrder: i }));
}
