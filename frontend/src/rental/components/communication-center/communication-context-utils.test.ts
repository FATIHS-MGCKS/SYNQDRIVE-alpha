import { describe, expect, it } from 'vitest';
import { conversationHasContext } from './communication-context-utils';
import {
  COMMUNICATION_DETAIL_FIXTURE,
  COMMUNICATION_DETAIL_EMPTY_CONTEXT_FIXTURE,
} from '../../../lib/communication/communication-timeline.fixture';

describe('conversationHasContext', () => {
  it('returns true when context sections exist', () => {
    expect(conversationHasContext(COMMUNICATION_DETAIL_FIXTURE)).toBe(true);
  });

  it('returns false for empty context', () => {
    expect(conversationHasContext(COMMUNICATION_DETAIL_EMPTY_CONTEXT_FIXTURE)).toBe(false);
  });

  it('returns false for null', () => {
    expect(conversationHasContext(null)).toBe(false);
  });
});
