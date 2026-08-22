/** Maps C7.2 preview semantic tokens to i18n keys. */

const PREVIEW_TOKEN_KEYS: Record<string, string> = {
  'cc:IMAGE': 'communication.preview.image',
  'cc:VIDEO': 'communication.preview.video',
  'cc:AUDIO': 'communication.preview.audio',
  'cc:DOCUMENT': 'communication.preview.document',
  'cc:LOCATION': 'communication.preview.location',
  'cc:CONTACT': 'communication.preview.contact',
  'cc:MIXED': 'communication.preview.mixed',
  'cc:UNSUPPORTED': 'communication.preview.unsupported',
};

export function isPreviewSemanticToken(preview: string | null | undefined): boolean {
  return Boolean(preview?.startsWith('cc:'));
}

export function previewTokenI18nKey(preview: string): string | null {
  return PREVIEW_TOKEN_KEYS[preview] ?? null;
}
