import { TaskType } from '@prisma/client';

/**
 * Code-defined checklist templates (Task Domain V2).
 *
 * Kept in code rather than a DB table: operational defaults keyed by TaskType.
 * A task created for a given type seeds these items; operators can add/remove
 * items per task. Existing persisted tasks are never retroactively changed.
 */

/** Single checklist seed item — maps 1:1 to TaskChecklistItem on create. */
export interface TaskChecklistTemplateItem {
  title: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
}

/** Non-UI metadata for completion policy hints and operator guidance. */
export interface TaskTypeChecklistTemplateMetadata {
  /** When true, manual completion should include a resolution note (see RESOLUTION_REQUIRED_TYPES). */
  requiresResolutionNote?: boolean;
  /** Expected or recommended resolution codes for this task type (free-form strings). */
  resolutionCodes?: string[];
  /** Human-readable hint for the next operational step — not React/UI state. */
  defaultNextAction?: string;
}

export interface TaskTypeChecklistTemplate {
  metadata: TaskTypeChecklistTemplateMetadata;
  items: TaskChecklistTemplateItem[];
}

const RESOLUTION_CLOSURE_HINT =
  'Der fachliche Abschluss erfolgt über Abschluss-Code und Abschlussnotiz beim Task abschließen — dieser Punkt dient nur der Orientierung.';

function templateItem(
  title: string,
  sortOrder: number,
  opts?: { description?: string; isRequired?: boolean },
): TaskChecklistTemplateItem {
  return {
    title,
    sortOrder,
    description: opts?.description,
    isRequired: opts?.isRequired ?? true,
  };
}

/** Orientation-only step — not a completion blocker; real evidence via resolution fields. */
function resolutionOrientationItem(title: string, sortOrder: number): TaskChecklistTemplateItem {
  return templateItem(title, sortOrder, {
    isRequired: false,
    description: RESOLUTION_CLOSURE_HINT,
  });
}

/**
 * A — Verbindliche operative Checkliste (operative steps; most items required).
 * B — Optionale Orientierung (all items optional).
 * C — Keine automatische generische Checkliste (absent from map → empty).
 */
