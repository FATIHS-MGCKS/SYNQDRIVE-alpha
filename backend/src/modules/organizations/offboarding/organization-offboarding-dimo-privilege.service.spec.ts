import { OrganizationOffboardingDimoPrivilegeService } from './organization-offboarding-dimo-privilege.service';
import { OrganizationOffboardingDimoLiveDisconnectAdapter } from './organization-offboarding-dimo-live-disconnect.adapter';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { OrganizationStatus } from '@prisma/client';

describe('OrganizationOffboardingDimoPrivilegeService', () => {
  const dimoLive = {
    verifyOrganizationPrivilegedReadOnly: jest.fn(),
    disconnectOrganization: jest.fn(),
    verifyOrganizationDisconnect: jest.fn(),
  } as unknown as OrganizationOffboardingDimoLiveDisconnectAdapter;

  const masterAudit = { record: jest.fn() } as unknown as MasterAdminAuditService;

  const createService = (prisma: Record<string, unknown>) =>
    new OrganizationOffboardingDimoPrivilegeService(prisma as never, dimoLive, masterAudit);

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.ORGANIZATION_OFFBOARDING_DIMO_PRIVILEGE_RECHECK_ENABLED;
  });

  it('GET builds local inventory without provider calls', async () => {
    const vehicleFindMany = jest.fn().mockResolvedValue([
      {
        id: 'v1',
        dimoVehicle: { tokenId: 42, connectionStatus: 'CONNECTED' },
        providerConsents: [{ status: 'ACTIVE' }],
      },
    ]);
    const jobFindFirst = jest.fn().mockResolvedValue({
      id: 'job-1',
      status: 'RETRYABLE',
      phase: 'PROVIDER_QUIESCE',
      progressJson: {},
    });
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      vehicle: { findMany: vehicleFindMany },
      organizationOffboardingJob: { findFirst: jobFindFirst },
    };

    const service = createService(prisma);
    const result = await service.getDimoPrivilegeStatus('org-1');

    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0].tokenId).toBe(42);
    expect(result.vehicles[0].stillPrivileged).toBeNull();
    expect(dimoLive.verifyOrganizationPrivilegedReadOnly).not.toHaveBeenCalled();
    expect(vehicleFindMany).toHaveBeenCalledTimes(1);
  });

  it('recheck when gate disabled preserves evidence without live call', async () => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-1', status: OrganizationStatus.SUSPENDED }),
      },
      organizationOffboardingJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'job-1',
          progressJson: {
            dimoPrivilegeVerification: {
              lastVerifiedAt: '2026-01-01T00:00:00.000Z',
              verificationSnapshotReference: 'snap-1',
              privilegedStillActiveTokenIds: [1],
              providerCheckStatus: 'PRIVILEGE_STILL_ACTIVE',
              detailCode: 'DIMO_PRIVILEGE_STILL_ACTIVE',
              providerEvidenceSummary: {},
            },
          },
        }),
        update: jest.fn(),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = createService(prisma);
    const result = await service.recheckDimoPrivileges('org-1', 'actor-1');

    expect(result.evidencePreserved).toBe(true);
    expect(result.detailCode).toBe('DIMO_PRIVILEGE_RECHECK_NOT_ARMED');
    expect(dimoLive.verifyOrganizationPrivilegedReadOnly).not.toHaveBeenCalled();
    expect(prisma.organizationOffboardingJob.update).not.toHaveBeenCalled();
  });

  it('recheck when armed calls only DIMO privileged read adapter', async () => {
    process.env.ORGANIZATION_OFFBOARDING_DIMO_PRIVILEGE_RECHECK_ENABLED = '1';
    dimoLive.verifyOrganizationPrivilegedReadOnly = jest.fn().mockResolvedValue({
      outcome: 'CONFIRMED',
      detailCode: null,
      providerEvidence: {
        attemptedAt: '2026-02-01T00:00:00.000Z',
        organizationId: 'org-1',
        provider: 'DIMO',
        operations: [],
        summary: { stillPrivileged: [] },
      },
    });

    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-1', status: OrganizationStatus.SUSPENDED }),
      },
      organizationOffboardingJob: {
        findFirst: jest.fn().mockResolvedValue({ id: 'job-1', progressJson: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'v1',
            dimoVehicle: { tokenId: 42, connectionStatus: 'DISCONNECTED' },
            providerConsents: [],
          },
        ]),
      },
    };

    const service = createService(prisma);
    const result = await service.recheckDimoPrivileges('org-1', 'actor-1');

    expect(dimoLive.verifyOrganizationPrivilegedReadOnly).toHaveBeenCalledWith('org-1');
    expect(result.providerCheckStatus).toBe('CONFIRMED_ABSENT');
    expect(prisma.organizationOffboardingJob.update).toHaveBeenCalled();
  });
});