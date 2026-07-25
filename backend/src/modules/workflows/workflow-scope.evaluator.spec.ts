import { evaluateWorkflowScope } from './workflow-scope.evaluator';
import type { WorkflowDomainEvent } from './workflow-engine.service';

const baseEvent = (overrides: Partial<WorkflowDomainEvent> = {}): WorkflowDomainEvent => ({
  organizationId: 'org-a',
  type: 'manual.test',
  payload: {},
  ...overrides,
});

describe('evaluateWorkflowScope (fail-closed)', () => {
  it('passes organization-wide scope', () => {
    const result = evaluateWorkflowScope({ type: 'organization' }, baseEvent());
    expect(result.passed).toBe(true);
  });

  it('fails vehicle scope when vehicleIds empty', () => {
    const result = evaluateWorkflowScope(
      { type: 'vehicle', vehicleIds: [] },
      baseEvent({ payload: { vehicleId: 'v-1' } }),
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('without vehicleIds');
  });

  it('fails vehicle scope when event vehicle not in list', () => {
    const result = evaluateWorkflowScope(
      { type: 'vehicle', vehicleIds: ['v-allowed'] },
      baseEvent({ payload: { vehicleId: 'v-other' } }),
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('fail-closed');
  });

  it('passes vehicle scope when event vehicle matches', () => {
    const result = evaluateWorkflowScope(
      { type: 'vehicle', vehicleIds: ['v-1', 'v-2'] },
      baseEvent({ entityType: 'vehicle', entityId: 'v-2' }),
    );
    expect(result.passed).toBe(true);
  });

  it('fails station scope when stationId missing from payload', () => {
    const result = evaluateWorkflowScope(
      { type: 'station', stationIds: ['st-1'] },
      baseEvent({ payload: {} }),
    );
    expect(result.passed).toBe(false);
  });

  it('fails unknown scope types (fail-closed)', () => {
    const result = evaluateWorkflowScope(
      { type: 'territory' as 'organization' },
      baseEvent(),
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Unsupported scope type');
  });
});
