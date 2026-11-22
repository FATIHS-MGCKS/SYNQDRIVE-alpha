import {
  buildVehiclePrivilegeRows,
  mapPrivilegeReadToProviderCheckStatus,
  type OrgDimoVehicleInventoryRow,
} from './organization-offboarding-dimo-privilege.util';

describe('organization-offboarding-dimo-privilege.util', () => {
  const inventory: OrgDimoVehicleInventoryRow[] = [
    { vehicleId: 'v1', tokenId: 100, localConnectionStatus: 'CONNECTED', consentStatus: 'ACTIVE' },
    { vehicleId: 'v2', tokenId: null, localConnectionStatus: null, consentStatus: null },
  ];

  it('maps missing tokenId to REVIEW_REQUIRED with null stillPrivileged', () => {
    const rows = buildVehiclePrivilegeRows(inventory, {
      stillPrivilegedTokenIds: [100],
      providerCheckStatus: 'PRIVILEGE_STILL_ACTIVE',
    });
    expect(rows[1].stillPrivileged).toBeNull();
    expect(rows[1].verificationStatus).toBe('REVIEW_REQUIRED');
  });

  it('marks unknown privilege as null when not verified externally', () => {
    const rows = buildVehiclePrivilegeRows(inventory, {
      stillPrivilegedTokenIds: null,
      providerCheckStatus: 'NOT_VERIFIED',
    });
    expect(rows[0].stillPrivileged).toBeNull();
    expect(rows[0].verificationStatus).toBe('UNVERIFIED');
  });

  it('maps DIMO privilege still active provider status', () => {
    const status = mapPrivilegeReadToProviderCheckStatus({
      outcome: 'NOT_AVAILABLE',
      detailCode: 'DIMO_PRIVILEGE_STILL_ACTIVE',
      providerEvidence: {
        attemptedAt: '2026-01-01T00:00:00.000Z',
        organizationId: 'org',
        provider: 'DIMO',
        operations: [],
        summary: { stillPrivileged: [100] },
      },
    });
    expect(status).toBe('PRIVILEGE_STILL_ACTIVE');
  });

  it('maps verified absence to false stillPrivileged', () => {
    const rows = buildVehiclePrivilegeRows(inventory, {
      stillPrivilegedTokenIds: [],
      providerCheckStatus: 'CONFIRMED_ABSENT',
    });
    expect(rows[0].stillPrivileged).toBe(false);
    expect(rows[0].verificationStatus).toBe('VERIFIED_ABSENT');
  });
});