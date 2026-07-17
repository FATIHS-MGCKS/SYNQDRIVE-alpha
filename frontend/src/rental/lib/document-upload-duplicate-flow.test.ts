import { describe, expect, it } from 'vitest';
import {
  isAuthorizedReuploadReason,
  shouldShowBusinessDuplicateWarning,
} from './document-upload-duplicate-flow';

describe('document-upload-duplicate-flow', () => {
  it('requires at least three characters for authorized re-upload', () => {
    expect(isAuthorizedReuploadReason('ok')).toBe(false);
    expect(isAuthorizedReuploadReason('Accounting requested corrected scan')).toBe(true);
  });

  it('flags business duplicate warnings from upload status', () => {
    expect(shouldShowBusinessDuplicateWarning('POSSIBLE_BUSINESS_DUPLICATE')).toBe(true);
    expect(shouldShowBusinessDuplicateWarning('UNIQUE')).toBe(false);
  });
});
