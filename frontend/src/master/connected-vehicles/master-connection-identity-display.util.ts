export function formatMasterConnectionModalityLabel(
  modality: string | undefined | null,
): string {
  const raw = String(modality ?? '').trim();
  if (!raw) return '';
  return raw.replace(/_/g, ' ');
}

export function formatMasterTelemetryConnectionFamilyLabel(
  family: string | undefined | null,
): string {
  const raw = String(family ?? '').trim();
  if (!raw) return '';
  return raw.replace(/_/g, ' ');
}