export const TASK_TYPE_CHECKLIST_TEMPLATES: Partial<Record<TaskType, TaskTypeChecklistTemplate>> = {
  // ─── A: Booking lifecycle ────────────────────────────────────────────────
  BOOKING_PREPARATION: {
    metadata: {
      requiresResolutionNote: false,
      defaultNextAction: 'Buchung für die Übergabe vorbereiten — Checkliste und Verknüpfungen prüfen',
    },
    items: [
      templateItem('Pflichtdokumente vollständig', 0),
      templateItem('Zahlungsstatus geprüft', 1, {
        isRequired: false,
        description:
          'Wird künftig aus Rechnungs- und Zahlungsstatus abgeleitet — vorerst keine Pflichtbestätigung.',
      }),
      templateItem('Fahrzeugverfügbarkeit und Freigabe geprüft', 2, {
        isRequired: false,
        description:
          'Wird künftig aus Rental-Health- und Fahrzeugstatus abgeleitet — vorerst keine Pflichtbestätigung.',
      }),
      templateItem('Reinigung bestätigt', 3),
      templateItem('Tank- oder Ladestand geprüft', 4),
      templateItem('Vereinbartes Zubehör vorbereitet', 5),
      templateItem('Übergabe ist organisatorisch vorbereitet', 6),
    ],
  },
  BOOKING_PICKUP: {
    metadata: {
      requiresResolutionNote: false,
      defaultNextAction: 'Übergabe im Handover-Flow durchführen',
    },
    items: [
      templateItem('Kunde identifizieren', 0),
      templateItem('Mietvertrag unterschreiben', 1),
      templateItem('Kaution erfassen', 2),
      templateItem('Fahrzeugzustand dokumentieren', 3),
      templateItem('Fotos aufnehmen', 4),
      templateItem('Schlüssel übergeben', 5),
    ],
  },
  BOOKING_RETURN: {
    metadata: {
      requiresResolutionNote: false,
      defaultNextAction: 'Rücknahme im Return-Handover abschließen',
    },
    items: [
      templateItem('Kilometerstand erfassen', 0),
      templateItem('Tankstand/Ladestand erfassen', 1),
      templateItem('Außenkontrolle durchführen', 2),
      templateItem('Innenkontrolle durchführen', 3),
      templateItem('Schäden dokumentieren', 4),
      templateItem('Rückgabeprotokoll abschließen', 5),
    ],
  },

  // ─── A: Vehicle maintenance / compliance ─────────────────────────────────
  TIRE_CHECK: {
    metadata: {
      requiresResolutionNote: true,
      resolutionCodes: ['TIRE_REPLACED', 'TIRE_ROTATED', 'TIRE_MEASURED_OK', 'OTHER'],
      defaultNextAction: 'Reifen prüfen und Messwerte erfassen',
    },
    items: [
      templateItem('Reifendruck prüfen', 0),
      templateItem('Profiltiefe prüfen', 1),
      templateItem('Sichtprüfung Beschädigungen', 2),
      resolutionOrientationItem('Ergebnis dokumentieren', 3),
    ],
  },
  BRAKE_CHECK: {
    metadata: {
      requiresResolutionNote: true,
      resolutionCodes: ['BRAKE_MEASURED_OK', 'BRAKE_PARTS_REPLACED', 'OTHER'],
      defaultNextAction: 'Bremsen prüfen und Messwerte dokumentieren',
    },
    items: [
      templateItem('Sichtprüfung', 0),
      templateItem('Probefahrt', 1),
      templateItem('Messwerte eintragen', 2),
      resolutionOrientationItem('Ergebnis dokumentieren', 3),
      templateItem('Rechnung/Dokument hochladen', 4),
    ],
  },
  BATTERY_CHECK: {
    metadata: {
      requiresResolutionNote: true,
      resolutionCodes: ['BATTERY_REPLACED', 'BATTERY_MEASURED_OK', 'OTHER'],
      defaultNextAction: 'Batterie prüfen und Messwert erfassen',
    },
    items: [
      templateItem('Spannung/SOH prüfen', 0),
      templateItem('Startverhalten prüfen', 1),
      templateItem('Messwert dokumentieren', 2),
    ],
  },
  VEHICLE_CLEANING: {
    metadata: {
      requiresResolutionNote: false,
      resolutionCodes: ['VEHICLE_CLEANED'],
      defaultNextAction: 'Fahrzeug innen und außen reinigen',
    },
    items: [
      templateItem('Innenraum reinigen', 0),
      templateItem('Außenreinigung prüfen', 1),
      templateItem('Müll entfernen', 2),
      templateItem('Fotos (optional)', 3, { isRequired: false }),
    ],
  },
  VEHICLE_SERVICE: {
    metadata: {
      requiresResolutionNote: true,
      resolutionCodes: ['SERVICE_SCHEDULED', 'SERVICE_COMPLETED', 'OTHER'],
      defaultNextAction: 'Servicefälligkeit prüfen und Termin planen',
    },
    items: [
      templateItem('Servicehistorie prüfen', 0),
      templateItem('Fälligkeit / Kilometerstand prüfen', 1),
      templateItem('Werkstatttermin planen', 2),
      resolutionOrientationItem('Ergebnis dokumentieren', 3),
    ],
  },
  VEHICLE_INSPECTION: {
    metadata: {
      requiresResolutionNote: true,
      resolutionCodes: ['TUV_SCHEDULED', 'TUV_PASSED', 'TUV_FAILED', 'OTHER'],
      defaultNextAction: 'HU/TÜV-Termin vorbereiten und durchführen',
    },
    items: [
      templateItem('Termin buchen', 0),
      templateItem('Fahrzeug vorbereiten', 1),
      templateItem('Prüfung durchführen', 2),
      resolutionOrientationItem('Ergebnis dokumentieren', 3),
      templateItem('Dokument hochladen', 4),
    ],
  },
  REPAIR: {
    metadata: {
      requiresResolutionNote: true,
      resolutionCodes: ['REPAIR_COMPLETED', 'PARTS_REPLACED', 'OTHER'],
      defaultNextAction: 'Reparatur beauftragen oder durchführen',
    },
    items: [
      templateItem('Schaden oder Diagnose prüfen', 0),
      templateItem('Reparatur beauftragen oder durchführen', 1),
      templateItem('Kosten und Teile erfassen', 2),
      resolutionOrientationItem('Ergebnis dokumentieren', 3),
    ],
  },

  // ─── B: Optional orientation ─────────────────────────────────────────────
  CUSTOMER_FOLLOWUP: {
    metadata: {
      requiresResolutionNote: false,
      defaultNextAction: 'Kunden kontaktieren und Rückmeldung festhalten',
    },
    items: [
      templateItem('Kundenkontakt herstellen', 0, { isRequired: false }),
      templateItem('Rückmeldung oder Ergebnis notieren', 1, {
        isRequired: false,
        description: 'Optional — kein Pflichtblocker für den Task-Abschluss.',
      }),
    ],
  },

  // C — no entries: CUSTOM, DOCUMENT_REVIEW, INVOICE_REQUIRED
};

/** Returns the full template definition for a task type, or null when none exists. */
export function getTaskTypeChecklistTemplate(type: TaskType): TaskTypeChecklistTemplate | null {
  return TASK_TYPE_CHECKLIST_TEMPLATES[type] ?? null;
}

/** Checklist items to seed on task create when no explicit checklist was provided. */
export function checklistForType(type: TaskType): TaskChecklistTemplateItem[] {
  const template = TASK_TYPE_CHECKLIST_TEMPLATES[type];
  if (!template) return [];
  return template.items.map((item) => ({ ...item }));
}
