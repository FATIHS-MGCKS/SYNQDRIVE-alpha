// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test/renderHook';
import { communicationClient } from '../communication-client';
import { useCommunicationAttachmentDraft } from './useCommunicationAttachmentDraft';

vi.mock('../communication-client', () => ({
  communicationClient: {
    uploadAttachment: vi.fn(),
  },
}));

describe('useCommunicationAttachmentDraft', () => {
  beforeEach(() => {
    vi.mocked(communicationClient.uploadAttachment).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not apply upload completion after conversation switch', async () => {
    let resolveUpload: (value: unknown) => void = () => {};
    vi.mocked(communicationClient.uploadAttachment).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ orgId, conversationId }) =>
        useCommunicationAttachmentDraft({ orgId, conversationId, enabled: true }),
      {
        initialProps: { orgId: 'org-a', conversationId: 'conv-a' },
      },
    );

    const file = new File(['hello'], 'photo.jpg', { type: 'image/jpeg' });
    act(() => {
      result.current.selectFile(file);
    });

    expect(result.current.draft.status).toBe('uploading');

    rerender({ orgId: 'org-a', conversationId: 'conv-b' });
    expect(result.current.draft.status).toBe('idle');

    await act(async () => {
      resolveUpload({
        id: 'att-1',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5,
        mediaType: 'IMAGE',
        state: 'READY',
      });
      await Promise.resolve();
    });

    expect(result.current.draft.status).toBe('idle');
  });

  it('marks attachment ready after successful upload', async () => {
    vi.mocked(communicationClient.uploadAttachment).mockResolvedValue({
      id: 'att-2',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      mediaType: 'DOCUMENT',
      state: 'READY',
    });

    const { result } = renderHook(() =>
      useCommunicationAttachmentDraft({
        orgId: 'org-a',
        conversationId: 'conv-a',
        enabled: true,
      }),
    );

    act(() => {
      result.current.selectFile(new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }));
    });

    await vi.waitFor(() => {
      expect(result.current.draft.status).toBe('ready');
    });
  });
});
