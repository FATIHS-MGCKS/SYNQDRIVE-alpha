import { describe, expect, it } from 'vitest';
import {
  normalizeCommunicationPrimaryTab,
  readCommunicationCenterStateFromUrl,
} from './communication-center-navigation';

describe('communication-center-navigation ai activity', () => {
  it('normalizes ai-activity tab', () => {
    expect(normalizeCommunicationPrimaryTab('ai-activity')).toBe('ai-activity');
  });

  it('parses ai activity tab from URL', () => {
    expect(readCommunicationCenterStateFromUrl('?communicationTab=ai-activity')).toEqual(
      expect.objectContaining({ primaryTab: 'ai-activity' }),
    );
  });
});
