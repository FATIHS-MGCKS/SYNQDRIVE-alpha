import { describe, expect, it } from 'vitest';
import { unwrapTaskArrayResponse } from './task-list-response.utils';

describe('unwrapTaskArrayResponse', () => {
  it('returns arrays unchanged', () => {
    const rows = [{ id: 't1' }];
    expect(unwrapTaskArrayResponse(rows)).toBe(rows);
  });

  it('unwraps paginated task list pages', () => {
    const rows = [{ id: 't1' }, { id: 't2' }];
    expect(
      unwrapTaskArrayResponse({
        data: rows,
        meta: { limit: 50, nextCursor: null },
      }),
    ).toEqual(rows);
  });

  it('returns empty array for invalid payloads', () => {
    expect(unwrapTaskArrayResponse(null)).toEqual([]);
    expect(unwrapTaskArrayResponse({})).toEqual([]);
    expect(unwrapTaskArrayResponse({ meta: { limit: 50, nextCursor: null } })).toEqual([]);
  });
});
