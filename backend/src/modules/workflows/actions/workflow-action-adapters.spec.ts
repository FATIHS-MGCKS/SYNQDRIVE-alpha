import { Test } from '@nestjs/testing';
import { VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { TasksService } from '@modules/tasks/tasks.service';
import {
  createWorkflowActionPiiSafeLogger,
  WorkflowActionNoopSecretsResolver,
  WorkflowActionRegistryExecutorService,
  WorkflowActionRegistryService,
  WORKFLOW_ACTION_HANDLERS,
  type WorkflowActionExecutionContext,
} from './index';
import {
  WORKFLOW_ACTION_HANDLER_PROVIDERS,
  workflowActionHandlersProvider,
} from './workflow-action-handlers.provider';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function baseContext(
  overrides: Partial<WorkflowActionExecutionContext> = {},
): WorkflowActionExecutionContext {
  return {
    organizationId: ORG,
    workflowRunId: 'run-1',
    actionRunId: 'action-1',
    workflowId: 'wf-1',
    actionIndex: 0,
    idempotencyKey: 'idem-1',
    event: {
      eventType: 'booking.returned',
      entityType: 'booking',
      entityId: 'booking-1',
      payload: { bookingId: 'booking-1', vehicleId: 'veh-1', customerId: 'cust-1' },
    },
    workflowSnapshot: {},
    policySnapshot: {},
    actor: { kind: 'system', permissions: ['WORKFLOW_EXECUTE', 'WORKFLOW_VEHICLE_WRITE'] },
    correlationId: 'corr-1',
    secretsResolver: new WorkflowActionNoopSecretsResolver(),
    logger: createWorkflowActionPiiSafeLogger('adapter-test'),
    ...overrides,
  };
}

function createPrismaMock() {
  return {
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }),
      update: jest.fn(),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue({ id: 'booking-1', customerId: 'cust-1', extrasJson: {} }),
      update: jest.fn(),
    },
    orgWorkflowApproval: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe('Workflow production action adapters', () => {
  let executor: WorkflowActionRegistryExecutorService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let tasksService: {
    upsertByDedup: jest.Mock;
    findActiveByDedup: jest.Mock;
  };
  let notifications: { ingestCandidate: jest.Mock };
  let rentalHealth: { isRentalBlocked: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    tasksService = {
      upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
      findActiveByDedup: jest.fn().mockResolvedValue(null),
    };
    notifications = {
      ingestCandidate: jest.fn().mockResolvedValue({
        enabled: true,
        operation: 'created',
        notification: { id: 'notif-1' },
      }),
    };
    rentalHealth = {
      isRentalBlocked: jest.fn().mockResolvedValue({
        blocked: false,
        reasons: [],
        healthGateStatus: 'OK',
        healthGateWarning: null,
        manualReviewRequired: false,
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ...WORKFLOW_ACTION_HANDLER_PROVIDERS,
        workflowActionHandlersProvider,
        WorkflowActionRegistryService,
        WorkflowActionRegistryExecutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: TasksService, useValue: tasksService },
        { provide: NotificationCoreService, useValue: notifications },
        { provide: RentalHealthService, useValue: rentalHealth },
      ],
    }).compile();

    const registry = module.get(WorkflowActionRegistryService);
    registry.onModuleInit();
    executor = module.get(WorkflowActionRegistryExecutorService);
  });

  describe('task.create', () => {
    it('succeeds and links booking/vehicle/customer', async () => {
      prisma.booking.findFirst.mockResolvedValue({ customerId: 'cust-1' });
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });

      const result = await executor.execute(
        'task.create',
        { title: 'Inspect return', bookingId: 'booking-1', vehicleId: 'veh-1' },
        baseContext(),
      );

      expect(result.status).toBe('SUCCESS');
      expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
        ORG,
        expect.stringContaining('task'),
        expect.objectContaining({
          bookingId: 'booking-1',
          vehicleId: 'veh-1',
          customerId: 'cust-1',
          source: 'WORKFLOW_AUTOMATION',
        }),
      );
    });

    it('returns idempotent replay for duplicate dedup', async () => {
      tasksService.findActiveByDedup.mockResolvedValue({ id: 'task-existing' });
      const result = await executor.execute('task.create', { title: 'A' }, baseContext());
      expect(result.idempotentReplay).toBe(true);
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
    });

    it('fails for foreign tenant booking', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      const result = await executor.execute(
        'task.create',
        { title: 'X', bookingId: 'booking-x' },
        baseContext(),
      );
      expect(result.status).toBe('FAILED');
      expect(result.errorCategory).toBe('NOT_FOUND');
    });

    it('dry-run preview does not create task', async () => {
      const preview = await executor.preview('task.create', { title: 'Preview task' }, baseContext());
      expect(preview.sideEffectFree).toBe(true);
      expect(tasksService.upsertByDedup).not.toHaveBeenCalled();
    });
  });

  describe('notification.in_app.send', () => {
    it('ingests notification with resolved roles', async () => {
      const result = await executor.execute(
        'notification.in_app.send',
        {
          templateKey: 'booking_attention',
          recipientRoles: ['ORG_ADMIN', 'OPERATIONS'],
        },
        baseContext(),
      );
      expect(result.status).toBe('SUCCESS');
      expect(notifications.ingestCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          eventType: 'WORKFLOW_BOOKING_ATTENTION',
          entityId: 'booking-1',
        }),
        expect.any(Object),
      );
    });

    it('marks duplicate when fingerprint updates existing notification', async () => {
      notifications.ingestCandidate.mockResolvedValue({
        enabled: true,
        operation: 'updated',
        notification: { id: 'notif-1' },
      });
      const result = await executor.execute(
        'notification.in_app.send',
        { templateKey: 'workflow_alert', recipientRoles: ['ORG_ADMIN'] },
        baseContext(),
      );
      expect(result.idempotentReplay).toBe(true);
    });

    it('rejects unsupported recipient role for template', () => {
      const validation = executor.validateConfig(
        'notification.in_app.send',
        { templateKey: 'booking_attention', recipientRoles: ['FLEET_MANAGER'] },
        baseContext(),
      );
      expect(validation.valid).toBe(false);
    });
  });

  describe('approval.request', () => {
    it('creates approval gate and pauses', async () => {
      prisma.orgWorkflowApproval.findFirst.mockResolvedValue(null);
      prisma.orgWorkflowApproval.create.mockResolvedValue({ id: 'appr-1' });

      const result = await executor.execute(
        'approval.request',
        { message: 'Confirm charge' },
        baseContext(),
      );
      expect(result.status).toBe('WAITING_APPROVAL');
      expect(prisma.orgWorkflowApproval.create).toHaveBeenCalled();
    });

    it('is idempotent when approval already pending', async () => {
      prisma.orgWorkflowApproval.findFirst.mockResolvedValue({ id: 'appr-existing' });
      const result = await executor.execute('approval.request', {}, baseContext());
      expect(result.idempotentReplay).toBe(true);
      expect(prisma.orgWorkflowApproval.create).not.toHaveBeenCalled();
    });
  });

  describe('booking.flag', () => {
    it('sets allowed flag in extrasJson', async () => {
      prisma.booking.findFirst.mockResolvedValue({ id: 'booking-1', extrasJson: {} });
      prisma.booking.update.mockResolvedValue({});

      const result = await executor.execute(
        'booking.flag',
        { flag: 'manual_review', reason: 'Workflow hold' },
        baseContext(),
      );
      expect(result.status).toBe('SUCCESS');
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'booking-1' },
          data: expect.objectContaining({
            extrasJson: expect.objectContaining({
              workflowFlags: expect.objectContaining({
                manual_review: expect.objectContaining({ workflowRunId: 'run-1' }),
              }),
            }),
          }),
        }),
      );
    });

    it('rejects undefined flag', () => {
      const validation = executor.validateConfig(
        'booking.flag',
        { flag: 'custom_flag' },
        baseContext(),
      );
      expect(validation.valid).toBe(false);
    });

    it('fails for booking in foreign tenant', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      const result = await executor.execute(
        'booking.flag',
        { flag: 'workflow_hold' },
        baseContext({ organizationId: OTHER_ORG }),
      );
      expect(result.status).toBe('FAILED');
      expect(result.errorCategory).toBe('NOT_FOUND');
    });
  });

  describe('vehicle.status.update', () => {
    beforeEach(() => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.IN_SERVICE,
      });
      prisma.vehicle.update.mockResolvedValue({});
    });

    it('requires approval for IN_SERVICE → AVAILABLE', async () => {
      prisma.orgWorkflowApproval.findFirst.mockResolvedValue(null);
      prisma.orgWorkflowApproval.create.mockResolvedValue({ id: 'appr-v' });

      const result = await executor.execute(
        'vehicle.status.update',
        { status: 'AVAILABLE' },
        baseContext(),
      );
      expect(result.status).toBe('WAITING_APPROVAL');
    });

    it('succeeds after approval granted', async () => {
      prisma.orgWorkflowApproval.findFirst.mockImplementation(async (args: { where: { status?: string } }) => {
        if (args.where.status === 'APPROVED') return { id: 'appr-ok' };
        return null;
      });

      const result = await executor.execute(
        'vehicle.status.update',
        { status: 'AVAILABLE' },
        baseContext(),
      );
      expect(result.status).toBe('SUCCESS');
      expect(prisma.vehicle.update).toHaveBeenCalled();
    });

    it('denies without vehicle write permission', async () => {
      const result = await executor.execute(
        'vehicle.status.update',
        { status: 'OUT_OF_SERVICE' },
        baseContext({ actor: { kind: 'user', permissions: ['WORKFLOW_EXECUTE'] } }),
      );
      expect(result.status).toBe('FAILED');
      expect(result.errorCategory).toBe('AUTHORIZATION');
    });

    it('blocks invalid transition', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.AVAILABLE,
      });
      const result = await executor.execute(
        'vehicle.status.update',
        { status: 'RENTED' },
        baseContext(),
      );
      expect(result.status).toBe('FAILED');
      expect(result.errorCategory).toBe('VALIDATION');
    });

    it('returns idempotent replay when already at target status', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.OUT_OF_SERVICE,
      });
      const result = await executor.execute(
        'vehicle.status.update',
        { status: 'OUT_OF_SERVICE' },
        baseContext(),
      );
      expect(result.idempotentReplay).toBe(true);
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });

    it('respects rental-block when forcing AVAILABLE', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.OUT_OF_SERVICE,
      });
      rentalHealth.isRentalBlocked.mockResolvedValue({
        blocked: true,
        reasons: ['Brake critical'],
        healthGateStatus: 'BLOCKED',
        healthGateWarning: null,
        manualReviewRequired: false,
      });
      prisma.orgWorkflowApproval.findFirst.mockResolvedValue({ id: 'approved' });

      const result = await executor.execute(
        'vehicle.status.update',
        { status: 'AVAILABLE' },
        baseContext(),
      );
      expect(result.status).toBe('FAILED');
      expect(result.errorCategory).toBe('PERMANENT');
    });
  });

  describe('audit trail', () => {
    it('records auditId on successful task.create', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      const result = await executor.execute('task.create', { title: 'Audit me', vehicleId: 'veh-1' }, baseContext());
      expect(result.output?.auditId).toBeDefined();
    });
  });
});
