/**
 * Cross-tenant acceptance — AI & workflow automation (CT-AI-*, CT-WF-*)
 */
import { MembershipRole } from '@prisma/client';
import {
  resolveAiVehicleAccess,
  buildAiExecutionContext,
} from '@modules/ai/execution';
import type { VerifiedAiExecutionContextInput } from '@modules/ai/execution/ai-execution-context.types';
import { OrgWorkflow } from '@prisma/client';
import { WorkflowActionPreviewService } from '@modules/workflows/workflow-action-preview.service';
import { WorkflowDryRunService } from '@modules/workflows/workflow-dry-run.service';
import { WorkflowActionExecutorService } from '@modules/workflows/workflow-action-executor.service';
import { WorkflowExecutionMode } from '@modules/workflows/workflow-execution-mode';
import { TasksService } from '@modules/tasks/tasks.service';
import { makeRolloutServiceMock } from '@modules/workflows/rollout/workflow-runtime-rollout.test-util';
import { CROSS_TENANT_IDS } from './cross-tenant-acceptance.harness';

const { orgA, orgB, vehicleA, vehicleB, userA } = CROSS_TENANT_IDS;

function aiInput(overrides: Partial<VerifiedAiExecutionContextInput> = {}): VerifiedAiExecutionContextInput {
  return {
    organizationId: orgA,
    userId: userA,
    membershipRole: MembershipRole.WORKER,
    membershipStatus: 'ACTIVE',
    permissions: {
      fleet: { read: true, write: false },
      'ai-assistant': { read: true, write: false },
    },
    stationScope: 'ALL',
    stationIds: [],
    channel: 'fleet_chat',
    dataAccessPurpose: 'fleet_assistant_query',
    correlationId: 'corr-ct',
    requestId: 'req-ct',
    ...overrides,
  };
}

describe('Cross-tenant acceptance — AI (CT-AI)', () => {
  const resolver = {
    async findVehicleInOrganization(vehicleId: string, organizationId: string) {
      const map: Record<string, { organizationId: string; currentStationId: string | null }> = {
        [vehicleA]: { organizationId: orgA, currentStationId: null },
        [vehicleB]: { organizationId: orgB, currentStationId: null },
      };
      const row = map[vehicleId];
      if (!row || row.organizationId !== organizationId) return null;
      return { id: vehicleId, organizationId: row.organizationId, currentStationId: row.currentStationId };
    },
  };

  it('CT-AI-01: resolveAiVehicleAccess denies foreign org vehicle UUID', async () => {
    const ctx = buildAiExecutionContext(aiInput());
    const result = await resolveAiVehicleAccess(ctx, { vehicleId: vehicleB }, resolver);
    expect(typeof result === 'object' && 'code' in result).toBe(true);
    if (typeof result === 'object' && 'code' in result) {
      expect(result.code).toBe('vehicle_not_found');
    }
  });

  it('CT-AI-02: rejects manipulated organizationId in tool arguments', async () => {
    const result = await resolveAiVehicleAccess(
      buildAiExecutionContext(aiInput()),
      { vehicleId: vehicleA, organizationId: orgB },
      resolver,
    );
    if (typeof result === 'object' && 'code' in result) {
      expect(result.code).toBe('permission_denied');
    } else {
      fail('expected permission_denied');
    }
  });
});

describe('Cross-tenant acceptance — workflow automation (CT-WF)', () => {
  const ORG_A = orgA;
  const VEHICLE_B = vehicleB;

  function makeWorkflow(overrides: Partial<OrgWorkflow> = {}): OrgWorkflow {
    return {
      id: CROSS_TENANT_IDS.workflowA,
      organizationId: ORG_A,
      name: 'CT workflow',
      description: null,
      category: 'maintenance',
      trigger: { type: 'manual' },
      conditions: [],
      actions: [{ type: 'vehicle.status.update', config: { status: 'IN_SERVICE' } }],
      scope: { type: 'organization' },
      status: 'ACTIVE',
      enabled: true,
      version: 1,
      triggerCount: 0,
      lastTriggeredAt: null,
      createdById: null,
      createdByName: null,
      updatedById: null,
      updatedByName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as OrgWorkflow;
  }

  it('CT-WF-01: dry-run does not resolve cross-tenant vehicle entity', async () => {
    const prisma = {
      orgWorkflow: { findFirst: jest.fn().mockResolvedValue(makeWorkflow()) },
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const preview = new WorkflowActionPreviewService(prisma as never);
    const dryRun = new WorkflowDryRunService(prisma as never, preview);
    const plan = await dryRun.buildExecutionPlan(ORG_A, CROSS_TENANT_IDS.workflowA, {
      payload: { vehicleId: VEHICLE_B },
    });
    expect(plan.plannedActions[0].status).toBe('ERROR');
    expect(plan.plannedActions[0].validationErrors[0]).toMatch(/cross-tenant/i);
    expect(prisma.vehicle.findFirst).toHaveBeenCalled();
  });

  it('CT-WF-02: executor refuses side effects without LIVE mode', async () => {
    const prisma = { orgWorkflow: { findFirst: jest.fn() }, orgWorkflowApproval: { create: jest.fn() } };
    const rollout = makeRolloutServiceMock();
    const executor = new WorkflowActionExecutorService(
      prisma as never,
      { upsertByDedup: jest.fn() } as unknown as TasksService,
      rollout as never,
    );
    await expect(
      executor.execute(
        { type: 'task.create', config: { title: 'Injected' } },
        {
          organizationId: ORG_A,
          workflowId: CROSS_TENANT_IDS.workflowA,
          workflowRunId: 'run-ct',
          actionRunId: 'ar-ct',
          actionIndex: 0,
          eventType: 'manual.test',
          payload: { vehicleId: VEHICLE_B },
          idempotencyKey: 'key-ct',
          actionDefinitionId: 'def-ct',
          actionIdempotencyKey: 'action-key-ct',
          executionMode: WorkflowExecutionMode.DRY_RUN,
        },
      ),
    ).rejects.toThrow(/side effects are only permitted in LIVE/);
  });
});
