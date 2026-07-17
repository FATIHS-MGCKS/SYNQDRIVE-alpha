import type {
  DocumentActionPreviewStatus,
  PublicDocumentActionPlanPreview,
} from './document-extraction.types';

export function resolveActionPreviewStatusLabel(
  status: DocumentActionPreviewStatus,
  t: (key: string) => string,
): string {
  const key = `docUpload.actionPlan.status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function resolveActionRequirementLabel(
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL',
  t: (key: string) => string,
): string {
  const key = `docUpload.actionPlan.requirement.${requirement}`;
  const translated = t(key);
  return translated === key ? requirement : translated;
}

export function isActionPlanConfirmReady(
  preview: PublicDocumentActionPlanPreview | null,
  loading: boolean,
): boolean {
  if (loading || !preview) return false;
  return preview.canConfirm;
}

export function toggleDisabledOptionalAction(
  current: string[],
  semanticAction: string,
  enabled: boolean,
): string[] {
  const set = new Set(current);
  if (enabled) {
    set.delete(semanticAction);
  } else {
    set.add(semanticAction);
  }
  return [...set];
}
