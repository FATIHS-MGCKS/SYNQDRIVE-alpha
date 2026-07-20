import { describe, expect, it } from 'vitest';
import type { Vendor } from '../../../lib/api';
import {
  normalizeVendorList,
  resolveVendorSourceAfterError,
  resolveVendorSourceAfterSuccess,
  VENDOR_SOURCE_ERROR_MESSAGE,
} from './vendor-source-state';

function vendor(id: string): Vendor {
  return {
    id,
    organizationId: 'org-1',
    name: `Vendor ${id}`,
    category: 'WORKSHOP',
    status: 'ACTIVE',
    source: 'MANUAL',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Vendor;
}

describe('vendor-source-state', () => {
  it('normalizes successful vendor responses', () => {
    const fetchedAt = '2026-07-20T12:00:00.000Z';
    const result = resolveVendorSourceAfterSuccess([vendor('v1')], fetchedAt);

    expect(result.vendors).toHaveLength(1);
    expect(result.status).toBe('ready');
    expect(result.fetchedAt).toBe(fetchedAt);
    expect(result.error).toBeNull();
  });

  it('treats a successful empty response as zero partners', () => {
    const result = resolveVendorSourceAfterSuccess([], '2026-07-20T12:00:00.000Z');

    expect(result.vendors).toEqual([]);
    expect(result.status).toBe('ready');
    expect(result.error).toBeNull();
  });

  it('treats vendor API errors as unknown when no prior data exists', () => {
    const result = resolveVendorSourceAfterError([], 'idle');

    expect(result.vendors).toEqual([]);
    expect(result.status).toBe('error');
    expect(result.error).toBe(VENDOR_SOURCE_ERROR_MESSAGE);
  });

  it('keeps prior vendor data as stale after reload failure', () => {
    const previous = [vendor('v1')];
    const result = resolveVendorSourceAfterError(previous, 'ready');

    expect(result.vendors).toEqual(previous);
    expect(result.status).toBe('stale');
    expect(result.error).toBe(VENDOR_SOURCE_ERROR_MESSAGE);
  });

  it('normalizes non-array vendor payloads to an empty list', () => {
    expect(normalizeVendorList(null)).toEqual([]);
    expect(normalizeVendorList({ data: [] })).toEqual([]);
  });
});
