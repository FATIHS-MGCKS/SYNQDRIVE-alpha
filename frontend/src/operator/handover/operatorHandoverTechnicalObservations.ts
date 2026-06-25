import type {
  TechnicalObservationAffectedArea,
  TechnicalObservationCategory,
  TechnicalObservationSeverity,
} from '../../lib/api';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';

export type OperatorHandoverObservationOrigin = 'manual' | 'warning_lights';

export interface OperatorHandoverObservationDraft {
  id: string;
  description: string;
  category: TechnicalObservationCategory;
  affectedArea?: TechnicalObservationAffectedArea;
  severity: TechnicalObservationSeverity;
  blocksRental: boolean;
  origin: OperatorHandoverObservationOrigin;
}

export interface HandoverTechnicalObservationPayloadItem {
  description: string;
  category?: TechnicalObservationCategory;
  affectedArea?: TechnicalObservationAffectedArea;
  severity?: TechnicalObservationSeverity;
  blocksRental?: boolean;
}

export const OPERATOR_OBSERVATION_QUICK_CHIPS: {
  label: string;
  category: TechnicalObservationCategory;
  affectedArea?: TechnicalObservationAffectedArea;
  placeholder: string;
}[] = [
  {
    label: 'Scheibenwischer',
    category: 'wipers_windows',
    affectedArea: 'front',
    placeholder: 'z. B. Wischer verschlissen, Spritzdüse defekt',
  },
  {
    label: 'Licht',
    category: 'lights',
    affectedArea: 'lights',
    placeholder: 'z. B. Abblendlicht defekt, Blinker hinten',
  },
  {
    label: 'Knopf/Bedienteil',
    category: 'electronics_controls',
    affectedArea: 'dashboard',
    placeholder: 'z. B. Fensterheber-Knopf lose',
  },
  {
    label: 'Geräusch',
    category: 'noise_vibration',
    placeholder: 'z. B. quietschende Bremse, Klappern',
  },
  {
    label: 'Innenraum',
    category: 'interior',
    affectedArea: 'interior',
    placeholder: 'z. B. Geruch, Verschmutzung, Sitz defekt',
  },
  {
    label: 'Elektronik',
    category: 'electronics_controls',
    affectedArea: 'dashboard',
    placeholder: 'z. B. Display, Klima, Ladeanschluss',
  },
  {
    label: 'Sonstiges',
    category: 'other',
    placeholder: 'Technische Beobachtung beschreiben',
  },
];

export function newObservationDraftId(): string {
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyObservationDraft(
  partial?: Partial<OperatorHandoverObservationDraft>,
): OperatorHandoverObservationDraft {
  return {
    id: newObservationDraftId(),
    description: '',
    category: 'other',
    severity: 'medium',
    blocksRental: false,
    origin: 'manual',
    ...partial,
  };
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function hasWarningLightsObservationCoverage(
  drafts: OperatorHandoverObservationDraft[],
  warningLightsNotes: string,
): boolean {
  const notes = normalizeText(warningLightsNotes);
  if (!notes) return false;
  return drafts.some(
    (d) =>
      d.origin === 'warning_lights' || normalizeText(d.description) === notes,
  );
}

/** Merge operator drafts + optional auto warning-lights observation for handover submit. */
export function collectTechnicalObservationsForPayload(
  _kind: HandoverDialogKind,
  state: {
    checks: { warningLightsOn: boolean };
    warningLightsNotes: string;
    technicalObservationDrafts: OperatorHandoverObservationDraft[];
  },
): HandoverTechnicalObservationPayloadItem[] {
  const items: HandoverTechnicalObservationPayloadItem[] = state.technicalObservationDrafts
    .map((d) => ({
      description: d.description.trim(),
      category: d.category,
      affectedArea: d.affectedArea,
      severity: d.severity,
      blocksRental: d.blocksRental,
    }))
    .filter((d) => d.description.length >= 3);

  const warningNotes = state.checks.warningLightsOn ? state.warningLightsNotes.trim() : '';
  if (
    warningNotes.length >= 3 &&
    !hasWarningLightsObservationCoverage(state.technicalObservationDrafts, warningNotes)
  ) {
    items.push({
      description: warningNotes,
      category: 'lights',
      affectedArea: 'dashboard',
      severity: 'medium',
      blocksRental: false,
    });
  }

  return items;
}

export function handoverObservationSourceLabel(kind: HandoverDialogKind): string {
  return kind === 'RETURN' ? 'Rückgabe' : 'Übergabe';
}
