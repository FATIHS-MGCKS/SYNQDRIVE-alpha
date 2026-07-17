import type {
  BrakeComponentEvidenceLine,
  BrakeEvidencePresentation,
  BrakeHealthSummary,
  BrakeStructuredAction,
} from '../../lib/api';
import { segmentFromHealthState } from './health-segment-display';

export type BrakeUiLocale = 'de' | 'en';

export function brakeEvidencePresentation(
  summary: BrakeHealthSummary | null | undefined,
): BrakeEvidencePresentation | null {
  return summary?.evidencePresentation ?? null;
}

export function brakeOverviewLabel(
  summary: BrakeHealthSummary | null | undefined,
  locale: BrakeUiLocale = 'de',
): string {
  const ep = brakeEvidencePresentation(summary);
  if (ep) return locale === 'de' ? ep.overviewLabelDe : ep.overviewLabelEn;
  if (summary?.stateClass === 'NO_BASELINE') {
    return locale === 'de' ? 'Bremsbaseline erforderlich' : 'Brake baseline required';
  }
  return summary?.overallCondition ?? '—';
}

export function brakeUiStatusLabel(
  summary: BrakeHealthSummary | null | undefined,
  locale: BrakeUiLocale = 'de',
): string {
  const ep = brakeEvidencePresentation(summary);
  if (ep) return locale === 'de' ? ep.uiStatusLabelDe : ep.uiStatusLabelEn;
  return summary?.overallCondition ?? '—';
}

export function brakeRemainingKmLabel(
  summary: BrakeHealthSummary | null | undefined,
  locale: BrakeUiLocale = 'de',
): string {
  const ep = brakeEvidencePresentation(summary);
  if (ep?.overallRemainingKm) {
    return locale === 'de' ? ep.overallRemainingKm.displayDe : ep.overallRemainingKm.displayEn;
  }
  return '—';
}

export function brakeComponentLines(
  summary: BrakeHealthSummary | null | undefined,
): BrakeComponentEvidenceLine[] {
  return summary?.evidencePresentation?.components ?? [];
}

export function brakeStructuredActions(
  summary: BrakeHealthSummary | null | undefined,
  locale: BrakeUiLocale = 'de',
): Array<Pick<BrakeStructuredAction, 'code'> & { label: string }> {
  const ep = brakeEvidencePresentation(summary);
  if (!ep?.structuredActions?.length) return [];
  return ep.structuredActions.map((action) => ({
    code: action.code,
    label: locale === 'de' ? action.labelDe : action.labelEn,
  }));
}

export function brakeActiveDataQuality(
  summary: BrakeHealthSummary | null | undefined,
  locale: BrakeUiLocale = 'de',
) {
  return (summary?.evidencePresentation?.dataQuality ?? []).filter((item) => item.active).map((item) => ({
    code: item.code,
    label: locale === 'de' ? item.labelDe : item.labelEn,
    detail: locale === 'de' ? item.detailDe : item.detailEn,
  }));
}

export function brakeActiveSafety(
  summary: BrakeHealthSummary | null | undefined,
  locale: BrakeUiLocale = 'de',
) {
  return (summary?.evidencePresentation?.safety ?? []).filter((item) => item.active).map((item) => ({
    code: item.code,
    label: locale === 'de' ? item.labelDe : item.labelEn,
    detail: locale === 'de' ? item.detailDe : item.detailEn,
    severity: item.severity,
  }));
}

export function brakeComponentLabel(
  line: BrakeComponentEvidenceLine,
  locale: BrakeUiLocale = 'de',
): string {
  return locale === 'de' ? line.labelDe : line.labelEn;
}

export function brakeComponentValueLabel(
  line: BrakeComponentEvidenceLine,
  locale: BrakeUiLocale = 'de',
): string {
  return locale === 'de' ? line.valueLabelDe : line.valueLabelEn;
}

export function brakeComponentEvidenceClassLabel(
  line: BrakeComponentEvidenceLine,
  locale: BrakeUiLocale = 'de',
): string {
  return locale === 'de' ? line.evidenceClassLabelDe : line.evidenceClassLabelEn;
}

export function brakeComponentRemainingLabel(
  line: BrakeComponentEvidenceLine,
  locale: BrakeUiLocale = 'de',
): string {
  return locale === 'de' ? line.remainingKm.displayDe : line.remainingKm.displayEn;
}

export function brakeStatusToSegment(condition: string | null | undefined) {
  return segmentFromHealthState(condition ?? 'UNKNOWN');
}

export const BRAKE_SERVICE_KIND_OPTIONS: Array<{
  value: import('../../lib/api').BrakeServiceKindInput;
  labelDe: string;
  labelEn: string;
}> = [
  { value: 'full_brake_service', labelDe: 'Kompletter Bremsservice', labelEn: 'Full brake service' },
  { value: 'pads_service', labelDe: 'Belagservice', labelEn: 'Pad service' },
  { value: 'discs_service', labelDe: 'Scheibenservice', labelEn: 'Disc service' },
  { value: 'inspection_only', labelDe: 'Nur Inspektion', labelEn: 'Inspection only' },
  { value: 'brake_fluid_service', labelDe: 'Bremsflüssigkeit', labelEn: 'Brake fluid service' },
];

export const BRAKE_SERVICE_SCOPE_OPTIONS: Array<{
  value: import('../../lib/api').BrakeServiceScopeInput;
  labelDe: string;
  labelEn: string;
}> = [
  { value: 'front_pads', labelDe: 'Vordere Beläge', labelEn: 'Front pads' },
  { value: 'rear_pads', labelDe: 'Hintere Beläge', labelEn: 'Rear pads' },
  { value: 'front_discs', labelDe: 'Vordere Scheiben', labelEn: 'Front discs' },
  { value: 'rear_discs', labelDe: 'Hintere Scheiben', labelEn: 'Rear discs' },
];

export function brakeServiceScopeResetsComponent(
  kind: import('../../lib/api').BrakeServiceKindInput,
): boolean {
  return kind !== 'inspection_only' && kind !== 'brake_fluid_service';
}
