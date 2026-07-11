/** Unreplaced i18n tokens like `{reason}` after interpolation. */
export function isUnresolvedTemplatePlaceholder(value: string | undefined | null): boolean {
  if (!value?.trim()) return false;
  return /^\{[a-zA-Z]+\}$/.test(value.trim());
}

export function sanitizeTemplateValue(value: string | undefined | null): string {
  if (!value?.trim()) return '';
  return isUnresolvedTemplatePlaceholder(value) ? '' : value.trim();
}
