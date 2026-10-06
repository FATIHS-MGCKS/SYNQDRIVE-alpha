import {
  R9ProviderWakeForensicClassification,
  R9ProviderWakeForensicLineageRole,
  R9ProviderWakeForensicSnapshotStatus,
  TripDetectionState,
} from '@prisma/client';

import { buildR9ProviderWakeCorrelationContext } from './r9-wake-correlation.util';
import { R9ProviderWakeForensicRepository } from './r9-provider-wake-forensic.repository';
import { R9ProviderWakeForensicTenantConflictError } from './r9-provider-wake-forensic.types';

describe('R9ProviderWakeForensicRepository', () => {
  const orgId = 'org-00000000-0000-0000-0000-000000000099';
  const vehicleId = 'veh-00000000-0000-0000-0000-000000000099';
  const otherVehicleId = 'veh-00000000-0000-0000-0000-000000000088';

  function correlation() {
    return buildR9ProviderWakeCorrelationContext({
      organizationId: orgId,
      vehicleId,
      dimoTokenId: 187361,
      signalName: 'speed',
      wakeReason: 'SPEED_MOVEMENT',
      providerObservedAt: new Date('2026-10-01T10:00:00.000Z'),
      receivedAt: new Date('2026-10-01T10:00:02.000Z'),
      providerDeliveryId: 'delivery-1',
    });
  }

  function makeRepo(store: Map<string, any>) {
    const prisma = {
      r9ProviderWakeForensic: {
        findUnique: jest.fn(async ({ where }: { where: { wakeCorrelationId: string } }) =>
          store.get(where.wakeCorrelationId) ?? null,
        ),
        create: jest.fn(async ({ data }: { data: any }) => {
          const vehicleIdFromConnect = data.vehicle?.connect?.id as string | undefined;
          const row = {
            id: 'row-1',
            coalesceCount: 0,
            organizationId: data.organizationId,
            vehicleId: data.vehicleId ?? vehicleIdFromConnect,
            lineageRole: data.lineageRole ?? null,
            fsmStateAtIntake: data.fsmStateAtIntake ?? null,
            classification: data.classification,
            providerObservedAt: data.providerObservedAt ?? null,
            receivedAt: data.receivedAt,
            providerFetchedAt: null,
            snapshotSourceTimestamp: null,
            wakeCorrelationId: data.wakeCorrelationId,
          };
          store.set(data.wakeCorrelationId, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: { where: { wakeCorrelationId: string }; data: any }) => {
          const row = store.get(where.wakeCorrelationId);
          if (!row) throw new Error('missing');
          const patch = { ...data };
          if (patch.coalesceCount?.increment) {
            row.coalesceCount = (row.coalesceCount ?? 0) + patch.coalesceCount.increment;
            delete patch.coalesceCount;
          }
          Object.assign(row, patch);
          store.set(where.wakeCorrelationId, row);
          return row;
        }),
      },
    };
    return new R9ProviderWakeForensicRepository(prisma as any);
  }

  it('duplicate upsert converges to one row', async () => {
    const store = new Map<string, any>();
    const repo = makeRepo(store);
    const c = correlation();
    await repo.recordIntake({
      correlation: c,
      classification: R9ProviderWakeForensicClassification.ADMITTED,
    });
    await repo.recordIntake({
      correlation: c,
      classification: R9ProviderWakeForensicClassification.COALESCED,
    });
    expect(store.size).toBe(1);
    expect(store.get(c.wakeCorrelationId).classification).toBe(
      R9ProviderWakeForensicClassification.COALESCED,
    );
  });

  it('rejects cross-tenant collision', async () => {
    const store = new Map<string, any>();
    const repo = makeRepo(store);
    const c = correlation();
    store.set(c.wakeCorrelationId, {
      wakeCorrelationId: c.wakeCorrelationId,
      organizationId: orgId,
      vehicleId: otherVehicleId,
    });
    await expect(
      repo.recordIntake({
        correlation: c,
        classification: R9ProviderWakeForensicClassification.ADMITTED,
      }),
    ).rejects.toBeInstanceOf(R9ProviderWakeForensicTenantConflictError);
  });

  it('increments coalesceCount atomically via update contract', async () => {
    const store = new Map<string, any>();
    const repo = makeRepo(store);
    const c = correlation();
    await repo.recordCoordinatorOutcome({
      correlation: c,
      classification: R9ProviderWakeForensicClassification.ADMITTED,
      incrementCoalesce: true,
    });
    await repo.recordCoordinatorOutcome({
      correlation: c,
      classification: R9ProviderWakeForensicClassification.COALESCED,
      incrementCoalesce: true,
    });
    expect(store.get(c.wakeCorrelationId).coalesceCount).toBe(2);
  });

  it('stores providerFetchedAt separately from snapshotSourceTimestamp', async () => {
    const store = new Map<string, any>();
    const repo = makeRepo(store);
    const c = correlation();
    await repo.recordIntake({
      correlation: c,
      classification: R9ProviderWakeForensicClassification.ADMITTED,
      fsmStateAtIntake: TripDetectionState.RESTING,
    });
    const fetchedAt = new Date('2026-10-01T10:00:05.000Z');
    const sourceAt = new Date('2026-10-01T09:55:00.000Z');
    await repo.recordSnapshotCompleted({
      wakeCorrelationId: c.wakeCorrelationId,
      organizationId: orgId,
      vehicleId,
      providerFetchedAt: fetchedAt,
      snapshotSourceTimestamp: sourceAt,
      snapshotStatus: R9ProviderWakeForensicSnapshotStatus.SUCCESS,
      lineageRole: R9ProviderWakeForensicLineageRole.WAKE_CREATED_NEW_SNAPSHOT,
    });
    const row = store.get(c.wakeCorrelationId);
    expect(row.providerFetchedAt).toEqual(fetchedAt);
    expect(row.snapshotSourceTimestamp).toEqual(sourceAt);
    expect(row.providerFetchedAt.getTime()).not.toBe(row.snapshotSourceTimestamp.getTime());
  });
});
