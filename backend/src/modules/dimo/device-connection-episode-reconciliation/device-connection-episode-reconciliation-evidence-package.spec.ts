import {
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DeviceConnectionEpisodeReconciliationApplyService } from './device-connection-episode-reconciliation-apply.service';
import {
  buildEpisodeReconciliationEvidencePackage,
  isAutoApplicableClassification,
} from './device-connection-episode-reconciliation-evidence-package.builder';
import { hashEvidencePackage } from './device-connection-episode-reconciliation-evidence-package.hash';
import { EPISODE_RECONCILIATION_EVIDENCE_CODE_VERSION } from './device-connection-episode-reconciliation-evidence-package.version';
import type { EpisodeReconciliationEvidencePackage } from './device-connection-episode-reconciliation-evidence-package.types';
import {
  validateEvidencePackageAgainstDatabase,
  validateEvidencePackageCanonical,
} from './device-connection-episode-reconciliation-evidence-package.validator';
import {
  enrichFixtureVehicle,
  RECONCILIATION_FIXTURE_VEHICLES,
} from './device-connection-episode-reconciliation.fixtures';
import { FIXTURE_VEHICLE_ALIASES } from './device-connection-episode-reconciliation.anonymize';
import { deriveEpisodeWindows, reconcileVehicleEpisodes } from './device-connection-episode-reconciliation.engine';
import { DeviceConnectionEpisodeService } from '../device-connection-episode.service';
import { DeviceConnectionEpisodeResolutionService } from '../device-connection-episode-resolution/device-connection-episode-resolution.service';

function basePackage(
  overrides: Partial<EpisodeReconciliationEvidencePackage> = {},
): EpisodeReconciliationEvidencePackage {
  const body = {
    episodeId: 'ep-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    provider: 'DIMO',
    deviceBindingId: 'bind-1',
    hardwareType: 'LTE_R1',
    unplugEventId: 'unplug-1',
    plugEventId: null,
    unplugObservedAt: '2026-07-08T17:21:19.000Z',
    unplugReceivedAt: '2026-07-08T17:21:19.100Z',
    recoveryEvidenceType: 'telemetry_resumed' as const,
    relevantSnapshotIds: ['snap-1'],
    resolutionSnapshotId: 'snap-1',
    providerObservedAt: '2026-07-08T17:22:00.000Z',
    receivedAt: '2026-07-08T17:22:05.000Z',
    processedAt: '2026-07-08T17:22:05.000Z',
    sourceType: 'telemetry_recovery_observation' as const,
    obdIsPluggedIn: null,
    operationalSignalSummary: {
      sustained: true,
      sampleCountAfterUnplug: 2,
      hasOperationalSignal: true,
      providerConnectionStatus: null,
    },
    tripEvidence: { tripCountAfterUnplug: 1, firstTripAfterUnplug: '2026-07-09T08:00:00.000Z' },
    bindingEvidence: {
      bindingIdAtUnplug: 'bind-1',
      bindingChangedInWindow: false,
      tokenIdAtUnplug: 1001,
    },
    classification: 'SHOULD_RESOLVE_BY_TELEMETRY' as const,
    confidence: 'HIGH' as const,
    recommendedResolutionMethod: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
    auditWaterlineAt: '2026-07-09T08:00:00.000Z',
    generatedAt: '2026-07-19T12:00:00.000Z',
    codeVersion: EPISODE_RECONCILIATION_EVIDENCE_CODE_VERSION,
    evidenceHash: '',
  };
  const evidenceHash = hashEvidencePackage({ ...body, ...overrides, evidenceHash: '' });
  return {
    ...body,
    ...overrides,
    evidenceHash: overrides.evidenceHash ?? evidenceHash,
  };
}

function buildPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    deviceConnectionEpisode: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    dimoDeviceConnectionEvent: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
    ...overrides,
  } as unknown as PrismaService;
}

function buildResolutionServiceMock(
  overrides: Partial<DeviceConnectionEpisodeResolutionService> = {},
) {
  return {
    tryResolveFromSustainedTelemetry: jest.fn(),
    tryResolveFromSnapshotPlugSignal: jest.fn(),
    ...overrides,
  } as unknown as DeviceConnectionEpisodeResolutionService;
}

