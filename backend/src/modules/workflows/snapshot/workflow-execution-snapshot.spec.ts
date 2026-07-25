import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  buildConditionTree,
  buildExecutionSnapshotPayload,
  buildPolicySnapshotBlock,
  computeExecutionSnapshotHash,
} from './workflow-execution-snapshot.builder';
import { WorkflowExecutionSnapshotRepository } from './workflow-execution-snapshot.repository';
import { WorkflowExecutionSnapshotService } from './workflow-execution-snapshot.service';
import { WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES } from './workflow-execution-snapshot.errors';
import {
  containsSecretKeys,
  minimizeEventPayload,
  stripSecretsFromValue,
} from './workflow-execution-snapshot.sanitize';

const ORG = 'org-1';
const RUN_ID = 'run-1';
const DEF_ID = 'def-1';
const VER_ID = 'ver-1';

function makeVersionGraph(overrides: Record<string, unknown> = {}) {
  return {
    id: VER_ID,
    organizationId: ORG,
    workflowDefinitionId: DEF_ID,
    versionNumber: 2,
    status: 'ACTIVE',
    contentHash: 'version-hash-v2',
    publishedAt: new Date('2026-07-20T10:00:00.000Z'),
    definition: {
      id: DEF_ID,
      name: 'Return workflow',
      category: 'vehicle_return',
    },
    trigger: { triggerType: 'booking.returned', config: {} },
    scope: {
      scopeType: 'ORGANIZATION',
      bindings: [],
    },
    conditionGroups: [
      {
        id: 'grp-1',
        parentGroupId: null,
        logicOperator: 'AND',
        sortOrder: 0,
        conditions: [
          {
            fieldPath: 'payload.severity',
            operator: 'EQUALS',
            valueText: 'critical',
            valueNumber: null,
            valueBoolean: null,
            valueJson: null,
            sortOrder: 0,
          },
        ],
      },
    ],
    actions: [
      {
        actionKey: 'action-key-1',
        actionIndex: 0,
        actionType: 'task.create',
        requiresApproval: false,
        capabilityStatusAtPublish: 'AVAILABLE',
        config: {
          title: 'Inspect vehicle',
          templateId: 'tpl-return-v2',
          templateVersion: '2.1.0',
        },
      },
      {
        actionKey: 'action-key-2',
        actionIndex: 1,
        actionType: 'notification.prepare',
        requiresApproval: false,
        capabilityStatusAtPublish: 'AVAILABLE',
        config: {
          notificationTemplateId: 'notify-v1',
          templateVersion: '1.0.0',
        },
      },
    ],
    ...overrides,
  };
}

function baseCaptureInput() {
  return {
    organizationId: ORG,
    workflowRunId: RUN_ID,
    workflowDefinitionId: DEF_ID,
    workflowVersionId: VER_ID,
    policySnapshotId: 'policy-1',
    event: {
      eventType: 'booking.returned',
      entityType: 'BOOKING',
      entityId: 'booking-1',
      occurredAt: '2026-07-26T10:00:00.000Z',
      idempotencyKey: 'idem-1',
    },
    rawEventPayload: { severity: 'critical' },
    policies: buildPolicySnapshotBlock({
      policySnapshotId: 'policy-1',
      capabilityRevision: '2026-07-26',
      contentHash: 'policy-hash',
      approvalResumeSupported: false,
      approvalTtlHours: 72,
      approvalRequiredActionTypes: [],
      featureFlags: [],
    }),
  };
}

describe('workflow-execution-snapshot sanitizer', () => {
  it('strips provider secrets from configs', () => {
    const sanitized = stripSecretsFromValue({
      apiKey: 'secret-value',
      title: 'Task',
    }) as Record<string, unknown>;
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.title).toBe('Task');
    expect(containsSecretKeys({ webhookSecret: 'x' })).toBe('webhookSecret');
  });

  it('minimizes PII using entity references when available', () => {
    const result = minimizeEventPayload(
      {
        email: 'driver@example.com',
        severity: 'critical',
      },
      { entityType: 'BOOKING', entityId: 'booking-1' },
    );
    expect(result.payloadRef).toEqual({
      kind: 'entity',
      entityType: 'BOOKING',
      entityId: 'booking-1',
    });
    expect(result.minimizedPayload.email).toEqual({
      ref: { entityType: 'BOOKING', entityId: 'booking-1' },
    });
    expect(result.minimizedPayload.severity).toBe('critical');
  });
});

