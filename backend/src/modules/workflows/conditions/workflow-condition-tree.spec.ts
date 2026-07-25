import { workflowConditionTreeEngine } from './workflow-condition-tree.engine';
import { validateConditionTree } from './workflow-condition-tree.validator';
import {
  migrateLegacyConditionList,
  wrapTopLevelGroups,
} from './workflow-condition-legacy.migrator';
import { WORKFLOW_CONDITION_LIMITS } from './workflow-condition.config';
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type { WorkflowConditionGroupNode } from './workflow-condition.types';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('WorkflowConditionTreeEngine', () => {
  const baseContext = {
    organizationId: ORG_A,
    payload: {},
    permissions: ['workflow:condition:pii'],
  };

  const examplePayload = {
    booking: {
      pickupDelayMinutes: 45,
      status: 'CONFIRMED',
      cancelled: false,
    },
    customer: {
      contact: {
        whatsappAllowed: true,
        phoneAllowed: false,
      },
    },
  };

  function clause(
    fieldPath: string,
    operator: string,
    value?: unknown,
    sortOrder = 0,
  ) {
    return { kind: 'clause' as const, fieldPath, operator, value, sortOrder };
  }

  function group(
    logic: 'ALL' | 'ANY' | 'NOT',
    children: WorkflowConditionGroupNode['children'],
    sortOrder = 0,
  ): WorkflowConditionGroupNode {
    return { kind: 'group', logic, children, sortOrder };
  }

  describe('ALL group', () => {
    it('passes when all clauses pass', () => {
      const tree = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 30),
        clause('booking.status', 'in', ['CONFIRMED', 'READY_FOR_PICKUP']),
      ]);
      const result = workflowConditionTreeEngine.evaluateTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });
      expect(result.passed).toBe(true);
      expect(result.root?.logic).toBe('ALL');
      expect(result.clauseCount).toBe(2);
    });

    it('fails when any clause fails', () => {
      const tree = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 30),
        clause('booking.status', 'equals', 'CANCELLED'),
      ]);
      const result = workflowConditionTreeEngine.evaluateTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });
      expect(result.passed).toBe(false);
      expect(result.root?.children).toHaveLength(2);
    });
  });

  describe('ANY group', () => {
    it('passes when at least one child passes', () => {
      const tree = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 30),
        group('ANY', [
          clause('customer.contact.whatsappAllowed', 'is_true'),
          clause('customer.contact.phoneAllowed', 'is_true'),
        ]),
      ]);
      const result = workflowConditionTreeEngine.evaluateTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });
      expect(result.passed).toBe(true);
      const anyGroup = result.root?.children.find((c) => c.kind === 'group');
      expect(anyGroup?.kind).toBe('group');
      if (anyGroup?.kind === 'group') {
        expect(anyGroup.logic).toBe('ANY');
        expect(anyGroup.passed).toBe(true);
      }
    });
  });

  describe('NOT group', () => {
    it('inverts child result', () => {
      const tree = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 30),
        group('NOT', [clause('booking.cancelled', 'is_true')]),
      ]);
      const result = workflowConditionTreeEngine.evaluateTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });
      expect(result.passed).toBe(true);
      const notGroup = result.root?.children.find(
        (c) => c.kind === 'group' && c.logic === 'NOT',
      );
      expect(notGroup?.passed).toBe(true);
    });
  });

  describe('nested example tree', () => {
    it('evaluates the prompt example deterministically', () => {
      const tree = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 30, 0),
        clause('booking.status', 'in', ['CONFIRMED', 'READY_FOR_PICKUP'], 1),
        group('ANY', [
          clause('customer.contact.whatsappAllowed', 'is_true', undefined, 0),
          clause('customer.contact.phoneAllowed', 'is_true', undefined, 1),
        ], 2),
        group('NOT', [clause('booking.cancelled', 'is_true', undefined, 0)], 3),
      ]);

      const first = workflowConditionTreeEngine.evaluateTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });
      const second = workflowConditionTreeEngine.evaluateTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });

      expect(first.passed).toBe(true);
      expect(JSON.stringify(first.root)).toBe(JSON.stringify(second.root));
    });
  });

  describe('deep nesting', () => {
    it('evaluates nested groups up to max depth', () => {
      let current: WorkflowConditionGroupNode = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 1),
      ]);
      for (let depth = 2; depth < WORKFLOW_CONDITION_LIMITS.maxTreeDepth; depth += 1) {
        current = group('ALL', [current]);
      }
      const result = workflowConditionTreeEngine.evaluateTree(current, {
        ...baseContext,
        payload: examplePayload,
      });
      expect(result.passed).toBe(true);
    });

    it('rejects trees exceeding max depth', () => {
      let current: WorkflowConditionGroupNode = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 1),
      ]);
      for (let depth = 2; depth <= WORKFLOW_CONDITION_LIMITS.maxTreeDepth + 1; depth += 1) {
        current = group('ALL', [current]);
      }
      const validation = validateConditionTree(current);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === WORKFLOW_CONDITION_ERROR_CODES.TREE_DEPTH_EXCEEDED)).toBe(true);
    });
  });

  describe('empty group', () => {
    it('treats empty ALL as passed', () => {
      const tree = group('ALL', []);
      const result = workflowConditionTreeEngine.evaluateTree(tree, baseContext);
      expect(result.passed).toBe(true);
    });

    it('treats empty ANY as failed', () => {
      const tree = group('ANY', []);
      const validation = validateConditionTree(tree);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]?.code).toBe(WORKFLOW_CONDITION_ERROR_CODES.GROUP_EMPTY);
    });
  });

  describe('invalid structure', () => {
    it('rejects NOT with multiple children', () => {
      const tree = group('NOT', [
        clause('booking.cancelled', 'is_true'),
        clause('booking.status', 'equals', 'CONFIRMED'),
      ]);
      const validation = validateConditionTree(tree);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === WORKFLOW_CONDITION_ERROR_CODES.NOT_CHILD_COUNT)).toBe(true);
    });
  });

  describe('legacy migration', () => {
    it('migrates flat AND list to ALL root group', () => {
      const tree = migrateLegacyConditionList([
        { path: 'booking.pickupDelayMinutes', operator: 'gte', value: 30 },
        { path: 'booking.status', operator: 'equals', value: 'CONFIRMED' },
      ]);
      expect(tree.logic).toBe('ALL');
      expect(tree.children).toHaveLength(2);
      const result = workflowConditionTreeEngine.evaluateTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });
      expect(result.passed).toBe(true);
    });

    it('wraps multiple top-level groups under ALL', () => {
      const wrapped = wrapTopLevelGroups([
        group('ANY', [clause('customer.contact.whatsappAllowed', 'is_true')]),
        group('NOT', [clause('booking.cancelled', 'is_true')]),
      ]);
      expect(wrapped.logic).toBe('ALL');
      expect(wrapped.children).toHaveLength(2);
    });
  });

  describe('masked values', () => {
    it('includes masked actual and expected in dry-run clause results', () => {
      const tree = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 30),
      ]);
      const result = workflowConditionTreeEngine.explainTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });
      const clauseResult = result.root?.children[0];
      expect(clauseResult?.kind).toBe('clause');
      if (clauseResult?.kind === 'clause') {
        expect(clauseResult.maskedActual).toBe('[integer]');
        expect(clauseResult.expectedValue).toBe('[integer]');
        expect(clauseResult.explain).toContain('[integer]');
        expect(clauseResult.explain).not.toContain('45');
      }
    });
  });

  describe('deterministic results', () => {
    it('evaluates children in sortOrder', () => {
      const tree = group('ALL', [
        clause('booking.pickupDelayMinutes', 'gte', 30, 2),
        clause('booking.status', 'in', ['CONFIRMED'], 1),
      ]);
      const result = workflowConditionTreeEngine.evaluateTree(tree, {
        ...baseContext,
        payload: examplePayload,
      });
      expect(result.root?.children[0]?.kind).toBe('clause');
      if (result.root?.children[0]?.kind === 'clause') {
        expect(result.root.children[0].fieldPath).toBe('booking.status');
      }
    });
  });

  describe('clause limits', () => {
    it('rejects workflows exceeding max clause count', () => {
      const children = Array.from({ length: WORKFLOW_CONDITION_LIMITS.maxClauseCount + 1 }, (_, i) =>
        clause('booking.pickupDelayMinutes', 'gte', 1, i),
      );
      const tree = group('ALL', children);
      const validation = validateConditionTree(tree);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === WORKFLOW_CONDITION_ERROR_CODES.CLAUSE_COUNT_EXCEEDED)).toBe(true);
    });
  });
});
