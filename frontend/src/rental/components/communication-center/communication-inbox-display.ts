import type { TranslationKey } from '../../i18n/translations/en';
import type { CommunicationConversationListItem } from '../../../lib/communication/types';
import { isPreviewSemanticToken, previewTokenI18nKey } from '../../../lib/communication/preview';

export function resolveConversationPreview(
  conversation: CommunicationConversationListItem,
  t: (key: TranslationKey) => string,
): string | null {
  const preview = conversation.lastMessagePreview?.trim();
  if (!preview) {
    if (conversation.channel === 'VOICE') {
      return t('communication.preview.voiceFallback');
    }
    return null;
  }
  if (isPreviewSemanticToken(preview)) {
    const key = previewTokenI18nKey(preview);
    return key ? t(key as TranslationKey) : null;
  }
  return preview;
}

export function resolveConversationTitle(
  conversation: CommunicationConversationListItem,
  t: (key: TranslationKey) => string,
): string {
  const label = conversation.displayLabel?.trim();
  if (label) return label;
  return t('communication.inbox.unknownContact');
}
