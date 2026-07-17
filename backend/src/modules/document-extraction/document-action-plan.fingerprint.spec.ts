import {
  buildDocumentActionPlanInputFingerprint,
  requiresNewDocumentActionPlan,
} from './document-action-plan.fingerprint';
import type { DocumentActionPlanInputIdentity } from './document-action-plan.types';

const baseIdentity = (): DocumentActionPlanInputIdentity => ({
  organizationId: 'org-1',
  extractionId: 'ext-1',
  effectiveDocumentType: 'INVOICE',
  confirmedData: { invoiceNumber: 'INV-1', totalGross: 119 },
  entityLinks: [{ role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' }],
  applyMode: 'PREVIEW',
  applySafetyDecision: { canApply: true },
});

describe('document-action-plan.fingerprint', () => {
  it('builds a stable fingerprint for the same identity', () => {
    const identity = baseIdentity();
    const first = buildDocumentActionPlanInputFingerprint(identity);
    const second = buildDocumentActionPlanInputFingerprint({
      ...identity,
      confirmedData: { totalGross: 119, invoiceNumber: 'INV-1' },
      entityLinks: [
        { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
      ],
    });

    expect(first).toHaveLength(64);
    expect(second).toBe(first);
  });

  it('changes fingerprint when confirmed data changes', () => {
    const identity = baseIdentity();
    const baseline = buildDocumentActionPlanInputFingerprint(identity);
    const changed = buildDocumentActionPlanInputFingerprint({
      ...identity,
      confirmedData: { ...identity.confirmedData, totalGross: 120 },
    });

    expect(changed).not.toBe(baseline);
    expect(
      requiresNewDocumentActionPlan({ inputFingerprint: baseline }, changed),
    ).toBe(true);
  });

  it('changes fingerprint when entity assignments change', () => {
    const identity = baseIdentity();
    const baseline = buildDocumentActionPlanInputFingerprint(identity);
    const changed = buildDocumentActionPlanInputFingerprint({
      ...identity,
      entityLinks: [{ role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-2' }],
    });

    expect(changed).not.toBe(baseline);
  });

  it('rejects secret-like keys in confirmed data', () => {
    expect(() =>
      buildDocumentActionPlanInputFingerprint({
        ...baseIdentity(),
        confirmedData: { api_key: 'secret' },
      }),
    ).toThrow(/secret-like key/i);
  });
});
