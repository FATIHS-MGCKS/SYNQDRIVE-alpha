import { describe, expect, it } from 'vitest';
import {
  buildEvaluationsPermissionGate,
  hasEvaluationsPermission,
  resolveEvaluationsPiiTierFromPermissions,
} from './evaluations-permissions';

describe('evaluations-permissions', () => {
  it('grants executive access via evaluations module or legacy invoices.read', () => {
    expect(
      hasEvaluationsPermission(
        (module, level) => module === 'evaluations' && level === 'read',
        'evaluations.executive.read',
      ),
    ).toBe(true);

    expect(
      hasEvaluationsPermission(
        (module, level) => module === 'invoices' && level === 'read',
        'evaluations.executive.read',
      ),
    ).toBe(true);
  });

  it('denies finance access for executive-only gate', () => {
    const gate = buildEvaluationsPermissionGate((module, level) => {
      if (module === 'evaluations' && level === 'read') return true;
      return false;
    });

    expect(gate.canAccessPage).toBe(true);
    expect(gate.canFinance).toBe(false);
    expect(gate.canExport).toBe(false);
  });

  it('resolves PII tier from customer_pii permission', () => {
    const tier = resolveEvaluationsPiiTierFromPermissions(
      (module, level) => module === 'evaluations-customer-pii' && level === 'read',
      'WORKER',
    );
    expect(tier).toBe('full');
  });
});
