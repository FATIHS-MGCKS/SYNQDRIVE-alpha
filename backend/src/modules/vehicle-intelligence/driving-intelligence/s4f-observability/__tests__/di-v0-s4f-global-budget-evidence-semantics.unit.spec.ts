import {
  classifyGlobalBudgetConfigFileStateFromRaw,
  resolveTinyActivationProviderGlobalBudgetEvidence,
} from '../di-v0-s4f-global-budget-evidence-semantics';

describe('global budget evidence semantics', () => {
  it('classifies config file raw values', () => {
    expect(classifyGlobalBudgetConfigFileStateFromRaw(undefined, true)).toBe('MISSING');
    expect(classifyGlobalBudgetConfigFileStateFromRaw('', true)).toBe('MISSING');
    expect(classifyGlobalBudgetConfigFileStateFromRaw('true', true)).toBe('EXPLICIT_ENABLED');
    expect(classifyGlobalBudgetConfigFileStateFromRaw('false', true)).toBe('EXPLICIT_DISABLED');
    expect(classifyGlobalBudgetConfigFileStateFromRaw('maybe', true)).toBe('MALFORMED');
    expect(classifyGlobalBudgetConfigFileStateFromRaw('true', false)).toBe('UNREADABLE');
  });

  it('ENABLED only with explicit config and confirmed runtime', () => {
    expect(
      resolveTinyActivationProviderGlobalBudgetEvidence({
        configFileState: 'EXPLICIT_ENABLED',
        activeRuntimeState: 'CONFIRMED_ENABLED',
      }),
    ).toBe('ENABLED');
    expect(
      resolveTinyActivationProviderGlobalBudgetEvidence({
        configFileState: 'EXPLICIT_ENABLED',
        activeRuntimeState: 'UNVERIFIED',
      }),
    ).toBe('UNKNOWN');
    expect(
      resolveTinyActivationProviderGlobalBudgetEvidence({
        configFileState: 'MISSING',
        activeRuntimeState: 'CONFIRMED_ENABLED',
      }),
    ).toBe('UNKNOWN');
    expect(
      resolveTinyActivationProviderGlobalBudgetEvidence({
        configFileState: 'EXPLICIT_DISABLED',
        activeRuntimeState: 'CONFIRMED_DISABLED',
      }),
    ).toBe('DISABLED');
  });
});
