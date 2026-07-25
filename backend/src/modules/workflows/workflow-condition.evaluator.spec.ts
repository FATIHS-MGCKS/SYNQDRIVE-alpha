import { evaluateWorkflowConditions, resolveConditionGroup } from './workflow-condition.evaluator';

describe('resolveConditionGroup', () => {
  it('treats bare array as ALL match', () => {
    expect(resolveConditionGroup([{ field: 'health_score', operator: 'gt', value: 50 }])).toEqual({
      match: 'all',
      negate: false,
      rules: [{ field: 'health_score', operator: 'gt', value: 50 }],
    });
  });

  it('supports ANY groups with negate', () => {
    const group = resolveConditionGroup({
      match: 'any',
      negate: true,
      rules: [{ field: 'severity', operator: 'equals', value: 'low' }],
    });
    expect(group.match).toBe('any');
    expect(group.negate).toBe(true);
  });
});

describe('evaluateWorkflowConditions (condition tree)', () => {
  const payload = {
    vehicleStatus: 'NEEDS_CLEANING',
    healthScore: 42,
    overdueDays: 5,
    invoiceAmountCents: 15000,
    active: true,
    tags: ['fleet'],
  };

  it('evaluates string equals and notEquals', () => {
    const pass = evaluateWorkflowConditions(
      [{ field: 'vehicle_status', operator: 'equals', value: 'NEEDS_CLEANING' }],
      payload,
    );
    expect(pass.passed).toBe(true);

    const fail = evaluateWorkflowConditions(
      [{ field: 'vehicle_status', operator: 'notEquals', value: 'NEEDS_CLEANING' }],
      payload,
    );
    expect(fail.passed).toBe(false);
  });

  it('evaluates numeric comparisons and exists', () => {
    const gt = evaluateWorkflowConditions(
      [{ field: 'health_score', operator: 'gt', value: 40 }],
      payload,
    );
    expect(gt.passed).toBe(true);

    const missing = evaluateWorkflowConditions(
      [{ field: 'damage_severity', operator: 'exists' }],
      payload,
    );
    expect(missing.passed).toBe(false);
  });

  it('evaluates ALL logic (default)', () => {
    const result = evaluateWorkflowConditions(
      [
        { field: 'overdue_days', operator: 'gte', value: 3 },
        { field: 'invoice_amount', operator: 'lt', value: 20000 },
      ],
      payload,
    );
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it('evaluates ANY logic', () => {
    const result = evaluateWorkflowConditions(
      {
        match: 'any',
        rules: [
          { field: 'health_score', operator: 'lt', value: 10 },
          { field: 'overdue_days', operator: 'gte', value: 1 },
        ],
      },
      payload,
    );
    expect(result.passed).toBe(true);
  });

  it('supports NOT via negate on group', () => {
    const result = evaluateWorkflowConditions(
      {
        match: 'all',
        negate: true,
        rules: [{ field: 'vehicle_status', operator: 'equals', value: 'NEEDS_CLEANING' }],
      },
      payload,
    );
    expect(result.passed).toBe(false);
  });

  it('supports legacy operators is_true / is_false', () => {
    const t = evaluateWorkflowConditions(
      [{ field: 'active', operator: 'is_true' }],
      payload,
    );
    expect(t.passed).toBe(true);
  });

  it('supports in / notIn and contains', () => {
    const inResult = evaluateWorkflowConditions(
      [{ field: 'vehicle_status', operator: 'in', value: ['NEEDS_CLEANING', 'AVAILABLE'] }],
      payload,
    );
    expect(inResult.passed).toBe(true);

    const contains = evaluateWorkflowConditions(
      [{ field: 'tags', operator: 'contains', value: 'fleet' }],
      { tags: 'fleet-vehicle' },
    );
    expect(contains.passed).toBe(true);
  });
});
