import { describe, expect, it } from 'vitest';
import { isProductMetadataConflict, shouldRetainProductMetadataPending } from './master-product-metadata-patch';

describe('master-product-metadata-patch', () => {
  it('detects MFA retention', () => {
    expect(shouldRetainProductMetadataPending(403, '[STEP_UP_REQUIRED]')).toBe(true);
    expect(shouldRetainProductMetadataPending(409, 'x')).toBe(false);
  });

  it('detects metadata conflict', () => {
    expect(isProductMetadataConflict(409, 'metadata changed concurrently')).toBe(true);
    expect(isProductMetadataConflict(400, 'x')).toBe(false);
  });
});