describe('workflow-execution-snapshot builder', () => {
  it('builds full snapshot with stable action keys and template versions', () => {
    const payload = buildExecutionSnapshotPayload(makeVersionGraph() as never, baseCaptureInput());

    expect(payload.definition.versionNumber).toBe(2);
    expect(payload.graph.actions[0].actionKey).toBe('action-key-1');
    expect(payload.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateId: 'tpl-return-v2', templateVersion: '2.1.0' }),
        expect.objectContaining({ templateId: 'notify-v1', templateVersion: '1.0.0' }),
      ]),
    );
    expect(containsSecretKeys(payload)).toBeNull();
    expect(computeExecutionSnapshotHash(payload)).toHaveLength(64);
  });

  it('preserves historical snapshot when workflow version changes later', () => {
    const original = buildExecutionSnapshotPayload(makeVersionGraph() as never, baseCaptureInput());
    const changedGraph = makeVersionGraph({
      versionNumber: 5,
      actions: [
        {
          actionKey: 'new-action',
          actionIndex: 0,
          actionType: 'alert.create',
          requiresApproval: false,
          capabilityStatusAtPublish: 'AVAILABLE',
          config: { templateId: 'tpl-v9', templateVersion: '9.0.0' },
        },
      ],
    });
    const rebuilt = buildExecutionSnapshotPayload(changedGraph as never, baseCaptureInput());

    expect(original.definition.versionNumber).toBe(2);
    expect(rebuilt.definition.versionNumber).toBe(5);
    expect(original.graph.actions[0].actionKey).toBe('action-key-1');
    expect(rebuilt.graph.actions[0].actionKey).toBe('new-action');
    expect(original.templates[0].templateVersion).toBe('2.1.0');
    expect(rebuilt.templates[0].templateVersion).toBe('9.0.0');
  });

  it('builds nested condition tree', () => {
    const tree = buildConditionTree([
      {
        id: 'root',
        parentGroupId: null,
        logicOperator: 'AND',
        sortOrder: 0,
        conditions: [
          {
            fieldPath: 'payload.severity',
            operator: 'EQUALS',
            valueText: 'critical',
            valueNumber: null,
            valueBoolean: null,
            valueJson: null,
            sortOrder: 0,
          },
        ],
      },
      {
        id: 'child',
        parentGroupId: 'root',
        logicOperator: 'OR',
        sortOrder: 1,
        conditions: [],
      },
    ] as never);
    expect(tree).toHaveLength(1);
    expect(tree[0].childGroups).toHaveLength(1);
  });

  it('rejects action configs containing secret-like keys', () => {
    const graph = makeVersionGraph({
      actions: [
        {
          actionKey: 'bad',
          actionIndex: 0,
          actionType: 'task.create',
          requiresApproval: false,
          capabilityStatusAtPublish: 'AVAILABLE',
          config: { apiKey: 'leak' },
        },
      ],
    });
    expect(() =>
      buildExecutionSnapshotPayload(graph as never, baseCaptureInput()),
    ).toThrow(/Secret-like key/);
  });
});

describe('WorkflowExecutionSnapshotService', () => {
  it('requires audit-read role for snapshot access', async () => {
    const prisma = {
      workflowExecutionSnapshot: { findFirst: jest.fn() },
    };
    const repo = new WorkflowExecutionSnapshotRepository(prisma as never);
    const service = new WorkflowExecutionSnapshotService(prisma as never, repo);

    await expect(
      service.getSnapshotForAudit(ORG, RUN_ID, ['VIEWER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks cross-tenant snapshot reads', async () => {
    const prisma = {
      workflowExecutionSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const repo = new WorkflowExecutionSnapshotRepository(prisma as never);
    const service = new WorkflowExecutionSnapshotService(prisma as never, repo);

    await expect(
      service.getSnapshotForAudit('org-2', RUN_ID, ['ORG_ADMIN']),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects duplicate snapshot creation for the same run', async () => {
    const prisma = {
      workflowExecutionSnapshot: { findFirst: jest.fn().mockResolvedValue({ id: 'snap-1' }) },
    };
    const repo = new WorkflowExecutionSnapshotRepository(prisma as never);

    await expect(
      repo.createImmutable(prisma as never, {
        orgId: ORG,
        workflowRunId: RUN_ID,
        contentHash: 'hash',
        payload: {},
      }),
    ).rejects.toMatchObject({
      response: { code: WORKFLOW_EXECUTION_SNAPSHOT_ERROR_CODES.ALREADY_EXISTS },
    });
  });

  it('rejects snapshot updates as immutable', () => {
    const repo = new WorkflowExecutionSnapshotRepository({} as never);
    const service = new WorkflowExecutionSnapshotService({} as never, repo);
    expect(() => service.updateSnapshot()).toThrow(ConflictException);
  });
});

describe('WorkflowExecutionSnapshotRepository immutability contract', () => {
  it('has no update method — snapshots are append-only at creation', () => {
    const repo = new WorkflowExecutionSnapshotRepository({} as never);
    expect((repo as { update?: unknown }).update).toBeUndefined();
  });
});
