import { buildReplyPayloadHash } from './communication-reply-payload';

describe('buildReplyPayloadHash', () => {
  it('differs when attachment changes under same text', () => {
    const a = buildReplyPayloadHash({
      contentType: 'IMAGE',
      text: 'caption',
      attachmentId: 'att-a',
    });
    const b = buildReplyPayloadHash({
      contentType: 'IMAGE',
      text: 'caption',
      attachmentId: 'att-b',
    });
    expect(a).not.toBe(b);
  });

  it('matches for identical payload', () => {
    const payload = {
      contentType: 'DOCUMENT' as const,
      text: '',
      attachmentId: 'att-1',
    };
    expect(buildReplyPayloadHash(payload)).toBe(buildReplyPayloadHash(payload));
  });
});
