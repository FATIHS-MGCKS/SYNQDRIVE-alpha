import {
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalStateActionOutboxStatus,
  DimoDeviceConnectionEventType,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import {
  cleanupPhysicalStatePostgresFixture,
  createPhysicalStatePostgresFixture,
  type PhysicalStatePostgresFixture,
} from './testing/physical-state-postgres.integration.harness';

const LIVE =
  process.env.PHYSICAL_STATE_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRED = process.env.PHYSICAL_STATE_POSTGRES_REQUIRED === '1';
const describePg = LIVE ? describe : describe.skip;

if (REQUIRED && !LIVE) {
  throw new Error(
    'PHYSICAL_STATE_POSTGRES_REQUIRED=1 but DATABASE_URL / PHYSICAL_STATE_POSTGRES_INTEGRATION not configured',
  );
}

describePg('PhysicalStateReconcileCoordinator (postgres)', () => {
  let prisma: PrismaClient;
  let coordinator: PhysicalStateReconcileCoordinator;
  let fixture: PhysicalStatePostgresFixture;
  let binding: ReturnType<typeof buildBindingScopeFromToken>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('SELECT 1');
    const prismaService = prisma as unknown as PrismaService;
    coordinator = new PhysicalStateReconcileCoordinator(
      prismaService,
      new DeviceConnectionPhysicalStateRepository(prismaService),
      new DeviceConnectionPhysicalStateActionOutboxRepository(prismaService),
    );
  });

  beforeEach(async () => {
    fixture = await createPhysicalStatePostgresFixture(prisma);
    binding = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: fixture.tokenId,
    });
  });

  afterEach(async () => {
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function evidence(at: string, state: 'PLUGGED' | 'UNPLUGGED', ref: string) {
    return {
      candidateState: state,
      evidenceObservedAt: new Date(at),
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: ref,
    };
  }

  function baseReconcile(
    ev: ReturnType<typeof evidence>,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: ev,
      ...overrides,
    };
  }

  async function counts() {
    const [projections, audits, events, outbox] = await Promise.all([
      prisma.deviceConnectionPhysicalState.count({ where: { vehicleId: fixture.vehicle.id } }),
      prisma.deviceConnectionPhysicalStateTransition.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
      prisma.dimoDeviceConnectionEvent.count({ where: { vehicleId: fixture.vehicle.id } }),
      prisma.deviceConnectionPhysicalStateActionOutbox.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
    ]);
    return { projections, audits, events, outbox };
  }

  it('1. normal ESTABLISHED commit', async () => {
    const before = await counts();
    const result = await coordinator.reconcileInOuterTransaction({
      reconcile: baseReconcile(evidence('2026-01-01T10:00:00.000Z', 'PLUGGED', 'est-1')),
    });
    const after = await counts();
    expect(result.reconcile.decision).toBe('ESTABLISHED');
    expect(after.projections).toBe(before.projections + 1);
    expect(after.audits).toBe(before.audits + 1);
    expect(after.events).toBe(before.events);
    expect(after.outbox).toBe(before.outbox);
  });

  it('2. normal APPLIED webhook commit with event history', async () => {
    await coordinator.reconcileInOuterTransaction({
      reconcile: baseReconcile(evidence('2026-01-01T10:00:00.000Z', 'PLUGGED', 'est-1')),
    });

    const before = await counts();
    const result = await coordinator.reconcileInOuterTransaction({
      reconcile: baseReconcile(evidence('2026-01-01T11:00:00.000Z', 'UNPLUGGED', 'wh-1')),
      webhookEventUpsert: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: fixture.tokenId,
        provider: 'DIMO',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-01-01T11:00:00.000Z'),
        rawPayloadJson: { test: true },
      },
    });
    const after = await counts();

    expect(result.reconcile.decision).toBe('APPLIED');
    expect(result.canonicalEventId).toBeTruthy();
    expect(after.events).toBe(before.events + 1);
    expect(after.outbox).toBe(before.outbox + 1);
  });

  it('3. action-bearing APPLIED creates outbox atomically', async () => {
    await coordinator.reconcileInOuterTransaction({
      reconcile: baseReconcile(evidence('2026-01-01T10:00:00.000Z', 'PLUGGED', 'est-1')),
    });

    const result = await coordinator.reconcileInOuterTransaction({
      reconcile: baseReconcile(evidence('2026-01-01T11:00:00.000Z', 'UNPLUGGED', 'wh-2')),
      webhookEventUpsert: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: fixture.tokenId,
        provider: 'DIMO',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-01-01T11:00:00.000Z'),
        rawPayloadJson: {},
      },
    });

    expect(result.outboxId).toBeTruthy();
    const outbox = await prisma.deviceConnectionPhysicalStateActionOutbox.findUnique({
      where: { id: result.outboxId! },
    });
    expect(outbox?.status).toBe(DeviceConnectionPhysicalStateActionOutboxStatus.PENDING);
    expect(outbox?.canonicalEventId).toBe(result.canonicalEventId);
  });

  it('4. failure after projection rolls back all durable state', async () => {
    const before = await counts();
    await expect(
      coordinator.reconcileInOuterTransaction(
        {
          reconcile: baseReconcile(evidence('2026-01-01T10:00:00.000Z', 'PLUGGED', 'fail-1')),
        },
        {
          testSeam: {
            afterReconcile: async () => {
              throw new Error('inject_after_projection');
            },
          },
        },
      ),
    ).rejects.toThrow('inject_after_projection');
    const after = await counts();
    expect(after).toEqual(before);
  });

  it('5-7. failure after event/outbox rolls back projection + audit + event + outbox', async () => {
    await coordinator.reconcileInOuterTransaction({
      reconcile: baseReconcile(evidence('2026-01-01T10:00:00.000Z', 'PLUGGED', 'est-2')),
    });

    const before = await counts();
    await expect(
      coordinator.reconcileInOuterTransaction(
        {
          reconcile: baseReconcile(evidence('2026-01-01T11:00:00.000Z', 'UNPLUGGED', 'fail-2')),
          webhookEventUpsert: {
            organizationId: fixture.org.id,
            vehicleId: fixture.vehicle.id,
            tokenId: fixture.tokenId,
            provider: 'DIMO',
            eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
            observedAt: new Date('2026-01-01T11:00:00.000Z'),
            rawPayloadJson: {},
          },
        },
        {
          testSeam: {
            afterOutboxEnqueue: async () => {
              throw new Error('inject_after_outbox');
            },
          },
        },
      ),
    ).rejects.toThrow('inject_after_outbox');

    const after = await counts();
    expect(after.projections).toBe(before.projections);
    expect(after.audits).toBe(before.audits);
    expect(after.events).toBe(before.events);
    expect(after.outbox).toBe(before.outbox);
  });

  it('8. duplicate retry does not duplicate projection transition or outbox', async () => {
    await coordinator.reconcileInOuterTransaction({
      reconcile: baseReconcile(evidence('2026-01-01T10:00:00.000Z', 'PLUGGED', 'est-3')),
    });

    const input = {
      reconcile: baseReconcile(evidence('2026-01-01T11:00:00.000Z', 'UNPLUGGED', 'dup-1')),
      webhookEventUpsert: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: fixture.tokenId,
        provider: 'DIMO',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-01-01T11:00:00.000Z'),
        rawPayloadJson: {},
      },
    };

    const first = await coordinator.reconcileInOuterTransaction(input);
    const second = await coordinator.reconcileInOuterTransaction(input);

    expect(first.reconcile.decision).toBe('APPLIED');
    expect(second.reconcile.decision).toBe('DUPLICATE');
    expect(second.outboxDuplicate).toBe(true);

    const outboxCount = await prisma.deviceConnectionPhysicalStateActionOutbox.count({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(outboxCount).toBe(1);
  });

  it('11. tenant mismatch rolls back everything', async () => {
    const before = await counts();
    await expect(
      coordinator.reconcileInOuterTransaction({
        reconcile: {
          ...baseReconcile(evidence('2026-01-01T10:00:00.000Z', 'PLUGGED', 'tenant-fail')),
          organizationId: 'wrong-org',
        },
      }),
    ).rejects.toThrow(/tenant_mismatch/);
    const after = await counts();
    expect(after).toEqual(before);
  });
});
