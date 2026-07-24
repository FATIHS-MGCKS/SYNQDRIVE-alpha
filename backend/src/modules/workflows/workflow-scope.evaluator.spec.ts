import { BadRequestException, NotFoundException } from '@nestjs/common';
import { evaluateWorkflowScope } from './workflow-scope.evaluator';
import type { WorkflowDomainEvent } from './workflow-engine.service';

const ORG = 'org-a';

function event(overrides: Partial<WorkflowDomainEvent> = {}): WorkflowDomainEvent {
  return {
    organizationId: ORG,
    type: 'manual.test',
    payload: {},
    ...overrides,
  };
}

describe('evaluateWorkflowScope', () => {
  it('passes organization scope', () => {
    const result = evaluateWorkflowScope({ type: 'organization' }, event());
    expect(result.passed).toBe(true);
  });

  it('fails vehicle scope without vehicleIds', () => {
    const result = evaluateWorkflowScope({ type: 'vehicle', vehicleIds: [] }, event());
    expect(result.passed).toBe(false);
  });

  it('fails station scope without stationIds', () => {
    const result = evaluateWorkflowScope({ type: 'station', stationIds: [] }, event());
    expect(result.passed).toBe(false);
  });

  it('fails unknown scope types', () => {
    const result = evaluateWorkflowScope({ type: 'territory' }, event());
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Unsupported');
  });

  it('fails fleet scope (not implemented)', () => {
    const result = evaluateWorkflowScope({ type: 'fleet', vehicleIds: ['v1'] }, event());
    expect(result.passed).toBe(false);
  });

  it('matches booking scope only when bookingId is in list', () => {
    const pass = evaluateWorkflowScope(
      { type: 'booking', bookingIds: ['b-1'] },
      event({ entityType: 'booking', entityId: 'b-1' }),
    );
    const fail = evaluateWorkflowScope(
      { type: 'booking', bookingIds: ['b-1'] },
      event({ entityType: 'booking', entityId: 'b-foreign' }),
    );
    expect(pass.passed).toBe(true);
    expect(fail.passed).toBe(false);
    expect(fail.details).toBeUndefined();
  });

  it('matches customer scope only when customerId is in list', () => {
    const pass = evaluateWorkflowScope(
      { type: 'customer', customerIds: ['c-1'] },
      event({ payload: { customerId: 'c-1' } }),
    );
    const fail = evaluateWorkflowScope(
      { type: 'customer', customerIds: ['c-1'] },
      event({ payload: { customerId: 'c-foreign' } }),
    );
    expect(pass.passed).toBe(true);
    expect(fail.passed).toBe(false);
  });
});
