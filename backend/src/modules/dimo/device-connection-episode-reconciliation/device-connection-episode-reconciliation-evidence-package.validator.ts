import { DeviceConnectionEpisodeStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { EPISODE_RECONCILIATION_EVIDENCE_CODE_VERSION } from './device-connection-episode-reconciliation-evidence-package.version';
import {
  hashEvidencePackage,
} from './device-connection-episode-reconciliation-evidence-package.hash';
import {
  isAutoApplicableClassification,
  recommendedMethodMatchesPackage,
} from './device-connection-episode-reconciliation-evidence-package.builder';
import type {
  EpisodeReconciliationEvidencePackage,
  EvidencePackageValidationResult,
} from './device-connection-episode-reconciliation-evidence-package.types';

export function validateEvidencePackageCanonical(
  pkg: EpisodeReconciliationEvidencePackage,
): EvidencePackageValidationResult {
  if (pkg.codeVersion !== EPISODE_RECONCILIATION_EVIDENCE_CODE_VERSION) {
    return {
      valid: false,
      reason: 'code_version_mismatch',
      detail: `expected ${EPISODE_RECONCILIATION_EVIDENCE_CODE_VERSION}, got ${pkg.codeVersion}`,
    };
  }

  const expectedHash = hashEvidencePackage(pkg);
  if (pkg.evidenceHash !== expectedHash) {
    return { valid: false, reason: 'hash_mismatch', detail: 'evidence hash does not match body' };
  }

  if (!isAutoApplicableClassification(pkg.classification)) {
    return { valid: false, reason: 'not_auto_applicable', detail: pkg.classification };
  }

  if (!recommendedMethodMatchesPackage(pkg)) {
    return {
      valid: false,
      reason: 'not_auto_applicable',
      detail: 'recommended resolution method does not match recovery evidence type',
    };
  }

  if (pkg.recoveryEvidenceType === 'telemetry_resumed') {
    if (pkg.operationalSignalSummary.providerConnectionStatus === 'CONNECTED' && !pkg.operationalSignalSummary.hasOperationalSignal) {
      return {
        valid: false,
        reason: 'not_auto_applicable',
        detail: 'invented CONNECTED without operational signal evidence',
      };
    }
  }

  if (pkg.recoveryEvidenceType === 'explicit_plug' && !pkg.plugEventId) {
    return { valid: false, reason: 'missing_plug_event', detail: 'explicit plug requires plugEventId' };
  }

  if (pkg.recoveryEvidenceType === 'snapshot_signal' && pkg.obdIsPluggedIn !== true) {
    return {
      valid: false,
      reason: 'not_auto_applicable',
      detail: 'snapshot apply requires obdIsPluggedIn=true in package',
    };
  }

  return { valid: true };
}

export async function validateEvidencePackageAgainstDatabase(
  prisma: PrismaService,
  pkg: EpisodeReconciliationEvidencePackage,
): Promise<EvidencePackageValidationResult> {
  const canonical = validateEvidencePackageCanonical(pkg);
  if (!canonical.valid) return canonical;

  const episode = await prisma.deviceConnectionEpisode.findFirst({
    where: {
      id: pkg.episodeId,
      organizationId: pkg.organizationId,
      vehicleId: pkg.vehicleId,
    },
    select: {
      id: true,
      status: true,
      deviceBindingId: true,
      openedAt: true,
    },
  });

  if (!episode) {
    return { valid: false, reason: 'episode_not_found' };
  }

  if (episode.status === DeviceConnectionEpisodeStatus.RESOLVED) {
    return { valid: false, reason: 'already_resolved' };
  }

  if (episode.status !== DeviceConnectionEpisodeStatus.OPEN) {
    return { valid: false, reason: 'episode_not_open', detail: episode.status };
  }

  if (episode.openedAt.toISOString() !== pkg.unplugObservedAt) {
    return {
      valid: false,
      reason: 'episode_opened_at_mismatch',
      detail: `${episode.openedAt.toISOString()} vs ${pkg.unplugObservedAt}`,
    };
  }

  if ((episode.deviceBindingId ?? null) !== (pkg.deviceBindingId ?? null)) {
    return { valid: false, reason: 'episode_binding_changed' };
  }

  if ((pkg.bindingEvidence.bindingIdAtUnplug ?? null) !== (episode.deviceBindingId ?? null)) {
    return { valid: false, reason: 'episode_binding_changed', detail: 'binding evidence stale' };
  }

  const newerEvent = await prisma.dimoDeviceConnectionEvent.findFirst({
    where: {
      organizationId: pkg.organizationId,
      vehicleId: pkg.vehicleId,
      OR: [
        { observedAt: { gt: new Date(pkg.auditWaterlineAt) } },
        { receivedAt: { gt: new Date(pkg.auditWaterlineAt) } },
      ],
    },
    orderBy: { receivedAt: 'desc' },
    select: { id: true, eventType: true, observedAt: true, receivedAt: true },
  });

  if (newerEvent) {
    return {
      valid: false,
      reason: 'newer_event_after_audit',
      detail: `${newerEvent.eventType}@${newerEvent.observedAt.toISOString()}`,
    };
  }

  if (pkg.recoveryEvidenceType === 'explicit_plug') {
    const plug = await prisma.dimoDeviceConnectionEvent.findFirst({
      where: {
        id: pkg.plugEventId!,
        organizationId: pkg.organizationId,
        vehicleId: pkg.vehicleId,
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
      },
      select: { observedAt: true, receivedAt: true },
    });
    if (!plug) {
      return { valid: false, reason: 'missing_plug_event' };
    }
    if (plug.observedAt.toISOString() !== pkg.providerObservedAt) {
      return {
        valid: false,
        reason: 'newer_event_after_audit',
        detail: 'plug event timestamps changed',
      };
    }
    if (plug.receivedAt.toISOString() !== pkg.receivedAt) {
      return {
        valid: false,
        reason: 'newer_event_after_audit',
        detail: 'plug event receivedAt changed',
      };
    }
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: pkg.vehicleId, organizationId: pkg.organizationId },
    select: { id: true },
  });
  if (!vehicle) {
    return { valid: false, reason: 'cross_tenant_mismatch' };
  }

  return { valid: true };
}

export function assertEvidencePackageUnchanged(
  frozen: EpisodeReconciliationEvidencePackage,
  refreshed: EpisodeReconciliationEvidencePackage,
): EvidencePackageValidationResult {
  const frozenHash = hashEvidencePackage(frozen);
  const refreshedHash = hashEvidencePackage(refreshed);
  if (frozenHash !== refreshedHash) {
    return {
      valid: false,
      reason: 'hash_mismatch',
      detail: 'evidence package changed since audit — re-run dry run',
    };
  }
  return { valid: true };
}
