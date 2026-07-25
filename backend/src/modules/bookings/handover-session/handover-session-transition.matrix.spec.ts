import {
  ACTION_TARGET_STATUS,
  isHandoverSessionTerminalStatus,
  isTransitionAllowedInMatrix,
  resolveTargetStatusForAction,
} from './handover-session-transition.matrix';
import {
  HANDOVER_SESSION_NOT_STARTED,
  HANDOVER_SESSION_STATUSES,
  type HandoverSessionTransitionAction,
} from './handover-session.types';

describe('handover-session-transition.matrix', () => {
  const allStatuses = [HANDOVER_SESSION_NOT_STARTED, ...HANDOVER_SESSION_STATUSES];

  it('defines action target statuses for all operational actions', () => {
    const actions: HandoverSessionTransitionAction[] = [
      'START',
      'ACQUIRE',
      'RELEASE',
      'SYNC_REQUIREMENTS',
      'SYNC_SIGNATURES',
      'SUBMIT',
      'CANCEL',
      'COMPLETE',
      'SUPERSEDE',
    ];
    for (const action of actions) {
      expect(ACTION_TARGET_STATUS[action]).toBeDefined();
    }
  });

  it('allows NOT_STARTED → DRAFT and AWAITING_REQUIREMENTS only', () => {
    expect(isTransitionAllowedInMatrix(HANDOVER_SESSION_NOT_STARTED, 'DRAFT')).toBe(true);
    expect(isTransitionAllowedInMatrix(HANDOVER_SESSION_NOT_STARTED, 'AWAITING_REQUIREMENTS')).toBe(
      true,
    );
    expect(isTransitionAllowedInMatrix(HANDOVER_SESSION_NOT_STARTED, 'IN_PROGRESS')).toBe(false);
    expect(isTransitionAllowedInMatrix(HANDOVER_SESSION_NOT_STARTED, 'SUBMITTED')).toBe(false);
  });

  it('forbids transitions out of CANCELLED and SUPERSEDED', () => {
    for (const to of HANDOVER_SESSION_STATUSES) {
      expect(isTransitionAllowedInMatrix('CANCELLED', to)).toBe(to === 'CANCELLED');
      expect(isTransitionAllowedInMatrix('SUPERSEDED', to)).toBe(to === 'SUPERSEDED');
    }
  });

  it('allows COMPLETED → SUPERSEDED only', () => {
    expect(isTransitionAllowedInMatrix('COMPLETED', 'SUPERSEDED')).toBe(true);
    expect(isTransitionAllowedInMatrix('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(isTransitionAllowedInMatrix('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('allows SUBMITTED → IN_PROGRESS (retry) and COMPLETED', () => {
    expect(isTransitionAllowedInMatrix('SUBMITTED', 'IN_PROGRESS')).toBe(true);
    expect(isTransitionAllowedInMatrix('SUBMITTED', 'COMPLETED')).toBe(true);
    expect(isTransitionAllowedInMatrix('SUBMITTED', 'DRAFT')).toBe(false);
  });

  it('marks terminal statuses correctly', () => {
    expect(isHandoverSessionTerminalStatus('COMPLETED')).toBe(true);
    expect(isHandoverSessionTerminalStatus('CANCELLED')).toBe(true);
    expect(isHandoverSessionTerminalStatus('SUPERSEDED')).toBe(true);
    expect(isHandoverSessionTerminalStatus('DRAFT')).toBe(false);
  });

  it('resolves explicit toStatus over action default', () => {
    expect(resolveTargetStatusForAction('START', 'AWAITING_REQUIREMENTS')).toBe(
      'AWAITING_REQUIREMENTS',
    );
    expect(resolveTargetStatusForAction('START', undefined)).toBe('DRAFT');
  });

  it('documents forbidden cross-state jumps from AWAITING_SIGNATURE', () => {
    expect(isTransitionAllowedInMatrix('AWAITING_SIGNATURE', 'DRAFT')).toBe(false);
    expect(isTransitionAllowedInMatrix('AWAITING_SIGNATURE', 'AWAITING_REQUIREMENTS')).toBe(false);
    expect(isTransitionAllowedInMatrix('AWAITING_SIGNATURE', 'SUBMITTED')).toBe(true);
    expect(isTransitionAllowedInMatrix('AWAITING_SIGNATURE', 'CANCELLED')).toBe(true);
  });

  it('enumerates matrix coverage for regression snapshot', () => {
    const allowed: string[] = [];
    const forbidden: string[] = [];
    for (const from of allStatuses) {
      for (const to of HANDOVER_SESSION_STATUSES) {
        const edge = `${from}→${to}`;
        if (isTransitionAllowedInMatrix(from, to)) allowed.push(edge);
        else forbidden.push(edge);
      }
    }
    expect(allowed).toContain('NOT_STARTED→DRAFT');
    expect(forbidden).toContain('CANCELLED→DRAFT');
    expect(forbidden).toContain('COMPLETED→DRAFT');
    expect(allowed.length).toBeGreaterThan(10);
    expect(forbidden.length).toBeGreaterThan(30);
  });
});