describe('episode reconciliation evidence package', () => {
  it('builds deterministic package from audited incident fixture', () => {
    const vehicle = enrichFixtureVehicle(
      RECONCILIATION_FIXTURE_VEHICLES.find(
        (v) => v.anonymizedVehicleId === FIXTURE_VEHICLE_ALIASES.INCIDENT,
      )!,
    );
    const windows = deriveEpisodeWindows(vehicle);
    const candidates = reconcileVehicleEpisodes(vehicle);
    const pkg = buildEpisodeReconciliationEvidencePackage({
      organizationId: 'org-fixture',
      vehicleId: vehicle.vehicleId,
      hardwareType: vehicle.hardwareType,
      episode: { id: 'ep-incident', deviceBindingId: 'binding-fixture-1' },
      window: windows[0]!,
      candidate: candidates[0]!,
      historicalEvidence: vehicle.historicalEvidenceByUnplugEventId?.['inc-unplug'] ?? null,
      generatedAt: '2026-07-19T12:00:00.000Z',
      auditWaterlineAt: candidates[0]!.latestEventAt!,
    });

    expect(pkg).not.toBeNull();
    expect(pkg!.recoveryEvidenceType).toBe('telemetry_resumed');
    expect(pkg!.receivedAt).not.toBe(pkg!.providerObservedAt);
    expect(pkg!.operationalSignalSummary.hasOperationalSignal).toBe(true);
    expect(pkg!.operationalSignalSummary.providerConnectionStatus).toBeNull();
    expect(validateEvidencePackageCanonical(pkg!).valid).toBe(true);
  });

  it('rejects wrong evidence hash', () => {
    const pkg = basePackage({ evidenceHash: 'deadbeef'.repeat(8) });
    const result = validateEvidencePackageCanonical(pkg);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hash_mismatch');
  });

  it('rejects invented CONNECTED without operational signal', () => {
    const pkg = basePackage({
      operationalSignalSummary: {
        sustained: true,
        sampleCountAfterUnplug: 2,
        hasOperationalSignal: false,
        providerConnectionStatus: 'CONNECTED',
      },
    });
    const result = validateEvidencePackageCanonical(pkg);
    expect(result.valid).toBe(false);
    expect(result.detail).toContain('CONNECTED');
  });

  it('validates package against unchanged episode in database', async () => {
    const pkg = basePackage();
    const prisma = buildPrismaMock();
    (prisma.deviceConnectionEpisode.findFirst as jest.Mock).mockResolvedValue({
      id: 'ep-1',
      status: DeviceConnectionEpisodeStatus.OPEN,
      deviceBindingId: 'bind-1',
      openedAt: new Date(pkg.unplugObservedAt),
    });
    (prisma.dimoDeviceConnectionEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: 'veh-1' });

    const result = await validateEvidencePackageAgainstDatabase(prisma, pkg);
    expect(result.valid).toBe(true);
  });

  it('rejects stale package when episode binding changed', async () => {
    const pkg = basePackage();
    const prisma = buildPrismaMock();
    (prisma.deviceConnectionEpisode.findFirst as jest.Mock).mockResolvedValue({
      id: 'ep-1',
      status: DeviceConnectionEpisodeStatus.OPEN,
      deviceBindingId: 'bind-other',
      openedAt: new Date(pkg.unplugObservedAt),
    });

    const result = await validateEvidencePackageAgainstDatabase(prisma, pkg);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('episode_binding_changed');
  });

  it('rejects package when newer event arrived after audit waterline', async () => {
    const pkg = basePackage();
    const prisma = buildPrismaMock();
    (prisma.deviceConnectionEpisode.findFirst as jest.Mock).mockResolvedValue({
      id: 'ep-1',
      status: DeviceConnectionEpisodeStatus.OPEN,
      deviceBindingId: 'bind-1',
      openedAt: new Date(pkg.unplugObservedAt),
    });
    (prisma.dimoDeviceConnectionEvent.findFirst as jest.Mock).mockResolvedValue({
      id: 'evt-new',
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: new Date('2026-07-10T00:00:00.000Z'),
      receivedAt: new Date('2026-07-10T00:00:00.000Z'),
    });
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: 'veh-1' });

    const result = await validateEvidencePackageAgainstDatabase(prisma, pkg);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('newer_event_after_audit');
  });

  it('rejects cross-tenant vehicle lookup', async () => {
    const pkg = basePackage();
    const prisma = buildPrismaMock();
    (prisma.deviceConnectionEpisode.findFirst as jest.Mock).mockResolvedValue({
      id: 'ep-1',
      status: DeviceConnectionEpisodeStatus.OPEN,
      deviceBindingId: 'bind-1',
      openedAt: new Date(pkg.unplugObservedAt),
    });
    (prisma.dimoDeviceConnectionEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await validateEvidencePackageAgainstDatabase(prisma, pkg);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('cross_tenant_mismatch');
  });
});

