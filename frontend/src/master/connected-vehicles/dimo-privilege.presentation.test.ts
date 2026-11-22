import { describe, expect, it } from 'vitest';
import {
  formatDimoTokenId,
  isActiveOffboardingJobStatus,
  pickVehiclePrivilegeRow,
  providerCheckStatusTone,
  recheckGateAppearsOff,
  shouldShowDimoPermissionsPanel,
  vehicleRequiresOwnerAction,
} from './dimo-privilege.presentation';
import type { OrganizationDimoPrivilegeStatusDto } from './dimo-privilege.types';

describe('dimo-privilege.presentation', () => {
  it('does not treat NOT_AVAILABLE tone as success', () => {
    expect(providerCheckStatusTone('NOT_AVAILABLE')).toBe('info');
    expect(providerCheckStatusTone('CONFIRMED_ABSENT')).toBe('success');
  });

  it('scopes vehicle row by vehicleId', () => {
    const vehicles = [
      { vehicleId: 'v1', tokenId: 1, localConnectionStatus: null, consentStatus: null, stillPrivileged: true, verificationStatus: 'VERIFIED_STILL_PRIVILEGED' as const },
      { vehicleId: 'v2', tokenId: 2, localConnectionStatus: null, consentStatus: null, stillPrivileged: false, verificationStatus: 'VERIFIED_ABSENT' as const },
    ];
    expect(pickVehiclePrivilegeRow(vehicles, 'v2')?.stillPrivileged).toBe(false);
    expect(pickVehiclePrivilegeRow(vehicles, 'missing')).toBeNull();
  });

  it('shows panel only for active offboarding jobs', () => {
    const base: OrganizationDimoPrivilegeStatusDto = {
      organizationId: 'org',
      jobId: 'job',
      jobStatus: 'PREPARED',
      phase: 'p',
      lastVerifiedAt: null,
      providerCheckStatus: 'NOT_VERIFIED',
      finalizationState: null,
      detailCode: null,
      vehicles: [],
    };
    expect(shouldShowDimoPermissionsPanel(base)).toBe(true);
    expect(shouldShowDimoPermissionsPanel({ ...base, jobStatus: 'COMPLETED' })).toBe(false);
    expect(shouldShowDimoPermissionsPanel({ ...base, jobId: null })).toBe(false);
  });

  it('detects recheck gate off detail code', () => {
    expect(recheckGateAppearsOff('DIMO_PRIVILEGE_RECHECK_NOT_ARMED')).toBe(true);
    expect(recheckGateAppearsOff('OTHER')).toBe(false);
  });

  it('flags owner action from stillPrivileged null vs true', () => {
    expect(
      vehicleRequiresOwnerAction({
        vehicleId: 'v',
        tokenId: null,
        localConnectionStatus: null,
        consentStatus: null,
        stillPrivileged: null,
        verificationStatus: 'UNVERIFIED',
      }),
    ).toBe(false);
    expect(
      vehicleRequiresOwnerAction({
        vehicleId: 'v',
        tokenId: null,
        localConnectionStatus: null,
        consentStatus: null,
        stillPrivileged: true,
        verificationStatus: 'VERIFIED_STILL_PRIVILEGED',
      }),
    ).toBe(true);
  });

  it('masks token id fallback', () => {
    expect(formatDimoTokenId(123456789, null)).toBe('…6789');
    expect(formatDimoTokenId(null, 'tok…mask')).toBe('tok…mask');
  });

  it('accepts active job statuses', () => {
    expect(isActiveOffboardingJobStatus('RETRYABLE')).toBe(true);
    expect(isActiveOffboardingJobStatus('ARCHIVED')).toBe(false);
  });
});