import { BadRequestException } from '@nestjs/common';
import { validateWorkflowDefinition } from './workflow-definition.validator';
import { evaluateWorkflowConditions } from './workflow-condition.evaluator';

describe('validateWorkflowDefinition', () => {
  it('rejects ai.execute actions', () => {
    expect(() =>
      validateWorkflowDefinition({
        name: 'Bad',
        category: 'ai_permissions',
        trigger: { type: 'manual.test' },
        actions: [{ type: 'ai_execute', config: {} }],
      }),
    ).toThrow(BadRequestException);
  });

  it('forces requiresApproval on ai.suggest_action', () => {
    const result = validateWorkflowDefinition({
      name: 'AI',
      category: 'ai_permissions',
      trigger: { type: 'manual.test' },
      actions: [{ type: 'ai.suggest_action', config: { summary: 'test' } }],
    });
    expect(result.actions[0].requiresApproval).toBe(true);
  });

  it('rejects invalid vehicle status', () => {
    expect(() =>
      validateWorkflowDefinition({
        name: 'Vehicle',
        category: 'maintenance',
        trigger: { type: 'vehicle.health.critical' },
        actions: [
          {
            type: 'vehicle.status.update',
            config: { status: 'NOT_AVAILABLE' },
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts OUT_OF_SERVICE for vehicle.status.update', () => {
    const result = validateWorkflowDefinition({
      name: 'Vehicle',
      category: 'maintenance',
      trigger: { type: 'vehicle.health.critical' },
      actions: [
        {
          type: 'vehicle.status.update',
          config: { status: 'OUT_OF_SERVICE' },
        },
      ],
    });
    expect(result.actions[0].type).toBe('vehicle.status.update');
  });

  it('normalizes legacy create_task to task.create', () => {
    const result = validateWorkflowDefinition({
      name: 'Task',
      category: 'vehicle_return',
      trigger: { type: 'vehicle_returned' },
      actions: [{ type: 'create_task', config: { title: 'Check' } }],
    });
    expect(result.actions[0].type).toBe('task.create');
    expect(result.trigger.type).toBe('booking.returned');
  });
});

describe('evaluateWorkflowConditions', () => {
  it('evaluates equals on payload path', () => {
    const result = evaluateWorkflowConditions(
      [{ path: 'payload.severity', operator: 'equals', value: 'critical' }],
      { severity: 'critical' },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when condition does not match', () => {
    const result = evaluateWorkflowConditions(
      [{ field: 'overdue_days', operator: 'greater_than', value: 14 }],
      { overdueDays: 5 },
    );
    expect(result.passed).toBe(false);
  });
});
