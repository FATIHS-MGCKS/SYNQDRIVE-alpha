import { LEGAL_STATUS } from './documents.constants';
import {
  LEGAL_ACTIVATABLE_STATUSES,
  LEGAL_STATUS_TRANSITIONS,
  assertLegalStatusTransition,
  isLegalStatusTransitionAllowed,
  LegalStatusTransitionError,
} from './legal-document-lifecycle.transitions';

describe('legal-document-lifecycle.transitions', () => {
  describe('isLegalStatusTransitionAllowed', () => {
    it.each([
      [LEGAL_STATUS.DRAFT, LEGAL_STATUS.IN_REVIEW, true],
      [LEGAL_STATUS.DRAFT, LEGAL_STATUS.ARCHIVED, true],
      [LEGAL_STATUS.DRAFT, LEGAL_STATUS.ACTIVE, false],
      [LEGAL_STATUS.IN_REVIEW, LEGAL_STATUS.APPROVED, true],
      [LEGAL_STATUS.IN_REVIEW, LEGAL_STATUS.DRAFT, true],
      [LEGAL_STATUS.APPROVED, LEGAL_STATUS.SCHEDULED, true],
      [LEGAL_STATUS.APPROVED, LEGAL_STATUS.ACTIVE, true],
      [LEGAL_STATUS.SCHEDULED, LEGAL_STATUS.ACTIVE, true],
      [LEGAL_STATUS.SCHEDULED, LEGAL_STATUS.APPROVED, true],
      [LEGAL_STATUS.ACTIVE, LEGAL_STATUS.SUPERSEDED, true],
      [LEGAL_STATUS.ACTIVE, LEGAL_STATUS.REVOKED, true],
      [LEGAL_STATUS.ACTIVE, LEGAL_STATUS.ARCHIVED, false],
      [LEGAL_STATUS.SUPERSEDED, LEGAL_STATUS.ARCHIVED, true],
      [LEGAL_STATUS.REVOKED, LEGAL_STATUS.ARCHIVED, true],
      [LEGAL_STATUS.ARCHIVED, LEGAL_STATUS.DRAFT, false],
      [LEGAL_STATUS.ARCHIVED, LEGAL_STATUS.ACTIVE, false],
      ['UNKNOWN', LEGAL_STATUS.ACTIVE, false],
    ])('%s → %s = %s', (from, to, expected) => {
      expect(isLegalStatusTransitionAllowed(from, to)).toBe(expected);
    });
  });

  it('exposes a transition list for every known status', () => {
    for (const status of Object.values(LEGAL_STATUS)) {
      expect(Array.isArray(LEGAL_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });

  it('never allows DRAFT → ACTIVE (must pass review/approval)', () => {
    expect(isLegalStatusTransitionAllowed(LEGAL_STATUS.DRAFT, LEGAL_STATUS.ACTIVE)).toBe(false);
    expect(() => assertLegalStatusTransition(LEGAL_STATUS.DRAFT, LEGAL_STATUS.ACTIVE)).toThrow(
      LegalStatusTransitionError,
    );
  });

  it('never allows IN_REVIEW → ACTIVE directly', () => {
    expect(isLegalStatusTransitionAllowed(LEGAL_STATUS.IN_REVIEW, LEGAL_STATUS.ACTIVE)).toBe(false);
  });

  it('keeps REVOKED and SUPERSEDED as distinct successor paths from ACTIVE', () => {
    expect(LEGAL_STATUS_TRANSITIONS[LEGAL_STATUS.ACTIVE]).toEqual([
      LEGAL_STATUS.SUPERSEDED,
      LEGAL_STATUS.REVOKED,
    ]);
    expect(LEGAL_STATUS_TRANSITIONS[LEGAL_STATUS.ACTIVE]).not.toContain(LEGAL_STATUS.ARCHIVED);
  });

  it('restricts activation entry points to APPROVED and SCHEDULED', () => {
    expect(LEGAL_ACTIVATABLE_STATUSES.has(LEGAL_STATUS.APPROVED)).toBe(true);
    expect(LEGAL_ACTIVATABLE_STATUSES.has(LEGAL_STATUS.SCHEDULED)).toBe(true);
    expect(LEGAL_ACTIVATABLE_STATUSES.has(LEGAL_STATUS.DRAFT)).toBe(false);
    expect(LEGAL_ACTIVATABLE_STATUSES.has(LEGAL_STATUS.IN_REVIEW)).toBe(false);
  });
});
