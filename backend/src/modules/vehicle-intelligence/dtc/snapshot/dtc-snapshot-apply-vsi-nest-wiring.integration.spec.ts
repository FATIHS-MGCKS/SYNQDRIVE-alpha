import { Test } from '@nestjs/testing';
import { DtcSnapshotApplyService } from './dtc-snapshot-apply.service';
import { DtcService } from '../dtc.service';
import { PrismaService } from '@shared/database/prisma.service';
import { VsiSignalProfileMaterializationService } from '../../vehicle-signal-intelligence/vsi-profile-materialization.service';
import { VsiDeclaredCatalogResolver } from '../../vehicle-signal-intelligence/vsi-declared-catalog.resolver';
import { buildPollSignalsLatestProposal } from './dtc-snapshot-proposal.builder';

describe('DtcSnapshotApplyService Nest VSI wiring', () => {
  const binding = {
    provider: 'DIMO' as const,
    providerBindingId: 'link-1',
    dimoTokenId: 1,
  };

  function makePrismaTxMock() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      vehicleDtcSourceHead: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      vehicleDtcEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      vehicleLatestState: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org',
          licensePlate: 'X',
          make: 'Audi',
          model: 'A4',
        }),
      },
      vehicleDtcSnapshotOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'o1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
      vehicleDtcSnapshotOutbox: tx.vehicleDtcSnapshotOutbox,
    };
    return { prisma, tx };
  }

  it('wires real VsiSignalProfileMaterializationService and invokes it after COMPLETE apply', async () => {
    const { prisma } = makePrismaTxMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DtcSnapshotApplyService,
        VsiSignalProfileMaterializationService,
        VsiDeclaredCatalogResolver,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DtcService,
          useValue: {
            upsertDtc: jest.fn().mockResolvedValue({ id: 'e1', severity: 'WARNING' }),
            clearDtc: jest.fn(),
            findActive: jest.fn(),
            runEpisodeSideEffectsAfterCommit: jest.fn(),
          },
        },
      ],
    }).compile();

    const apply = moduleRef.get(DtcSnapshotApplyService);
    const materialization = moduleRef.get(VsiSignalProfileMaterializationService);
    const spy = jest
      .spyOn(materialization, 'materializeFromPersistedEvidence')
      .mockResolvedValue(null);

    const built = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date('2026-10-24T06:46:10.000Z'),
      auditRef: 'nest-wiring-1',
      obdDtcListSignal: {
        timestamp: '2026-10-24T06:46:08.000Z',
        value: ['P0301'],
      },
    });
    await apply.applyBuiltProposal(built);

    expect(spy).toHaveBeenCalledWith({
      organizationId: 'org',
      vehicleId: 'v1',
      providerSourceLinkId: 'link-1',
      lifecycleMode: 'DTC_CONFIRMED_COMPLETE_APPLIED',
    });
  });
});
