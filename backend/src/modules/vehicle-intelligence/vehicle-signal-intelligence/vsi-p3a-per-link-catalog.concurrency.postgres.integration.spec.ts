/**
 * VSI P3A monotone catalog upsert concurrency (disposable PostgreSQL).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiP3aPerLinkCatalogRepository } from './vsi-p3a-per-link-catalog.repository';
import { VsiP3aPerLinkCatalogWriterService } from './vsi-p3a-per-link-catalog-writer.service';
import { classifyVsiP3aCatalogAxes } from './vsi-p3a-catalog-axis.classifier';
import {
  VsiProviderCatalogAxisProvenance,
  VsiProviderCatalogSnapshotCompleteness,
} from './vsi-p3a-catalog-axis.contract';
import { createLegacyReconcileOrg } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { createP3aVerifiedRuptelaFixture } from './vsi-p3a-per-link-catalog.postgres.fixture';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const P3A_CATALOG_AXIS_INSERT_SQL_NEEDLE = 'INSERT INTO vsi_provider_catalog_axes';
const P3A_MID_BATCH_INJECTION = 'P3A_MID_BATCH_INJECTION';

type CatalogAxisRowSnapshot = {
  providerNativeSignalName: string;
  declaredCatalogStatus: string;
  checkedAt: string;
  metadataJson: unknown;
};

async function snapshotCatalogAxesForVehicle(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
): Promise<CatalogAxisRowSnapshot[]> {
  const rows = await prisma.vsiProviderCatalogAxis.findMany({
    where: { organizationId, vehicleId },
    orderBy: { providerNativeSignalName: 'asc' },
    select: {
      providerNativeSignalName: true,
      declaredCatalogStatus: true,
      checkedAt: true,
      metadataJson: true,
    },
  });
  return rows.map((row) => ({
    providerNativeSignalName: row.providerNativeSignalName,
    declaredCatalogStatus: row.declaredCatalogStatus,
    checkedAt: row.checkedAt.toISOString(),
    metadataJson: row.metadataJson,
  }));
}

function installMidBatchCatalogAxisWriteFailure(
  prisma: PrismaClient,
  failAfterSuccessfulCatalogWrites: number,
): { restore: () => void; getCatalogAxisWriteAttempts: () => number } {
  let catalogAxisWriteAttempts = 0;
  const originalTransaction = prisma.$transaction.bind(prisma);
  const spy = jest.spyOn(prisma, '$transaction').mockImplementation((arg: unknown, options?: unknown) => {
    if (typeof arg !== 'function') {
      return originalTransaction(arg as never, options as never);
    }
    return originalTransaction(async (tx) => {
      const wrappedTx = new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === '$queryRaw') {
            return async (...args: unknown[]) => {
              const template = args[0];
              const sqlHint = Array.isArray(template)
                ? template.join('')
                : String(template ?? '');
              if (sqlHint.includes(P3A_CATALOG_AXIS_INSERT_SQL_NEEDLE)) {
                catalogAxisWriteAttempts += 1;
                if (catalogAxisWriteAttempts > failAfterSuccessfulCatalogWrites) {
                  throw new Error(P3A_MID_BATCH_INJECTION);
                }
              }
              return target.$queryRaw(...(args as Parameters<typeof target.$queryRaw>));
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
      return (arg as (client: typeof tx) => Promise<unknown>)(wrappedTx);
    }, options as never);
  });
  return {
    restore: () => spy.mockRestore(),
    getCatalogAxisWriteAttempts: () => catalogAxisWriteAttempts,
  };
}

async function cleanupOrg(prisma: PrismaClient, organizationId: string) {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);
  if (vehicleIds.length > 0) {
    await prisma.vsiProviderCatalogAxis.deleteMany({
      where: { organizationId, vehicleId: { in: vehicleIds } },
    });
    await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

(LIVE ? describe : describe.skip)('VSI P3A catalog monotone concurrency (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const repository = new VsiP3aPerLinkCatalogRepository(prisma as never);
  const writer = new VsiP3aPerLinkCatalogWriterService(prisma as never, repository);

  const priorWrite = process.env.VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED;

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
    process.env.VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED = priorWrite;
    return prisma.$disconnect();
  });

  it('parallel preflights keep newest checkedAt catalog row for speed', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createP3aVerifiedRuptelaFixture(
      prisma,
      organizationId,
      `0x${randomUUID().replace(/-/g, '')}`,
    );

    const newer = new Date('2026-10-21T12:00:00.000Z');
    const older = new Date('2026-10-20T12:00:00.000Z');

    await Promise.all([
      writer.persistFromAvailableSignalsPreflight({
        organizationId,
        vehicleId: fixture.vehicleId,
        dimoTokenId: fixture.tokenId,
        availableSignals: [],
        fuelType: 'GASOLINE',
        checkedAt: older,
        catalogSnapshotCompleteness:
          VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
        preflightMetadata: { lane: 'older' },
      }),
      writer.persistFromAvailableSignalsPreflight({
        organizationId,
        vehicleId: fixture.vehicleId,
        dimoTokenId: fixture.tokenId,
        availableSignals: ['speed'],
        fuelType: 'GASOLINE',
        checkedAt: newer,
        catalogSnapshotCompleteness:
          VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
        preflightMetadata: { lane: 'newer' },
      }),
    ]);

    const row = await prisma.vsiProviderCatalogAxis.findFirst({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerNativeSignalName: 'speed',
      },
    });
    expect(row?.declaredCatalogStatus).toBe('LISTED');
    expect(row?.checkedAt.toISOString()).toBe(newer.toISOString());

    await cleanupOrg(prisma, organizationId);
  });

  it('repository upsert is idempotent for equal checkedAt', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createP3aVerifiedRuptelaFixture(
      prisma,
      organizationId,
      `0x${randomUUID().replace(/-/g, '')}`,
    );
    const checkedAt = new Date('2026-10-19T15:00:00.000Z');
    const classifications = classifyVsiP3aCatalogAxes({
      availableSignals: ['speed'],
      fuelType: 'GASOLINE',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
    });
    const link = {
      providerSourceLinkId: fixture.linkId,
      providerIdentity: 'DIMO',
      verifiedModality: 'HARDWARE_DEVICE',
      telemetrySourceFamily: 'RUPTELA_R1',
      connectionIdentityContractVersion: 'vo-connection-identity-v1',
    };

    const first = await repository.upsertCatalogAxes({
      organizationId,
      vehicleId: fixture.vehicleId,
      link,
      checkedAt,
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications,
      metadata: { pass: 'same' },
    });
    const second = await repository.upsertCatalogAxes({
      organizationId,
      vehicleId: fixture.vehicleId,
      link,
      checkedAt,
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications,
      metadata: { pass: 'same' },
    });
    expect(first.written).toBeGreaterThan(0);
    expect(second.written).toBe(0);
    expect(second.outcomes.every((o) => o === 'skipped_equal_timestamp_replay')).toBe(true);

    const speed = classifications.find((c) => c.canonicalSignalKey === 'vehicle_speed');
    expect(speed?.declaredCatalogStatus).toBe(VsiProviderCatalogStatus.LISTED);

    await cleanupOrg(prisma, organizationId);
  });

  it('rejects equal checkedAt catalog content conflicts without overwriting', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createP3aVerifiedRuptelaFixture(
      prisma,
      organizationId,
      `0x${randomUUID().replace(/-/g, '')}`,
    );
    const checkedAt = new Date('2026-10-19T16:00:00.000Z');
    const link = {
      providerSourceLinkId: fixture.linkId,
      providerIdentity: 'DIMO',
      verifiedModality: 'HARDWARE_DEVICE',
      telemetrySourceFamily: 'RUPTELA_R1',
      connectionIdentityContractVersion: 'vo-connection-identity-v1',
    };

    await repository.upsertCatalogAxes({
      organizationId,
      vehicleId: fixture.vehicleId,
      link,
      checkedAt,
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications: classifyVsiP3aCatalogAxes({
        availableSignals: ['speed'],
        fuelType: 'GASOLINE',
        catalogSnapshotCompleteness:
          VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      }),
      metadata: { lane: 'listed' },
    });

    const conflict = await repository.upsertCatalogAxes({
      organizationId,
      vehicleId: fixture.vehicleId,
      link,
      checkedAt,
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications: classifyVsiP3aCatalogAxes({
        availableSignals: [],
        fuelType: 'GASOLINE',
        catalogSnapshotCompleteness:
          VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      }),
      metadata: { lane: 'empty' },
    });
    expect(conflict.equalTimestampConflicts.length).toBeGreaterThan(0);
    expect(conflict.written).toBe(0);

    const speedRow = await prisma.vsiProviderCatalogAxis.findFirst({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerNativeSignalName: 'speed',
      },
    });
    expect(speedRow?.declaredCatalogStatus).toBe('LISTED');

    await cleanupOrg(prisma, organizationId);
  });

  it('rolls back the full P3A batch after two successful axis writes fail mid-transaction', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createP3aVerifiedRuptelaFixture(
      prisma,
      organizationId,
      `0x${randomUUID().replace(/-/g, '')}`,
    );
    const link = {
      providerSourceLinkId: fixture.linkId,
      providerIdentity: 'DIMO',
      verifiedModality: 'HARDWARE_DEVICE',
      telemetrySourceFamily: 'RUPTELA_R1',
      connectionIdentityContractVersion: 'vo-connection-identity-v1',
    };
    const baselineCheckedAt = new Date('2026-10-19T16:30:00.000Z');
    const failedBatchCheckedAt = new Date('2026-10-19T17:30:00.000Z');

    const baseline = await repository.upsertCatalogAxes({
      organizationId,
      vehicleId: fixture.vehicleId,
      link,
      checkedAt: baselineCheckedAt,
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications: classifyVsiP3aCatalogAxes({
        availableSignals: ['speed'],
        fuelType: 'GASOLINE',
        catalogSnapshotCompleteness:
          VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      }),
      metadata: { baselineMarker: 'pre-existing-v1' },
    });
    expect(baseline.written).toBe(8);

    const beforeSnapshot = await snapshotCatalogAxesForVehicle(
      prisma,
      organizationId,
      fixture.vehicleId,
    );
    expect(beforeSnapshot).toHaveLength(8);

    const injection = installMidBatchCatalogAxisWriteFailure(prisma, 2);
    try {
      await expect(
        repository.upsertCatalogAxes({
          organizationId,
          vehicleId: fixture.vehicleId,
          link,
          checkedAt: failedBatchCheckedAt,
          catalogSnapshotCompleteness:
            VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
          provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
          classifications: classifyVsiP3aCatalogAxes({
            availableSignals: [],
            fuelType: 'GASOLINE',
            catalogSnapshotCompleteness:
              VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
          }),
          metadata: { baselineMarker: 'failed-batch-v2' },
        }),
      ).rejects.toThrow(P3A_MID_BATCH_INJECTION);
    } finally {
      injection.restore();
    }

    expect(injection.getCatalogAxisWriteAttempts()).toBe(3);

    const afterSnapshot = await snapshotCatalogAxesForVehicle(
      prisma,
      organizationId,
      fixture.vehicleId,
    );
    expect(afterSnapshot).toEqual(beforeSnapshot);
    expect(
      afterSnapshot.every((row) => row.checkedAt === baselineCheckedAt.toISOString()),
    ).toBe(true);
    expect(
      afterSnapshot.some((row) =>
        row.metadataJson &&
        typeof row.metadataJson === 'object' &&
        (row.metadataJson as { baselineMarker?: string }).baselineMarker === 'failed-batch-v2',
      ),
    ).toBe(false);

    const count = await prisma.vsiProviderCatalogAxis.count({
      where: { organizationId, vehicleId: fixture.vehicleId },
    });
    expect(count).toBe(8);

    await cleanupOrg(prisma, organizationId);
  });

  it('writes all catalog axes atomically for one preflight snapshot', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createP3aVerifiedRuptelaFixture(
      prisma,
      organizationId,
      `0x${randomUUID().replace(/-/g, '')}`,
    );
    const result = await repository.upsertCatalogAxes({
      organizationId,
      vehicleId: fixture.vehicleId,
      link: {
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
        verifiedModality: 'HARDWARE_DEVICE',
        telemetrySourceFamily: 'RUPTELA_R1',
        connectionIdentityContractVersion: 'vo-connection-identity-v1',
      },
      checkedAt: new Date('2026-10-19T18:00:00.000Z'),
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications: classifyVsiP3aCatalogAxes({
        availableSignals: ['speed'],
        fuelType: 'GASOLINE',
        catalogSnapshotCompleteness:
          VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      }),
      metadata: {},
    });
    expect(result.written).toBe(8);
    const count = await prisma.vsiProviderCatalogAxis.count({
      where: { organizationId, vehicleId: fixture.vehicleId },
    });
    expect(count).toBe(8);

    await cleanupOrg(prisma, organizationId);
  });
});