describe('DeviceConnectionEpisodeReconciliationApplyService', () => {
  it('dry-run uses audited evidence without inventing telemetry flags', async () => {
    const pkg = basePackage();
    const resolutionService = buildResolutionServiceMock();
    const episodeService = { resolveFromExplicitPlugEvent: jest.fn() } as unknown as DeviceConnectionEpisodeService;
    const prisma = buildPrismaMock();
    (prisma.deviceConnectionEpisode.findFirst as jest.Mock).mockResolvedValue({
      id: 'ep-1',
      status: DeviceConnectionEpisodeStatus.OPEN,
      deviceBindingId: 'bind-1',
      openedAt: new Date(pkg.unplugObservedAt),
    });
    (prisma.dimoDeviceConnectionEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: 'veh-1' });

    const service = new DeviceConnectionEpisodeReconciliationApplyService(
      prisma,
      episodeService,
      resolutionService,
    );

    const report = await service.runApply({
      organizationId: 'org-1',
      evidencePackages: [pkg],
      apply: false,
      batchSize: 10,
      operator: 'ops',
      reason: 'dry-run',
    });

    expect(report.summary.applyEligible).toBe(1);
    expect(report.summary.applied).toBe(0);
    expect(resolutionService.tryResolveFromSustainedTelemetry).not.toHaveBeenCalled();
  });

  it('apply passes exact audited telemetry fields to resolution service', async () => {
    const pkg = basePackage();
    const resolutionService = buildResolutionServiceMock({
      tryResolveFromSustainedTelemetry: jest.fn().mockResolvedValue({ outcome: 'resolved' }),
    });
    const episodeService = { resolveFromExplicitPlugEvent: jest.fn() } as unknown as DeviceConnectionEpisodeService;
    const prisma = buildPrismaMock();
    (prisma.deviceConnectionEpisode.findFirst as jest.Mock).mockResolvedValue({
      id: 'ep-1',
      status: DeviceConnectionEpisodeStatus.OPEN,
      deviceBindingId: 'bind-1',
      openedAt: new Date(pkg.unplugObservedAt),
    });
    (prisma.dimoDeviceConnectionEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: 'veh-1' });

    const service = new DeviceConnectionEpisodeReconciliationApplyService(
      prisma,
      episodeService,
      resolutionService,
    );

    await service.runApply({
      organizationId: 'org-1',
      evidencePackages: [pkg],
      apply: true,
      batchSize: 10,
      operator: 'ops',
      reason: 'staging replay',
    });

    expect(resolutionService.tryResolveFromSustainedTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        hasOperationalSignal: true,
        providerConnectionStatus: null,
        receivedAt: new Date(pkg.receivedAt),
        providerObservedAt: new Date(pkg.providerObservedAt),
        providerBindingId: 'bind-1',
      }),
    );
    const callArg = (resolutionService.tryResolveFromSustainedTelemetry as jest.Mock).mock
      .calls[0]![0] as { providerConnectionStatus: string | null };
    expect(callArg.providerConnectionStatus).not.toBe('CONNECTED');
  });

  it('duplicate apply skips already resolved episode', async () => {
    const pkg = basePackage();
    const prisma = buildPrismaMock();
    (prisma.deviceConnectionEpisode.findFirst as jest.Mock).mockResolvedValue({
      id: 'ep-1',
      status: DeviceConnectionEpisodeStatus.RESOLVED,
      deviceBindingId: 'bind-1',
      openedAt: new Date(pkg.unplugObservedAt),
    });

    const service = new DeviceConnectionEpisodeReconciliationApplyService(
      prisma,
      {} as DeviceConnectionEpisodeService,
      {} as DeviceConnectionEpisodeResolutionService,
    );

    const report = await service.runApply({
      organizationId: 'org-1',
      evidencePackages: [pkg],
      apply: true,
      batchSize: 10,
      operator: 'ops',
      reason: 'retry',
    });

    expect(report.summary.rejected).toBe(1);
    expect(report.items[0]!.outcome).toBe('rejected');
    expect(report.items[0]!.detail).toBe('already_resolved');
  });

  it('only auto-applicable classifications are eligible', () => {
    expect(isAutoApplicableClassification('OPEN_CONFIRMED')).toBe(false);
    expect(isAutoApplicableClassification('SHOULD_RESOLVE_BY_TELEMETRY')).toBe(true);
  });

  it('apply routes binding_change through canonical episode service', async () => {
    const pkg = basePackage({
      recoveryEvidenceType: 'binding_change',
      classification: 'SUPERSEDED_BY_BINDING_CHANGE',
      recommendedResolutionMethod: DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
      operationalSignalSummary: {
        sustained: false,
        sampleCountAfterUnplug: 0,
        hasOperationalSignal: false,
        providerConnectionStatus: null,
      },
    });
    const resolutionService = buildResolutionServiceMock();
    const episodeService = {
      reconcileBindingDrift: jest.fn().mockResolvedValue({
        outcome: 'superseded',
        supersededEpisodeIds: ['ep-1'],
      }),
      resolveFromExplicitPlugEvent: jest.fn(),
    } as unknown as DeviceConnectionEpisodeService;
    const prisma = buildPrismaMock();
    (prisma.deviceConnectionEpisode.findFirst as jest.Mock).mockResolvedValue({
      id: 'ep-1',
      status: DeviceConnectionEpisodeStatus.OPEN,
      deviceBindingId: 'bind-1',
      openedAt: new Date(pkg.unplugObservedAt),
    });
    (prisma.dimoDeviceConnectionEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: 'veh-1' });

    const service = new DeviceConnectionEpisodeReconciliationApplyService(
      prisma,
      episodeService,
      resolutionService,
    );

    await service.runApply({
      organizationId: 'org-1',
      evidencePackages: [pkg],
      apply: true,
      batchSize: 10,
      operator: 'ops',
      reason: 'binding replay',
    });

    expect(episodeService.reconcileBindingDrift).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        episodeId: 'ep-1',
        evidenceAt: new Date(pkg.providerObservedAt),
        receivedAt: new Date(pkg.receivedAt),
        resolutionReferenceId: pkg.resolutionSnapshotId,
      }),
    );
  });
});
