import { describe, expect, it } from 'vitest';
import {
  normalizeCommunicationPrimaryTab,
  readCommunicationCenterStateFromUrl,
} from './communication-center-navigation';
import { buildCommunicationCenterSearchParams } from './communication-center-url';

describe('communication-center-navigation ai activity', () => {
  it('normalizes ai-activity tab', () => {
    expect(normalizeCommunicationPrimaryTab('ai-activity')).toBe('ai-activity');
  });

  it('parses ai activity tab from URL', () => {
    expect(readCommunicationCenterStateFromUrl('?communicationTab=ai-activity')).toEqual(
      expect.objectContaining({ primaryTab: 'ai-activity' }),
    );
  });

  it('builds canonical conversation deep link for Communication Center inbox', () => {
    const params = buildCommunicationCenterSearchParams({
      conversationId: 'conv-deep-link',
      channel: 'whatsapp',
      mobilePane: 'conversation',
    });
    expect(params.get('view')).toBe('communication-center');
    expect(params.get('conversationId')).toBe('conv-deep-link');
    expect(params.get('communicationChannel')).toBe('whatsapp');
    expect(params.get('communicationPane')).toBe('conversation');
    expect(params.get('communicationTab')).toBeNull();
  });
});
