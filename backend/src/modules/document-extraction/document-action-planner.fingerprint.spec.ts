import { buildDocumentActionPlannerInputFingerprint } from './document-action-planner.fingerprint';
import { buildPlannerTestInput } from './document-action-planner.test-fixtures';

describe('buildDocumentActionPlannerInputFingerprint', () => {
  it('returns stable hex fingerprint for identical input', () => {
    const input = buildPlannerTestInput();
    const a = buildDocumentActionPlannerInputFingerprint(input);
    const b = buildDocumentActionPlannerInputFingerprint(input);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when confirmed data changes', () => {
    const base = buildPlannerTestInput();
    const changed = buildPlannerTestInput({
      confirmedData: { ...base.confirmedData, costCents: 20000 },
    });
    expect(buildDocumentActionPlannerInputFingerprint(base)).not.toBe(
      buildDocumentActionPlannerInputFingerprint(changed),
    );
  });

  it('is insensitive to entity link ordering', () => {
    const inputA = buildPlannerTestInput({
      entityLinks: [
        { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
        { role: 'BILLING_CUSTOMER', entityType: 'CUSTOMER', entityId: 'cust-1' },
      ],
    });
    const inputB = buildPlannerTestInput({
      entityLinks: [
        { role: 'BILLING_CUSTOMER', entityType: 'CUSTOMER', entityId: 'cust-1' },
        { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
      ],
    });
    expect(buildDocumentActionPlannerInputFingerprint(inputA)).toBe(
      buildDocumentActionPlannerInputFingerprint(inputB),
    );
  });

  it('includes plausibility, flags, and capabilities in fingerprint', () => {
    const base = buildPlannerTestInput();
    const withBlocker = buildPlannerTestInput({
      plausibility: {
        overallStatus: 'BLOCKER',
        checks: [
          {
            code: 'PLATE_MISMATCH',
            status: 'BLOCKER',
            message: 'Plate mismatch',
            source: 'DOCUMENT',
          },
        ],
        recommendedHumanReviewNotes: [],
      },
    });
    const flagsOff = buildPlannerTestInput({
      featureFlags: {
        ...base.featureFlags,
        actionPreviewEnabled: false,
      },
    });
    const capsOff = buildPlannerTestInput({
      downstreamCapabilities: {
        ...base.downstreamCapabilities,
        serviceEvents: false,
      },
    });

    const baseFp = buildDocumentActionPlannerInputFingerprint(base);
    expect(buildDocumentActionPlannerInputFingerprint(withBlocker)).not.toBe(baseFp);
    expect(buildDocumentActionPlannerInputFingerprint(flagsOff)).not.toBe(baseFp);
    expect(buildDocumentActionPlannerInputFingerprint(capsOff)).not.toBe(baseFp);
  });
});
