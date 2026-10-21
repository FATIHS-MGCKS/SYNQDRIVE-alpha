import { classifyDiV0S4fTinyActivationGlobalBudgetEnv } from '../di-v0-s4f-tiny-activation-global-budget-env';
import { evaluateDiV0S4fTinyActivationReadiness } from '../di-v0-s4f-activation-evidence';

describe('classifyDiV0S4fTinyActivationGlobalBudgetEnv', () => {
  it('missing or empty => UNKNOWN (not generic DIMO default true)', () => {
    expect(classifyDiV0S4fTinyActivationGlobalBudgetEnv(undefined)).toBe('UNKNOWN');
    expect(classifyDiV0S4fTinyActivationGlobalBudgetEnv('')).toBe('UNKNOWN');
    expect(classifyDiV0S4fTinyActivationGlobalBudgetEnv('   ')).toBe('UNKNOWN');
  });

  it('recognized true/false tokens', () => {
    expect(classifyDiV0S4fTinyActivationGlobalBudgetEnv('true')).toBe('ENABLED');
    expect(classifyDiV0S4fTinyActivationGlobalBudgetEnv('FALSE')).toBe('DISABLED');
    expect(classifyDiV0S4fTinyActivationGlobalBudgetEnv('on')).toBe('ENABLED');
    expect(classifyDiV0S4fTinyActivationGlobalBudgetEnv('0')).toBe('DISABLED');
  });

  it('malformed => UNKNOWN', () => {
    expect(classifyDiV0S4fTinyActivationGlobalBudgetEnv('maybe')).toBe('UNKNOWN');
  });

  it('UNKNOWN evidence fails Tiny global budget gate', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      providerGlobalBudgetEnabled: classifyDiV0S4fTinyActivationGlobalBudgetEnv(undefined),
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'UNKNOWN',
    });
    expect(r.providerGlobalBudgetEnabledGate).toBe('NOT_SATISFIED');
    expect(r.finalState).toBe('NOT_READY');
  });
});
