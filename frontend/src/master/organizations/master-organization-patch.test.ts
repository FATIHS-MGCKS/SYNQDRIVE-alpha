import { describe, expect, it } from 'vitest';
import {
  classifyMasterOrgPatchError,
  shouldClearPendingOrgPatch,
  shouldRetainPendingOrgPatch,
} from './master-organization-patch';

describe('master organization patch error classification', () => {
  it('detects STEP_UP_REQUIRED', () => {
    const err = new Error('[STEP_UP_REQUIRED] MFA required');
    expect(classifyMasterOrgPatchError(err).stepUpRequired).toBe(true);
    expect(shouldRetainPendingOrgPatch(err)).toBe(true);
    expect(shouldClearPendingOrgPatch(err)).toBe(false);
  });

  it('detects MFA_ENROLLMENT_REQUIRED', () => {
    const err = new Error('[MFA_ENROLLMENT_REQUIRED] enroll first');
    expect(classifyMasterOrgPatchError(err).enrollmentRequired).toBe(true);
    expect(shouldClearPendingOrgPatch(err)).toBe(true);
    expect(shouldRetainPendingOrgPatch(err)).toBe(false);
  });

  it('treats generic errors as non-retained', () => {
    const err = new Error('[FORBIDDEN] nope');
    expect(shouldRetainPendingOrgPatch(err)).toBe(false);
    expect(shouldClearPendingOrgPatch(err)).toBe(false);
  });
});