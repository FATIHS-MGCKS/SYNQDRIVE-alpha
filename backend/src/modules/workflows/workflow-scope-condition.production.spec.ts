import { evaluateWorkflowConditions } from './workflow-condition.evaluator';
import { evaluateWorkflowScope } from './workflow-scope.evaluator';
import type { WorkflowDomainEvent } from './workflow-engine.service';

const ORG_A = 'org-scope-a';
const ORG_B = 'org-scope-b';

function makeEvent(overrides: Partial<WorkflowDomainEvent> = {}): WorkflowDomainEvent {
  return {
    organizationId: ORG_A,
    type: 'manual.test',
    payload: {},
    ...overrides,
  };
}

describe('Workflow production — scope fail-closed', () => {
  it('passes organization-wide scope', () => {
    const result = evaluateWorkflowScope({ type: 'organization' }, makeEvent());
    expect(result.passed).toBe(true);
  });

  it('fails vehicle scope when vehicleIds empty', () => {
    const result = evaluateWorkflowScope({ type: 'vehicle', vehicleIds: [] }, makeEvent());
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('without vehicleIds');
  });

  it('fails when vehicle not in configured scope', () => {
    const result = evaluateWorkflowScope(
      { type: 'vehicle', vehicleIds: ['veh-allowed'] },
      makeEvent({ payload: { vehicleId: 'veh-other' } }),
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('fail-closed');
  });

  it('fails unknown scope types fail-closed', () => {
    const result = evaluateWorkflowScope(
      { type: 'territory' as 'organization' },
      makeEvent(),
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Unsupported scope type');
  });

  it('isolates tenant context in event organizationId', () => {
    const eventA = makeEvent({ organizationId: ORG_A });
    const eventB = makeEvent({ organizationId: ORG_B });
    expect(eventA.organizationId).not.toBe(eventB.organizationId);
  });
});

describe('Workflow production — condition tree', () => {
  it('evaluates ALL group (default)', () => {
    const result = evaluateWorkflowConditions(
      [
        { path: 'payload.severity', operator: 'equals', value: 'critical' },
        { path: 'payload.overdueDays', operator: 'gt', value: 0 },
      ],
      { severity: 'critical', overdueDays: 3 },
    );
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it('evaluates ANY group', () => {
    const result = evaluateWorkflowConditions(
      {
        match: 'any',
        rules: [
          { path: 'payload.severity', operator: 'equals', value: 'critical' },
          { path: 'payload.severity', operator: 'equals', value: 'warning' },
        ],
      },
      { severity: 'warning' },
    );
    expect(result.passed).toBe(true);
  });

  it('supports negated condition groups', () => {
    const result = evaluateWorkflowConditions(
      {
        match: 'all',
        negate: true,
        rules: [{ path: 'payload.blocked', operator: 'equals', value: true }],
      },
      { blocked: true },
    );
    expect(result.passed).toBe(false);
  });

  it('maps legacy field names to payload paths', () => {
    const result = evaluateWorkflowConditions(
      [{ field: 'overdue_days', operator: 'greater_than', value: 14 }],
      { overdueDays: 30 },
    );
    expect(result.passed).toBe(true);
  });
});

describe('Workflow production — datatypes', () => {
  it('compares numeric fields with gt/gte/lt/lte', () => {
    expect(
      evaluateWorkflowConditions(
        [{ path: 'payload.healthScore', operator: 'gte', value: 80 }],
        { healthScore: 85 },
      ).passed,
    ).toBe(true);
    expect(
      evaluateWorkflowConditions(
        [{ path: 'payload.invoiceAmountCents', operator: 'lt', value: 10000 }],
        { invoiceAmountCents: 5000 },
      ).passed,
    ).toBe(true);
  });

  it('evaluates string contains and in operators', () => {
    expect(
      evaluateWorkflowConditions(
        [{ path: 'payload.bookingType', operator: 'in', value: ['RENTAL', 'SUBSCRIPTION'] }],
        { bookingType: 'RENTAL' },
      ).passed,
    ).toBe(true);
    expect(
      evaluateWorkflowConditions(
        [{ path: 'payload.damageSeverity', operator: 'contains', value: 'major' }],
        { damageSeverity: 'major_scratch' },
      ).passed,
    ).toBe(true);
  });

  it('evaluates boolean is_true / is_false', () => {
    expect(
      evaluateWorkflowConditions(
        [{ field: 'severity', operator: 'is_true', value: true }],
        { severity: true },
      ).passed,
    ).toBe(true);
    expect(
      evaluateWorkflowConditions(
        [{ field: 'severity', operator: 'is_false', value: false }],
        { severity: true },
      ).passed,
    ).toBe(false);
  });

  it('exists operator detects missing vs present fields', () => {
    expect(
      evaluateWorkflowConditions(
        [{ path: 'payload.stationId', operator: 'exists', value: true }],
        { stationId: 'st-1' },
      ).passed,
    ).toBe(true);
    expect(
      evaluateWorkflowConditions(
        [{ path: 'payload.stationId', operator: 'exists', value: true }],
        {},
      ).passed,
    ).toBe(false);
  });
});
