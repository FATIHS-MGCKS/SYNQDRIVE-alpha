import { workflowConditionEngine } from './workflow-condition-engine';
import { compareConditionValues } from './workflow-condition-clause.evaluator';
import { resolveConditionField } from './workflow-condition-field-registry';
import {
  isOperatorAllowedForType,
  normalizeConditionOperator,
  WORKFLOW_CONDITION_OPERATOR_MATRIX,
} from './workflow-condition-operators';
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('WorkflowConditionOperators', () => {
  const baseContext = {
    organizationId: ORG,
    payload: {},
    permissions: ['workflow:condition:pii'],
  };

  describe('operator matrix', () => {
    it('covers all required operators', () => {
      const operators = WORKFLOW_CONDITION_OPERATOR_MATRIX.map((entry) => entry.operator);
      expect(operators).toEqual(
        expect.arrayContaining([
          'equals',
          'notEquals',
          'greaterThan',
          'greaterThanOrEqual',
          'lessThan',
          'lessThanOrEqual',
          'in',
          'notIn',
          'exists',
          'notExists',
          'contains',
          'startsWith',
          'endsWith',
          'changedFrom',
          'changedTo',
          'durationExceeded',
          'withinTimeWindow',
          'before',
          'after',
          'between',
        ]),
      );
    });

    it('normalizes legacy aliases', () => {
      expect(normalizeConditionOperator('gt')).toBe('greaterThan');
      expect(normalizeConditionOperator('GTE')).toBe('greaterThanOrEqual');
      expect(normalizeConditionOperator('greater_than')).toBe('greaterThan');
      expect(normalizeConditionOperator('NOT_EXISTS')).toBe('notExists');
    });

    it('rejects regex operators', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'payload.bookingId', operator: 'regex', value: '.*' }],
        baseContext,
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.REGEX_NOT_ALLOWED);
    });
  });

  describe('comparison operators', () => {
    it('evaluates greaterThan alias gt', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupDelayMinutes', operator: 'gt', value: 10 }],
        { ...baseContext, payload: { booking: { pickupDelayMinutes: 15 } } },
      );
      expect(result.passed).toBe(true);
      expect(result.results[0].operator).toBe('greaterThan');
    });

    it('evaluates lessThanOrEqual', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupDelayMinutes', operator: 'lessThanOrEqual', value: 45 }],
        { ...baseContext, payload: { booking: { pickupDelayMinutes: 45 } } },
      );
      expect(result.passed).toBe(true);
    });

    it('rejects greaterThan on string fields', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'payload.bookingId', operator: 'greaterThan', value: 'A' }],
        { ...baseContext, payload: { bookingId: 'BK-1' } },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.OPERATOR_INCOMPATIBLE);
    });
  });

  describe('exists / notExists', () => {
    it('exists passes for present values', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'payload.bookingId', operator: 'exists' }],
        { ...baseContext, payload: { bookingId: 'BK-1' } },
      );
      expect(result.passed).toBe(true);
    });

    it('notExists passes for null', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'payload.bookingId', operator: 'notExists' }],
        baseContext,
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('string operators', () => {
    it('endsWith is case-sensitive', () => {
      const pass = workflowConditionEngine.evaluate(
        [{ fieldPath: 'payload.bookingId', operator: 'endsWith', value: '-EU' }],
        { ...baseContext, payload: { bookingId: 'BK-EU' } },
      );
      const fail = workflowConditionEngine.evaluate(
        [{ fieldPath: 'payload.bookingId', operator: 'endsWith', value: '-eu' }],
        { ...baseContext, payload: { bookingId: 'BK-EU' } },
      );
      expect(pass.passed).toBe(true);
      expect(fail.passed).toBe(false);
    });

    it('contains distinguishes string vs array', () => {
      const field = resolveConditionField('payload.bookingId')!;
      expect(
        compareConditionValues(field, 'contains', 'BK-123', 'BK', undefined),
      ).toBe(true);
      expect(isOperatorAllowedForType('array', 'contains')).toBe(true);
    });
  });

  describe('in / notIn empty arrays', () => {
    it('in [] is always false', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'in', value: [] }],
        { ...baseContext, payload: { booking: { status: 'CONFIRMED' } } },
      );
      expect(result.passed).toBe(false);
    });

    it('notIn [] is always true', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'notIn', value: [] }],
        { ...baseContext, payload: { booking: { status: 'CONFIRMED' } } },
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('decimal comparisons', () => {
    it('avoids floating-point drift', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'invoice.amountDue', operator: 'equals', value: '10.30' }],
        { ...baseContext, payload: { invoice: { amountDue: '10.30' } } },
      );
      expect(result.passed).toBe(true);
    });

    it('between works for decimal bounds', () => {
      const result = workflowConditionEngine.evaluate(
        [
          {
            fieldPath: 'invoice.amountDue',
            operator: 'between',
            value: { from: 10.0, to: 20.0 },
          },
        ],
        { ...baseContext, payload: { invoice: { amountDue: '15.50' } } },
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('datetime UTC operators', () => {
    const payload = { booking: { pickupAt: '2026-07-25T12:00:00Z' } };

    it('before compares in UTC', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupAt', operator: 'before', value: '2026-07-25T13:00:00Z' }],
        { ...baseContext, payload },
      );
      expect(result.passed).toBe(true);
    });

    it('after compares in UTC', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupAt', operator: 'after', value: '2026-07-25T11:00:00Z' }],
        { ...baseContext, payload },
      );
      expect(result.passed).toBe(true);
    });

    it('between is inclusive on UTC bounds', () => {
      const result = workflowConditionEngine.evaluate(
        [
          {
            fieldPath: 'booking.pickupAt',
            operator: 'between',
            value: {
              from: '2026-07-25T12:00:00Z',
              to: '2026-07-25T12:00:00Z',
            },
          },
        ],
        { ...baseContext, payload },
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('changedFrom / changedTo', () => {
    it('changedTo detects transition', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'changedTo', value: 'CONFIRMED' }],
        {
          ...baseContext,
          payload: { booking: { status: 'CONFIRMED' } },
          previous: { 'booking.status': 'PENDING' },
        },
      );
      expect(result.passed).toBe(true);
    });

    it('changedFrom detects departure', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'changedFrom', value: 'PENDING' }],
        {
          ...baseContext,
          payload: { booking: { status: 'CONFIRMED' } },
          previous: { 'booking.status': 'PENDING' },
        },
      );
      expect(result.passed).toBe(true);
    });

    it('fails when previous context is missing', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.status', operator: 'changedTo', value: 'CONFIRMED' }],
        { ...baseContext, payload: { booking: { status: 'CONFIRMED' } } },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.CHANGE_CONTEXT_MISSING);
    });
  });

  describe('durationExceeded', () => {
    it('uses evaluatedAtUtc anchor in UTC', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupAt', operator: 'durationExceeded', value: { minutes: 30 } }],
        {
          ...baseContext,
          payload: { booking: { pickupAt: '2026-07-25T10:00:00Z' } },
          evaluatedAtUtc: '2026-07-25T11:00:00Z',
        },
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('withinTimeWindow with DST', () => {
    it('evaluates local window in Europe/Berlin including DST offset', () => {
      const result = workflowConditionEngine.evaluate(
        [
          {
            fieldPath: 'booking.pickupAt',
            operator: 'withinTimeWindow',
            value: { start: '10:00', end: '14:00' },
          },
        ],
        {
          ...baseContext,
          payload: { booking: { pickupAt: '2026-07-25T10:30:00Z' } },
          timezone: 'Europe/Berlin',
        },
      );
      expect(result.passed).toBe(true);
    });

    it('requires explicit timezone context', () => {
      const result = workflowConditionEngine.evaluate(
        [
          {
            fieldPath: 'booking.pickupAt',
            operator: 'withinTimeWindow',
            value: { start: '09:00', end: '17:00' },
          },
        ],
        { ...baseContext, payload: { booking: { pickupAt: '2026-07-25T10:00:00Z' } } },
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.TIMEZONE_REQUIRED);
    });
  });

  describe('dry-run explain', () => {
    it('includes operator and masked normalized values', () => {
      const result = workflowConditionEngine.explain(
        [{ fieldPath: 'booking.pickupDelayMinutes', operator: 'greaterThanOrEqual', value: 30 }],
        { ...baseContext, payload: { booking: { pickupDelayMinutes: 45 } } },
      );
      expect(result.results[0].explain).toContain('greaterThanOrEqual');
      expect(result.results[0].explain).toContain('[integer]');
      expect(result.results[0].maskedActual).toBe('[integer]');
    });
  });

  describe('null boundaries', () => {
    it('rejects null actual for equals', () => {
      const result = workflowConditionEngine.evaluate(
        [{ fieldPath: 'booking.pickupDelayMinutes', operator: 'equals', value: 5 }],
        baseContext,
      );
      expect(result.results[0].errorCode).toBe(WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID);
    });
  });
});
