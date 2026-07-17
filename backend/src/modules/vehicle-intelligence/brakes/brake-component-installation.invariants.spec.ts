import {
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationStatus,
  BrakeComponentInstallationType,
} from '@prisma/client';
import {
  defaultMinimumThicknessMm,
  isActiveBrakeComponentInstallation,
  sortInstallationsByHistory,
  validateBrakeComponentInstallation,
  validateEvidenceReference,
  validateReferenceSpecReference,
  validateServiceEventReference,
} from './brake-component-installation.invariants';

describe('brake-component-installation.invariants', () => {
  const installedAt = new Date('2026-03-01T10:00:00.000Z');

  it('defaults minimum thickness by component type', () => {
    expect(defaultMinimumThicknessMm(BrakeComponentInstallationType.FRONT_PADS)).toBe(2);
    expect(defaultMinimumThicknessMm(BrakeComponentInstallationType.FRONT_DISCS)).toBeNull();
    expect(
      defaultMinimumThicknessMm(BrakeComponentInstallationType.FRONT_DISCS, {
        frontDiscMinimumThicknessMm: 22,
        thresholdConfirmedAt: '2026-06-01T10:00:00Z',
      }),
    ).toBe(22);
  });

  it('rejects cross-tenant organization mismatch', () => {
    expect(() =>
      validateBrakeComponentInstallation({
        organizationId: 'org-a',
        vehicleOrganizationId: 'org-b',
        componentType: BrakeComponentInstallationType.FRONT_PADS,
        installedAt,
        status: BrakeComponentInstallationStatus.ACTIVE,
      }),
    ).toThrow('organization_vehicle_mismatch');
  });

  it('rejects duplicate active installation', () => {
    expect(() =>
      validateBrakeComponentInstallation({
        organizationId: 'org-a',
        vehicleOrganizationId: 'org-a',
        componentType: BrakeComponentInstallationType.FRONT_PADS,
        installedAt,
        status: BrakeComponentInstallationStatus.ACTIVE,
        existingActive: {
          id: 'inst-1',
          organizationId: 'org-a',
          vehicleId: 'veh-1',
          componentType: BrakeComponentInstallationType.FRONT_PADS,
          installedAt,
          installedOdometerKm: 1000,
          removedAt: null,
          removedOdometerKm: null,
          status: BrakeComponentInstallationStatus.ACTIVE,
        },
      }),
    ).toThrow('duplicate_active_component_installation');
  });

  it('rejects removedAt before installedAt', () => {
    expect(() =>
      validateBrakeComponentInstallation({
        organizationId: 'org-a',
        vehicleOrganizationId: 'org-a',
        componentType: BrakeComponentInstallationType.REAR_PADS,
        installedAt,
        removedAt: new Date('2026-02-01T10:00:00.000Z'),
        status: BrakeComponentInstallationStatus.REMOVED,
      }),
    ).toThrow('removed_before_installed');
  });

  it('rejects odometer rollback unless explicitly allowed', () => {
    expect(() =>
      validateBrakeComponentInstallation({
        organizationId: 'org-a',
        vehicleOrganizationId: 'org-a',
        componentType: BrakeComponentInstallationType.FRONT_DISCS,
        installedAt,
        installedOdometerKm: 50000,
        removedAt: new Date('2026-04-01T10:00:00.000Z'),
        removedOdometerKm: 1000,
        status: BrakeComponentInstallationStatus.REMOVED,
      }),
    ).toThrow('removed_odometer_before_installed_odometer');
  });

  it('allows documented odometer reset', () => {
    expect(() =>
      validateBrakeComponentInstallation({
        organizationId: 'org-a',
        vehicleOrganizationId: 'org-a',
        componentType: BrakeComponentInstallationType.FRONT_DISCS,
        installedAt,
        installedOdometerKm: 50000,
        removedAt: new Date('2026-04-01T10:00:00.000Z'),
        removedOdometerKm: 1000,
        status: BrakeComponentInstallationStatus.REMOVED,
        allowOdometerReset: true,
      }),
    ).not.toThrow();
  });

  it('validates service, evidence, and spec vehicle references', () => {
    expect(() => validateServiceEventReference('veh-1', 'veh-2')).toThrow(
      'service_event_vehicle_mismatch',
    );
    expect(() => validateEvidenceReference('veh-1', 'veh-2')).toThrow('evidence_vehicle_mismatch');
    expect(() => validateReferenceSpecReference('veh-1', 'veh-2')).toThrow(
      'reference_spec_vehicle_mismatch',
    );
  });

  it('sorts installation history chronologically', () => {
    const sorted = sortInstallationsByHistory([
      { installedAt: new Date('2026-05-01T00:00:00.000Z') },
      { installedAt: new Date('2026-03-01T00:00:00.000Z') },
      { installedAt: new Date('2026-04-01T00:00:00.000Z') },
    ]);
    expect(sorted.map((r) => r.installedAt.toISOString())).toEqual([
      '2026-03-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    ]);
  });

  it('detects active installation rows', () => {
    expect(
      isActiveBrakeComponentInstallation({
        status: BrakeComponentInstallationStatus.ACTIVE,
        removedAt: null,
      }),
    ).toBe(true);
    expect(
      isActiveBrakeComponentInstallation({
        status: BrakeComponentInstallationStatus.REMOVED,
        removedAt: new Date(),
      }),
    ).toBe(false);
  });
});
