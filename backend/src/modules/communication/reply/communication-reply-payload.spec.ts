import {
  buildReplyPayloadHash,
  matchesReplyCommandPayload,
} from './communication-reply-payload';

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

  it('differs when caption changes under same attachment', () => {
    const a = buildReplyPayloadHash({
      contentType: 'IMAGE',
      text: 'caption-a',
      attachmentId: 'att-1',
    });
    const b = buildReplyPayloadHash({
      contentType: 'IMAGE',
      text: 'caption-b',
      attachmentId: 'att-1',
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

describe('matchesReplyCommandPayload', () => {
  const specialText = 'Hello "team"\nPath \\\\ test\nÄÖÜ 🚗';

  it('accepts legacy null-hash TEXT replay with identical text', () => {
    const requested = {
      contentType: 'TEXT' as const,
      text: specialText,
      attachmentId: null,
      templateId: null,
      templateVariables: {},
      payloadHash: buildReplyPayloadHash({
        contentType: 'TEXT',
        text: specialText,
        attachmentId: null,
      }),
    };

    expect(
      matchesReplyCommandPayload(
        {
          contentType: 'TEXT',
          text: specialText,
          attachmentId: null,
          payloadHash: null,
        },
        requested,
      ),
    ).toBe(true);
  });

  it('rejects legacy null-hash replay when text differs', () => {
    const requested = {
      contentType: 'TEXT' as const,
      text: 'Different',
      attachmentId: null,
      templateId: null,
      templateVariables: {},
      payloadHash: buildReplyPayloadHash({
        contentType: 'TEXT',
        text: 'Different',
        attachmentId: null,
      }),
    };

    expect(
      matchesReplyCommandPayload(
        {
          contentType: 'TEXT',
          text: 'Hello',
          attachmentId: null,
          payloadHash: null,
        },
        requested,
      ),
    ).toBe(false);
  });

  it('rejects legacy null-hash replay for media payloads', () => {
    const requested = {
      contentType: 'IMAGE' as const,
      text: '',
      attachmentId: 'att-1',
      templateId: null,
      templateVariables: {},
      payloadHash: buildReplyPayloadHash({
        contentType: 'IMAGE',
        text: '',
        attachmentId: 'att-1',
      }),
    };

    expect(
      matchesReplyCommandPayload(
        {
          contentType: 'TEXT',
          text: 'Hello',
          attachmentId: null,
          payloadHash: null,
        },
        requested,
      ),
    ).toBe(false);
  });

  it('uses payloadHash when present on stored command', () => {
    const hash = buildReplyPayloadHash({
      contentType: 'IMAGE',
      text: 'cap',
      attachmentId: 'att-1',
    });

    expect(
      matchesReplyCommandPayload(
        {
          contentType: 'IMAGE',
          text: 'different-visible-text',
          attachmentId: 'att-1',
          payloadHash: hash,
        },
        {
          contentType: 'IMAGE',
          text: 'cap',
          attachmentId: 'att-1',
          templateId: null,
          templateVariables: {},
          payloadHash: hash,
        },
      ),
    ).toBe(true);
  });
});
