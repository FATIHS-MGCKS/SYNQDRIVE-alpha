import type {
  TechnicalObservation,
  TechnicalObservationAffectedArea,
  TechnicalObservationCategory,
  TechnicalObservationSeverity,
  TechnicalObservationSource,
  TechnicalObservationStatus,
  RentalHealthModule,
} from '../../lib/api';

export const OBSERVATION_CATEGORIES: {
  value: TechnicalObservationCategory;
  label: string;
}[] = [
  { value: 'exterior', label: 'Außen' },
  { value: 'interior', label: 'Innenraum' },
  { value: 'lights', label: 'Licht' },
  { value: 'wipers_windows', label: 'Scheiben/Wischer' },
  { value: 'wheels_tires', label: 'Reifen/Räder' },
  { value: 'electronics_controls', label: 'Elektronik/Bedienelemente' },
  { value: 'noise_vibration', label: 'Geräusch/Vibration' },
  { value: 'driving_behavior', label: 'Fahrverhalten' },
  { value: 'comfort', label: 'Komfort' },
  { value: 'other', label: 'Sonstiges' },
];

export const OBSERVATION_AREAS: {
  value: TechnicalObservationAffectedArea;
  label: string;
}[] = [
  { value: 'front', label: 'vorne' },
  { value: 'rear', label: 'hinten' },
  { value: 'left', label: 'links' },
  { value: 'right', label: 'rechts' },
  { value: 'interior', label: 'Innenraum' },
  { value: 'dashboard', label: 'Armaturenbrett' },
  { value: 'lights', label: 'Licht' },
  { value: 'wheels', label: 'Räder' },
  { value: 'tires', label: 'Reifen' },
  { value: 'engine_bay', label: 'Motorraum' },
  { value: 'trunk', label: 'Kofferraum' },
  { value: 'unknown', label: 'unbekannt' },
];

export const OBSERVATION_SEVERITIES: {
  value: TechnicalObservationSeverity;
  label: string;
}[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch' },
];

const CATEGORY_LABEL: Record<TechnicalObservationCategory, string> = Object.fromEntries(
  OBSERVATION_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<TechnicalObservationCategory, string>;

const AREA_LABEL: Record<TechnicalObservationAffectedArea, string> = Object.fromEntries(
  OBSERVATION_AREAS.map((a) => [a.value, a.label]),
) as Record<TechnicalObservationAffectedArea, string>;

const SEVERITY_LABEL: Record<TechnicalObservationSeverity, string> = Object.fromEntries(
  OBSERVATION_SEVERITIES.map((s) => [s.value, s.label]),
) as Record<TechnicalObservationSeverity, string>;

const STATUS_LABEL: Record<TechnicalObservationStatus, string> = {
  new: 'Neu',
  active: 'Aktiv',
  in_review: 'In Prüfung',
  converted: 'Umgewandelt',
  resolved: 'Erledigt',
  dismissed: 'Verworfen',
};

const SOURCE_LABEL: Record<TechnicalObservationSource, string> = {
  manual: 'Manuell',
  operator_return: 'Rückgabe',
  operator_handover: 'Übergabe',
  customer_report: 'Kundenmeldung',
  staff_inspection: 'Fahrzeugkontrolle',
  ai_upload: 'KI-Upload',
  system_import: 'Systemimport',
  field_agent: 'Außendienst',
};

export function observationCategoryLabel(
  category: TechnicalObservationCategory | null | undefined,
): string {
  if (!category) return 'Sonstiges';
  return CATEGORY_LABEL[category] ?? category;
}

export function observationAreaLabel(
  area: TechnicalObservationAffectedArea | null | undefined,
): string | null {
  if (!area) return null;
  return AREA_LABEL[area] ?? area;
}

export function observationSeverityLabel(severity: TechnicalObservationSeverity): string {
  return SEVERITY_LABEL[severity] ?? severity;
}

export function observationStatusLabel(status: TechnicalObservationStatus): string {
  return STATUS_LABEL[status] ?? status;
}

export function observationSourceLabel(source: TechnicalObservationSource): string {
  return SOURCE_LABEL[source] ?? source;
}

export function severityChipClass(severity: TechnicalObservationSeverity): string {
  switch (severity) {
    case 'critical':
      return 'sq-chip-critical';
    case 'high':
      return 'sq-chip-watch';
    case 'medium':
      return 'sq-chip-info';
    default:
      return 'sq-chip-neutral';
  }
}

export function rentalComplaintsModuleSummary(mod: RentalHealthModule | null | undefined): {
  label: string;
  chipClass: string;
  hint: string;
} {
  const state = mod?.state ?? 'unknown';
  if (state === 'good') {
    return {
      label: 'In Ordnung',
      chipClass: 'sq-chip-success',
      hint: 'Keine relevanten aktiven Beobachtungen',
    };
  }
  if (state === 'critical') {
    return {
      label: 'Kritisch',
      chipClass: 'sq-chip-critical',
      hint: mod?.reason ?? 'Kritische oder blockierende Beobachtung',
    };
  }
  if (state === 'warning') {
    return {
      label: 'Prüfung empfohlen',
      chipClass: 'sq-chip-watch',
      hint: mod?.reason ?? 'Aktive Beobachtungen offen',
    };
  }
  return {
    label: 'Unbekannt',
    chipClass: 'sq-chip-nodata',
    hint: mod?.reason ?? 'Status nicht verfügbar',
  };
}

export function observationClosedAt(obs: TechnicalObservation): string | null {
  return obs.resolvedAt ?? obs.dismissedAt ?? null;
}

export function hasActiveLinks(obs: TechnicalObservation): boolean {
  return Boolean(
    obs.convertedToTaskId || obs.linkedDamageId || obs.linkedServiceTaskId || obs.linkedServiceCaseId,
  );
}
