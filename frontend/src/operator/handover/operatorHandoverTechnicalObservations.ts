import type {
  TechnicalObservationAffectedArea,
  TechnicalObservationCategory,
} from '../../lib/api';
import type { TranslationKey } from '../../i18n/translations/en';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';

export type OperatorHandoverObservationOrigin = 'manual' | 'warning_lights';

export interface OperatorHandoverObservationDraft {
  id: string;
  description: string;
  category: TechnicalObservationCategory;
  affectedArea?: TechnicalObservationAffectedArea;
  severity: import('../../lib/api').TechnicalObservationSeverity;
  blocksRental: boolean;
  origin: OperatorHandoverObservationOrigin;
}

export interface HandoverTechnicalObservationPayloadItem {
  description: string;
  category?: TechnicalObservationCategory;
  affectedArea?: TechnicalObservationAffectedArea;
  severity?: import('../../lib/api').TechnicalObservationSeverity;
  blocksRental?: boolean;
}

export const OPERATOR_OBSERVATION_QUICK_CHIPS: {
  id: string;
  labelKey: TranslationKey;
  placeholderKey: TranslationKey;
  category: TechnicalObservationCategory;
  affectedArea?: TechnicalObservationAffectedArea;
}[] = [
  {
    id: 'wipers',
    labelKey: 'handover.operator.chip.wipers.label',
    placeholderKey: 'handover.operator.chip.wipers.placeholder',
    category: 'wipers_windows',
    affectedArea: 'front',
  },
  {
    id: 'lights',
    labelKey: 'handover.operator.chip.lights.label',
    placeholderKey: 'handover.operator.chip.lights.placeholder',
    category: 'lights',
    affectedArea: 'lights',
  },
  {
    id: 'controls',
    labelKey: 'handover.operator.chip.controls.label',
    placeholderKey: 'handover.operator.chip.controls.placeholder',
    category: 'electronics_controls',
    affectedArea: 'dashboard',
  },
  {
    id: 'noise',
    labelKey: 'handover.operator.chip.noise.label',
    placeholderKey: 'handover.operator.chip.noise.placeholder',
    category: 'noise_vibration',
  },
  {
    id: 'interior',
    labelKey: 'handover.operator.chip.interior.label',
    placeholderKey: 'handover.operator.chip.interior.placeholder',
    category: 'interior',
    affectedArea: 'interior',
  },
  {
    id: 'electronics',
    labelKey: 'handover.operator.chip.electronics.label',
    placeholderKey: 'handover.operator.chip.electronics.placeholder',
    category: 'electronics_controls',
    affectedArea: 'dashboard',
  },
  {
    id: 'other',
    labelKey: 'handover.operator.chip.other.label',
    placeholderKey: 'handover.operator.chip.other.placeholder',
    category: 'other',
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
