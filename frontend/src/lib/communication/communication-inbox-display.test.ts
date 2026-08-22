import { describe, expect, it } from 'vitest';

import { buildConversationContextLabel } from './context-label';
import { isPreviewSemanticToken, previewTokenI18nKey } from './preview';
import { resolveConversationPreview, resolveConversationTitle } from '../../rental/components/communication-center/communication-inbox-display';
import { COMMUNICATION_LIST_CONTRACT_FIXTURE } from './communication-contract.fixture';

const t = (key: string) => key;

describe('communication inbox display', () => {
  const whatsapp = COMMUNICATION_LIST_CONTRACT_FIXTURE.items[0];
  const voice = COMMUNICATION_LIST_CONTRACT_FIXTURE.items[1];
  const smsImage = COMMUNICATION_LIST_CONTRACT_FIXTURE.items[2];

  it('uses canonical displayLabel as title', () => {
    expect(resolveConversationTitle(whatsapp, t)).toBe('Max Mustermann');
    expect(resolveConversationTitle(whatsapp, t)).not.toContain('+');
  });

  it('falls back to localized unknown contact when displayLabel is blank', () => {
    expect(
      resolveConversationTitle({ ...whatsapp, displayLabel: '   ' }, t),
    ).toBe('communication.inbox.unknownContact');
  });

  it('maps preview semantic tokens', () => {
    expect(isPreviewSemanticToken('cc:IMAGE')).toBe(true);
    expect(previewTokenI18nKey('cc:IMAGE')).toBe('communication.preview.image');
    expect(resolveConversationPreview(smsImage, t)).toBe('communication.preview.image');
  });

  it('uses voice fallback when preview missing', () => {
    expect(resolveConversationPreview(voice, t)).toBe('communication.preview.voiceFallback');
  });

  it('builds context label from booking and vehicle', () => {
    expect(buildConversationContextLabel(whatsapp)).toBe('BK-ABC123 · KS-AB 123');
  });

  it('omits context label when no refs', () => {
    expect(buildConversationContextLabel(voice)).toBeNull();
  });
});
