import {
  buildDocumentActionIdempotencyKey,
  isOptionalDocumentActionRequirement,
  isRequiredDocumentActionRequirement,
  partitionDocumentActionsByRequirement,
} from './document-action.idempotency';

describe('document-action.idempotency', () => {
  const base = {
    organizationId: 'org-1',
    extractionId: 'ext-1',
    actionPlanId: 'plan-1',
    actionType: 'CREATE_INVOICE' as const,
    sequence: 1,
    targetEntityType: 'VEHICLE' as const,
    targetEntityId: 'veh-1',
  };

  it('builds stable idempotency keys for the same identity', () => {
    const first = buildDocumentActionIdempotencyKey(base);
    const second = buildDocumentActionIdempotencyKey({ ...base });
    expect(first).toHaveLength(64);
    expect(second).toBe(first);
  });

  it('changes idempotency key when action type or sequence changes', () => {
    const baseline = buildDocumentActionIdempotencyKey(base);
    const otherType = buildDocumentActionIdempotencyKey({
      ...base,
      actionType: 'CREATE_FINE',
    });
    const otherSequence = buildDocumentActionIdempotencyKey({
      ...base,
      sequence: 2,
    });

    expect(otherType).not.toBe(baseline);
    expect(otherSequence).not.toBe(baseline);
  });

  it('separates required/blocker from optional/informational actions', () => {
    expect(isRequiredDocumentActionRequirement('REQUIRED')).toBe(true);
    expect(isRequiredDocumentActionRequirement('BLOCKER')).toBe(true);
    expect(isOptionalDocumentActionRequirement('OPTIONAL')).toBe(true);
    expect(isOptionalDocumentActionRequirement('INFORMATIONAL')).toBe(true);

    const partitioned = partitionDocumentActionsByRequirement([
      { requirement: 'REQUIRED' },
      { requirement: 'OPTIONAL' },
      { requirement: 'BLOCKER' },
      { requirement: 'INFORMATIONAL' },
    ]);

    expect(partitioned.required).toHaveLength(2);
    expect(partitioned.optional).toHaveLength(2);
  });
});
