import { describe, expect, it } from 'vitest';

import { resolveCommunicationPagination } from './pagination';

describe('resolveCommunicationPagination', () => {
  it('passes through valid advancing cursor', () => {
    expect(
      resolveCommunicationPagination('page-1', {
        hasMore: true,
        nextCursor: 'page-2',
      }),
    ).toEqual({ hasMore: true, nextCursor: 'page-2', stalled: false });
  });

  it('stops when hasMore is true but nextCursor is null', () => {
    expect(
      resolveCommunicationPagination('page-1', {
        hasMore: true,
        nextCursor: null,
      }),
    ).toEqual({ hasMore: false, nextCursor: null, stalled: true });
  });

  it('stops when nextCursor does not advance', () => {
    expect(
      resolveCommunicationPagination('page-1', {
        hasMore: true,
        nextCursor: 'page-1',
      }),
    ).toEqual({ hasMore: false, nextCursor: null, stalled: true });
  });

  it('ends pagination when hasMore is false', () => {
    expect(
      resolveCommunicationPagination('page-2', {
        hasMore: false,
        nextCursor: null,
      }),
    ).toEqual({ hasMore: false, nextCursor: null, stalled: false });
  });
});
