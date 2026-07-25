import { workflowConditionEngine } from './workflow-condition-engine';
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('WorkflowConditionEngine', () => {
  const baseContext = {
    organizationId: ORG_A,
    payload: {},
    permissions: ['workflow:condition:pii'],
  };

  describe('boolean', () => {
    it('evaluates is_true', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'customer.contact.whatsappAllowed', operator: 'is_true' }],
        {
          ...baseContext,
          payload: { customer: { contact: { whatsappAllowed: true } } },
        },
      );
      expect(result.passed).toBe(true);
    });

    it('rejects invalid boolean actual', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'customer.contact.whatsappAllowed', operator: 'equals', value: true }],
        {
          ...baseContext,
          payload: { customer: { contact: { whatsappAllowed: 'yes' } } },
        },
      );
      expect(result.passed).toBe(false);
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID);
    });
  });

  describe('integer', () => {
    it('evaluates gt without silent coercion', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupDelayMinutes', operator: 'gt', value: 10 }],
        {
          ...baseContext,
          payload: { booking: { pickupDelayMinutes: 15 } },
        },
      );
      expect(result.passed).toBe(true);
    });

    it('rejects non-integer string for integer field', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupDelayMinutes', operator: 'equals', value: 5 }],
        {
          ...baseContext,
          payload: { booking: { pickupDelayMinutes: 'abc' } },
        },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID);
    });
  });

  describe('decimal', () => {
    it('compares decimal values strictly', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'invoice.amountDue', operator: 'gte', value: '10.50' }],
        {
          ...baseContext,
          payload: { invoice: { amountDue: '12.00' } },
        },
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('datetime', () => {
    it('evaluates ISO datetime comparison locale-independently', () => {
      const result = workflowConditionEngine.evaluate(
        [
          {
            fieldPath: 'booking.pickupAt',
            operator: 'gt',
            value: '2026-07-25T08:00:00.000Z',
          },
        ],
        {
          ...baseContext,
          payload: { booking: { pickupAt: '2026-07-25T10:00:00.000Z' } },
        },
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('enum', () => {
    it('evaluates enum equals', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'equals', value: 'ACTIVE' }],
        {
          ...baseContext,
          payload: { booking: { status: 'ACTIVE' } },
        },
      );
      expect(result.passed).toBe(true);
    });

    it('rejects invalid enum value', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'task.status', operator: 'equals', value: 'UNKNOWN' }],
        {
          ...baseContext,
          payload: { task: { status: 'OPEN' } },
        },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID);
    });
  });

  describe('string', () => {
    it('evaluates contains', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'payload.bookingId', operator: 'equals', value: 'booking-1' }],
        { ...baseContext, payload: { bookingId: 'booking-1' } },
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('array', () => {
    it('rejects non-array for in operator on enum', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'in', value: 'ACTIVE' }],
        { ...baseContext, payload: { booking: { status: 'ACTIVE' } } },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID);
    });
  });

  describe('null and undefined', () => {
    it('fails equals on null actual', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'equals', value: 'ACTIVE' }],
        { ...baseContext, payload: { booking: { status: null } } },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID);
    });

    it('supports exists operator for undefined', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'exists' }],
        { ...baseContext, payload: { booking: {} } },
      );
      expect(result.passed).toBe(false);
      expect(result.results[0].passed).toBe(false);
    });
  });

  describe('NaN', () => {
    it('rejects NaN integer actual', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupDelayMinutes', operator: 'gt', value: 1 }],
        {
          ...baseContext,
          payload: { booking: { pickupDelayMinutes: Number.NaN } },
        },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID);
    });
  });

  describe('unknown field', () => {
    it('returns CONDITION_FIELD_UNSUPPORTED', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.secretField', operator: 'equals', value: 'x' }],
        baseContext,
      );
      expect(result.results[0].errorCode).toBe(
        WORKFLOW_CONDITION_ERROR_CODES.FIELD_UNSUPPORTED,
      );
    });
  });

  describe('wrong operator', () => {
    it('returns CONDITION_OPERATOR_INCOMPATIBLE for gt on boolean', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'customer.contact.whatsappAllowed', operator: 'gt', value: 1 }],
        {
          ...baseContext,
          payload: { customer: { contact: { whatsappAllowed: true } } },
        },
      );
      expect(result.results[0].errorCode).toBe(
        WORKFLOW_CONDITION_ERROR_CODES.OPERATOR_INCOMPATIBLE,
      );
    });
  });

  describe('sensitive fields', () => {
    it('denies PII field without permission', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'customer.contact.whatsappAllowed', operator: 'is_true' }],
        {
          organizationId: ORG_A,
          permissions: [],
          payload: { customer: { contact: { whatsappAllowed: true } } },
        },
      );
      expect(result.results[0].errorCode).toBe(
        WORKFLOW_CONDITION_ERROR_CODES.SENSITIVE_FIELD_DENIED,
      );
    });
  });

  describe('cross-tenant', () => {
    it('denies payload from another organization', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'equals', value: 'ACTIVE' }],
        {
          organizationId: ORG_A,
          payload: { organizationId: ORG_B, booking: { status: 'ACTIVE' } },
        },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.TENANT_VIOLATION);
    });
  });

  describe('dry run explain', () => {
    it('returns explain without leaking PII values', () => {
      const result = workflowConditionEngine.explain(
        [{ fieldPath: 'customer.contact.whatsappAllowed', operator: 'equals', value: true }],
        {
          ...baseContext,
          payload: { customer: { contact: { whatsappAllowed: false } } },
        },
      );
      expect(result.dryRun).toBe(true);
      expect(result.results[0].explain).toContain('customer.contact.whatsappAllowed');
      expect(result.results[0].explain).toMatch(/actual=\[boolean\]/);
    });
  });

  describe('legacy adapter', () => {
    it('supports legacy overdue_days field via registry', () => {
      const { evaluateWorkflowConditions } = require('../workflow-condition.evaluator');
      const result = evaluateWorkflowConditions(
        [{ field: 'overdue_days', operator: 'greater_than', value: 14 }],
        { overdueDays: 20 },
        { organizationId: ORG_A },
      );
      expect(result.passed).toBe(true);
    });
  });
});
