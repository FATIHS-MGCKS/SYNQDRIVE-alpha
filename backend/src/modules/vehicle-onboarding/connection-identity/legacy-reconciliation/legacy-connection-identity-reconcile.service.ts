import type { Prisma, PrismaClient } from '@prisma/client';
import { VehicleRegistryLifecycle } from '@prisma/client';
import { DIMO_DATA_SOURCE_PROVIDER, DIMO_DATA_SOURCE_TYPE } from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import {
  buildLegacyReconciliationConnectionIdentityV2,
  fingerprintLinkMetadata,
  parseConnectionIdentityFromLinkMetadata,
  type VoSourceLinkConnectionIdentityMetadataV2,
} from './connection-identity-metadata-v2';
import { evaluateLegacyDimoLinkProviderEvidence } from './legacy-connection-identity-evidence';
import {
  buildApprovalManifestEntry,
  computeDeterministicApprovalManifestFingerprint,
  entriesMatchApprovedManifest,
  type LegacyReconcileApprovalManifestEntry,
} from './legacy-reconcile-approval-manifest';
import {
  assertLegacyReconcileExecuteAuthorization,
  assertLegacyReconcileRollbackAuthorization,
  type LegacyReconcileRollbackAuthorization,
} from './legacy-reconcile-authorization';
import { assertLegacyReconcileLinkGuards } from './legacy-reconcile-link-guards';
import {
  LEGACY_RECONCILE_ELIGIBILITY,
  type LegacyReconcileAuthorization,
  type LegacyReconcilePlanRow,
} from './legacy-connection-identity-reconcile.types';

const ACTIVE_CONSENT_GRANT = 'DIMO_DIRECT';

/** @deprecated Use computeDeterministicApprovalManifestFingerprint */
export function computeManifestFingerprint(rows: LegacyReconcilePlanRow[]): string {
  return computeDeterministicApprovalManifestFingerprint(rows);
}

export { computeDeterministicApprovalManifestFingerprint };

type LinkRow = {
  id: string;
  vehicleId: string;
  provider: string;
  sourceType: string;
  isActive: boolean;
  dimoVehicleId: string | null;
  metadata: Prisma.JsonValue | null;
  lastVerifiedAt: Date | null;
  consentId: string | null;
  consent: { id: string; status: string; grantType: string } | null;
  vehicle: {
    id: string;
    organizationId: string;
    registryLifecycle: VehicleRegistryLifecycle;
    hardwareType: string;
    dimoVehicleId: string | null;
  };
  dimoVehicle: {
    id: string;
    externalId: string;
    tokenId: number | null;
    rawJson: Prisma.JsonValue;
  } | null;
};

async function loadCandidateLinks(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: { organizationId?: string; linkIds?: string[] },
): Promise<LinkRow[]> {
  const scopeActiveOnly = !input.linkIds?.length;
  const rows = await prisma.vehicleDataSourceLink.findMany({
    where: {
      ...(scopeActiveOnly ? { isActive: true } : {}),
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      ...(input.linkIds?.length ? { id: { in: [...input.linkIds] } } : {}),
      ...(input.organizationId ? { vehicle: { organizationId: input.organizationId } } : {}),
    },
    select: {
      id: true,
      vehicleId: true,
      provider: true,
      sourceType: true,
      isActive: true,
      dimoVehicleId: true,
      metadata: true,
      lastVerifiedAt: true,
      consentId: true,
      vehicle: {
        select: {
          id: true,
          organizationId: true,
          registryLifecycle: true,
          hardwareType: true,
          dimoVehicleId: true,
        },
      },
      dimoVehicle: {
        select: { id: true, externalId: true, tokenId: true, rawJson: true },
      },
    },
  });

  const consentIds = rows.map((r) => r.consentId).filter((id): id is string => Boolean(id));
  const consents =
    consentIds.length > 0
      ? await prisma.vehicleProviderConsent.findMany({
          where: { id: { in: consentIds } },
          select: { id: true, status: true, grantType: true },
        })
      : [];
  const consentById = new Map(consents.map((c) => [c.id, c]));

  return rows.map((row) => ({
    ...row,
    consent: row.consentId ? consentById.get(row.consentId) ?? null : null,
  }));
}

export async function planLegacyConnectionIdentityReconciliation(
  prisma: PrismaClient,
  input: {
    organizationId?: string;
    linkIds?: string[];
    allowlistLinkIds?: ReadonlySet<string>;
    now?: Date;
  },
): Promise<LegacyReconcilePlanRow[]> {
  const now = input.now ?? new Date();
  const links = await loadCandidateLinks(prisma, input);
  const rows: LegacyReconcilePlanRow[] = [];

  for (const link of links) {
    const reasonCodes: string[] = [];
    const currentFingerprint = fingerprintLinkMetadata(link.metadata);
    const parsed = parseConnectionIdentityFromLinkMetadata(link.metadata);
    const currentCi =
      parsed === null ? 'absent' : parsed.kind === 'v1' ? 'v1' : 'v2';

    if (input.allowlistLinkIds && !input.allowlistLinkIds.has(link.id)) {
      rows.push({
        sourceLinkId: link.id,
        vehicleId: link.vehicleId,
        organizationId: link.vehicle.organizationId,
        dimoTokenId: link.dimoVehicle?.tokenId ?? null,
        dimoExternalId: link.dimoVehicle?.externalId ?? null,
        provider: link.provider,
        sourceMirrorId: link.dimoVehicleId,
        currentMetadataFingerprint: currentFingerprint,
        currentConnectionIdentity: currentCi,
        eligibility: LEGACY_RECONCILE_ELIGIBILITY.NOT_ON_ALLOWLIST,
        reasonCodes: ['ALLOWLIST_MISS'],
        proposedMetadataV2: null,
        proposedMetadataFingerprint: null,
        evidenceClassification: null,
        approvalManifestEntry: null,
      });
      continue;
    }

    if (link.vehicle.registryLifecycle !== VehicleRegistryLifecycle.ACTIVE) {
      reasonCodes.push('VEHICLE_NOT_ACTIVE');
      rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.LIFECYCLE_EXCLUDED, reasonCodes));
      continue;
    }

    if (!link.isActive) {
      reasonCodes.push('LINK_INACTIVE');
      rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.LINK_INACTIVE, reasonCodes));
      continue;
    }

    if (link.provider !== DIMO_DATA_SOURCE_PROVIDER || link.sourceType !== DIMO_DATA_SOURCE_TYPE) {
      reasonCodes.push('PROVIDER_NOT_DIMO');
      rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.PROVIDER_MISMATCH, reasonCodes));
      continue;
    }

    if (!link.consent || link.consent.status !== 'ACTIVE' || link.consent.grantType !== ACTIVE_CONSENT_GRANT) {
      reasonCodes.push('CONSENT_INVALID');
      rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.CONSENT_INVALID, reasonCodes));
      continue;
    }

    if (parsed) {
      if (parsed.kind === 'v2' && parsed.record.origin === 'LEGACY_RECONCILIATION') {
        rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.ALREADY_RECONCILED, ['V2_LEGACY_PRESENT']));
        continue;
      }
      if (parsed.kind === 'v1' || (parsed.kind === 'v2' && parsed.record.origin === 'ONBOARDING_ACTIVATION')) {
        rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.ALREADY_RECONCILED, ['VALID_IDENTITY_PRESENT']));
        continue;
      }
    }

    if (!link.dimoVehicleId || !link.dimoVehicle) {
      reasonCodes.push('DIMO_MIRROR_MISSING');
      rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.INSUFFICIENT_EVIDENCE, reasonCodes));
      continue;
    }

    if (link.vehicle.dimoVehicleId && link.vehicle.dimoVehicleId !== link.dimoVehicleId) {
      reasonCodes.push('VEHICLE_DIMO_BINDING_MISMATCH');
      rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.TENANT_CONFLICT, reasonCodes));
      continue;
    }

    const evidence = await evaluateLegacyDimoLinkProviderEvidence(prisma, {
      organizationId: link.vehicle.organizationId,
      vehicleId: link.vehicleId,
      linkId: link.id,
      dimoVehicleId: link.dimoVehicleId,
      externalId: link.dimoVehicle.externalId,
    });

    if (!evidence.ok) {
      reasonCodes.push(evidence.reasonCode);
      rows.push(emptyPlan(link, currentFingerprint, currentCi, LEGACY_RECONCILE_ELIGIBILITY.INSUFFICIENT_EVIDENCE, reasonCodes));
      continue;
    }

    const proposed = buildLegacyReconciliationConnectionIdentityV2({
      link: { id: link.id },
      organizationId: link.vehicle.organizationId,
      vehicleId: link.vehicleId,
      dimo: {
        id: link.dimoVehicle.id,
        externalId: link.dimoVehicle.externalId,
        tokenId: link.dimoVehicle.tokenId,
        rawJson: link.dimoVehicle.rawJson,
      },
      verifiedModality: evidence.verifiedModality,
      modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
      physicalDeviceReference: evidence.physicalDeviceReference,
      deviceBindingAssurance: evidence.deviceBindingAssurance,
      providerDeviceIdHash: evidence.deviceBindingEvidence?.providerDeviceIdHash ?? null,
      verificationEvidence: evidence.evidence,
      verifiedAt: now,
      priorLinkLastVerifiedAt: link.lastVerifiedAt,
      reconciliationProvenance: {
        runId: 'DRY_RUN',
        authorizationReference: 'DRY_RUN',
        evidenceCheckedAt: now.toISOString(),
      },
    });

    const proposedEnvelope = mergeConnectionIdentityMetadata(link.metadata, proposed);
    const proposedFingerprint = fingerprintLinkMetadata(proposedEnvelope);

    const planRow: LegacyReconcilePlanRow = {
      sourceLinkId: link.id,
      vehicleId: link.vehicleId,
      organizationId: link.vehicle.organizationId,
      dimoTokenId: link.dimoVehicle.tokenId,
      dimoExternalId: link.dimoVehicle.externalId,
      provider: link.provider,
      sourceMirrorId: link.dimoVehicleId,
      currentMetadataFingerprint: currentFingerprint,
      currentConnectionIdentity: currentCi,
      eligibility: LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE,
      reasonCodes: [],
      proposedMetadataV2: proposed,
      proposedMetadataFingerprint: proposedFingerprint,
      evidenceClassification: evidence.telemetrySourceFamily,
      approvalManifestEntry: null,
    };
    planRow.approvalManifestEntry = buildApprovalManifestEntry(planRow);
    rows.push(planRow);
  }

  return rows;
}

function emptyPlan(
  link: LinkRow,
  fingerprint: string,
  currentCi: 'absent' | 'v1' | 'v2',
  eligibility: LegacyReconcilePlanRow['eligibility'],
  reasonCodes: string[],
): LegacyReconcilePlanRow {
  return {
    sourceLinkId: link.id,
    vehicleId: link.vehicleId,
    organizationId: link.vehicle.organizationId,
    dimoTokenId: link.dimoVehicle?.tokenId ?? null,
    dimoExternalId: link.dimoVehicle?.externalId ?? null,
    provider: link.provider,
    sourceMirrorId: link.dimoVehicleId,
    currentMetadataFingerprint: fingerprint,
    currentConnectionIdentity: currentCi,
    eligibility,
    reasonCodes,
    proposedMetadataV2: null,
    proposedMetadataFingerprint: null,
    evidenceClassification: null,
    approvalManifestEntry: null,
  };
}

export function mergeConnectionIdentityMetadata(
  existing: Prisma.JsonValue | null,
  connectionIdentity: VoSourceLinkConnectionIdentityMetadataV2,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, connectionIdentity };
}

export type LegacyReconcileApplyResult =
  | { outcome: 'NO_OP'; sourceLinkId: string; reason: string }
  | { outcome: 'APPLIED'; sourceLinkId: string; auditId: string; afterFingerprint: string }
  | { outcome: 'SKIPPED'; sourceLinkId: string; eligibility: string; reasonCodes: string[] };

async function buildFreshApprovalEntryInTx(
  tx: Prisma.TransactionClient,
  row: LegacyReconcilePlanRow,
  now: Date,
): Promise<LegacyReconcileApprovalManifestEntry> {
  const guards = await assertLegacyReconcileLinkGuards(tx, {
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    sourceLinkId: row.sourceLinkId,
    now,
  });

  const freshEvidence = await evaluateLegacyDimoLinkProviderEvidence(tx, {
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    linkId: row.sourceLinkId,
    dimoVehicleId: guards.dimoVehicleId,
    externalId: guards.dimoExternalId,
  });
  if (!freshEvidence.ok) {
    throw new Error(`FRESH_EVIDENCE_FAILED:${freshEvidence.reasonCode}`);
  }

  const dimoRow = await tx.dimoVehicle.findUnique({
    where: { id: guards.dimoVehicleId },
    select: { id: true, externalId: true, tokenId: true, rawJson: true },
  });
  if (!dimoRow) {
    throw new Error('FRESH_DIMO_MIRROR_MISSING');
  }

  const proposed = buildLegacyReconciliationConnectionIdentityV2({
    link: { id: row.sourceLinkId },
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    dimo: {
      id: dimoRow.id,
      externalId: dimoRow.externalId,
      tokenId: dimoRow.tokenId,
      rawJson: dimoRow.rawJson,
    },
    verifiedModality: freshEvidence.verifiedModality,
    modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
    physicalDeviceReference: freshEvidence.physicalDeviceReference,
    deviceBindingAssurance: freshEvidence.deviceBindingAssurance,
    providerDeviceIdHash: freshEvidence.deviceBindingEvidence?.providerDeviceIdHash ?? null,
    verificationEvidence: freshEvidence.evidence,
    verifiedAt: now,
    priorLinkLastVerifiedAt: guards.lastVerifiedAt,
    reconciliationProvenance: {
      runId: 'MANIFEST_CHECK',
      authorizationReference: 'MANIFEST_CHECK',
      evidenceCheckedAt: now.toISOString(),
    },
  });

  const freshRow: LegacyReconcilePlanRow = {
    ...row,
    currentMetadataFingerprint: fingerprintLinkMetadata(guards.metadata),
    proposedMetadataV2: proposed,
    evidenceClassification: freshEvidence.telemetrySourceFamily,
  };
  const entry = buildApprovalManifestEntry(freshRow);
  if (!entry) {
    throw new Error('FRESH_MANIFEST_ENTRY_FAILED');
  }
  return entry;
}

export async function applyLegacyConnectionIdentityReconciliation(
  prisma: PrismaClient,
  auth: LegacyReconcileAuthorization,
  input: { organizationId: string; linkIds: string[]; now?: Date },
): Promise<LegacyReconcileApplyResult[]> {
  assertLegacyReconcileExecuteAuthorization(auth, input);

  const now = input.now ?? new Date();
  const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
    organizationId: input.organizationId,
    linkIds: input.linkIds,
    allowlistLinkIds: auth.allowlistedLinkIds,
    now,
  });

  const manifest = computeDeterministicApprovalManifestFingerprint(plan);
  if (auth.manifestFingerprint!.trim() !== manifest) {
    throw new Error('LEGACY_RECONCILE_MANIFEST_FINGERPRINT_MISMATCH');
  }

  const approvedByLink = new Map<string, LegacyReconcileApprovalManifestEntry>();
  for (const row of plan) {
    if (row.approvalManifestEntry) {
      approvedByLink.set(row.sourceLinkId, row.approvalManifestEntry);
    }
  }

  const results: LegacyReconcileApplyResult[] = [];

  for (const row of plan) {
    if (row.eligibility !== LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE || !row.proposedMetadataV2) {
      results.push({
        outcome: 'SKIPPED',
        sourceLinkId: row.sourceLinkId,
        eligibility: row.eligibility,
        reasonCodes: row.reasonCodes,
      });
      continue;
    }

    const idempotencyKey = `legacy-ci-reconcile:${row.sourceLinkId}:v2`;
    const existingAudit = await prisma.vehicleConnectionIdentityReconciliationAudit.findUnique({
      where: { idempotencyKey },
    });
    if (existingAudit?.outcome === 'APPLIED') {
      results.push({
        outcome: 'NO_OP',
        sourceLinkId: row.sourceLinkId,
        reason: 'IDEMPOTENT_AUDIT_EXISTS',
      });
      continue;
    }

    const approvedEntry = approvedByLink.get(row.sourceLinkId);
    if (!approvedEntry) {
      results.push({
        outcome: 'SKIPPED',
        sourceLinkId: row.sourceLinkId,
        eligibility: LEGACY_RECONCILE_ELIGIBILITY.CONCURRENT_CHANGE_RISK,
        reasonCodes: ['APPROVED_MANIFEST_ENTRY_MISSING'],
      });
      continue;
    }

    const proposed = {
      ...row.proposedMetadataV2,
      reconciliationProvenance: {
        runId: auth.runId,
        authorizationReference: auth.authorizationReference,
        operatorReference: auth.operatorReference ?? null,
        evidenceCheckedAt: now.toISOString(),
        dryRunManifestFingerprint: manifest,
        productionReleaseSha: auth.productionReleaseSha ?? null,
      },
    };

    try {
      const applied = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT id FROM vehicle_data_source_links
          WHERE id = ${row.sourceLinkId}::text
          FOR UPDATE
        `;

        const freshEntry = await buildFreshApprovalEntryInTx(tx, row, now);
        if (!entriesMatchApprovedManifest(approvedEntry, freshEntry)) {
          throw new Error('APPROVED_MANIFEST_STALE');
        }

        const guards = await assertLegacyReconcileLinkGuards(tx, {
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          sourceLinkId: row.sourceLinkId,
          now,
        });

        const beforeFingerprint = fingerprintLinkMetadata(guards.metadata);
        if (beforeFingerprint !== row.currentMetadataFingerprint) {
          throw new Error('CONCURRENT_CHANGE_RISK');
        }

        const parsed = parseConnectionIdentityFromLinkMetadata(guards.metadata);
        if (parsed) {
          throw new Error('ALREADY_RECONCILED');
        }

        const beforeMetadataJson = guards.metadata;
        const beforeLastVerifiedAt = guards.lastVerifiedAt;

        const merged = mergeConnectionIdentityMetadata(guards.metadata, proposed);
        const afterFingerprint = fingerprintLinkMetadata(merged);

        const updateCount = await tx.$executeRaw`
          UPDATE vehicle_data_source_links
          SET metadata = ${JSON.stringify(merged)}::jsonb,
              last_verified_at = ${now}
          WHERE id = ${row.sourceLinkId}
            AND is_active = true
            AND (metadata->'connectionIdentity') IS NULL
        `;
        if (updateCount !== 1) {
          throw new Error('CONCURRENT_CHANGE_RISK');
        }

        const audit = await tx.vehicleConnectionIdentityReconciliationAudit.create({
          data: {
            organizationId: row.organizationId,
            vehicleId: row.vehicleId,
            sourceLinkId: row.sourceLinkId,
            idempotencyKey,
            outcome: 'APPLIED',
            beforeMetadataFingerprint: beforeFingerprint,
            afterMetadataFingerprint: afterFingerprint,
            beforeMetadataJson: beforeMetadataJson as Prisma.InputJsonValue,
            afterMetadataJson: merged as Prisma.InputJsonValue,
            beforeLastVerifiedAt,
            afterLastVerifiedAt: now,
            evidenceProvenance: {
              telemetrySourceFamily: row.evidenceClassification,
              approvalManifestEntry: approvedEntry,
              verificationEvidence: proposed.verificationEvidence,
              physicalEpisodeAttestation: {
                independentlyProven: false,
                reason: 'PROVIDER_MIRROR_ONLY_NOT_EPISODE_PROOF',
              },
            },
            operatorReference: auth.operatorReference ?? null,
            authorizationReference: auth.authorizationReference,
            runId: auth.runId,
            productionReleaseSha: auth.productionReleaseSha ?? null,
          },
        });

        return { auditId: audit.id, afterFingerprint };
      });

      results.push({
        outcome: 'APPLIED',
        sourceLinkId: row.sourceLinkId,
        auditId: applied.auditId,
        afterFingerprint: applied.afterFingerprint,
      });
    } catch (err) {
      results.push({
        outcome: 'SKIPPED',
        sourceLinkId: row.sourceLinkId,
        eligibility: LEGACY_RECONCILE_ELIGIBILITY.CONCURRENT_CHANGE_RISK,
        reasonCodes: [err instanceof Error ? err.message : 'UNKNOWN'],
      });
    }
  }

  return results;
}

export async function rollbackLegacyConnectionIdentityReconciliation(
  prisma: PrismaClient,
  auth: LegacyReconcileRollbackAuthorization,
): Promise<{ outcome: 'ROLLED_BACK' | 'NO_OP'; reason?: string }> {
  assertLegacyReconcileRollbackAuthorization(auth);

  const audit = await prisma.vehicleConnectionIdentityReconciliationAudit.findUnique({
    where: { id: auth.targetAuditId.trim() },
  });
  if (!audit || audit.outcome !== 'APPLIED') {
    return { outcome: 'NO_OP', reason: 'AUDIT_NOT_APPLIED' };
  }
  if (audit.rollbackAuditId) {
    return { outcome: 'NO_OP', reason: 'ALREADY_ROLLED_BACK' };
  }
  if (!audit.beforeMetadataJson) {
    return { outcome: 'NO_OP', reason: 'ROLLBACK_SNAPSHOT_MISSING' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM vehicle_data_source_links
        WHERE id = ${audit.sourceLinkId}::text
        FOR UPDATE
      `;

      const locked = await tx.vehicleDataSourceLink.findUnique({ where: { id: audit.sourceLinkId } });
      if (!locked) {
        throw new Error('LINK_MISSING');
      }

      const currentFingerprint = fingerprintLinkMetadata(locked.metadata);
      if (currentFingerprint !== audit.afterMetadataFingerprint) {
        throw new Error('NEWER_LEGITIMATE_CHANGE');
      }

      const rollbackCount = await tx.$executeRaw`
        UPDATE vehicle_data_source_links
        SET metadata = ${JSON.stringify(audit.beforeMetadataJson)}::jsonb,
            last_verified_at = ${audit.beforeLastVerifiedAt}
        WHERE id = ${audit.sourceLinkId}
          AND is_active = true
      `;
      if (rollbackCount !== 1) {
        throw new Error('ROLLBACK_CAS_FAILED');
      }

      const afterRollbackFingerprint = fingerprintLinkMetadata(audit.beforeMetadataJson);
      const rollbackAudit = await tx.vehicleConnectionIdentityReconciliationAudit.create({
        data: {
          organizationId: audit.organizationId,
          vehicleId: audit.vehicleId,
          sourceLinkId: audit.sourceLinkId,
          idempotencyKey: `${audit.idempotencyKey}:rollback`,
          outcome: 'ROLLED_BACK',
          beforeMetadataFingerprint: audit.afterMetadataFingerprint,
          afterMetadataFingerprint: afterRollbackFingerprint,
          beforeMetadataJson: locked.metadata as Prisma.InputJsonValue,
          afterMetadataJson: audit.beforeMetadataJson as Prisma.InputJsonValue,
          beforeLastVerifiedAt: locked.lastVerifiedAt,
          afterLastVerifiedAt: audit.beforeLastVerifiedAt,
          evidenceProvenance: { rollbackOf: audit.id, runId: auth.runId },
          operatorReference: auth.operatorReference,
          authorizationReference: auth.authorizationReference,
          runId: auth.runId,
          productionReleaseSha: audit.productionReleaseSha,
        },
      });

      await tx.vehicleConnectionIdentityReconciliationAudit.update({
        where: { id: audit.id },
        data: { rollbackAuditId: rollbackAudit.id },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    if (message === 'NEWER_LEGITIMATE_CHANGE' || message === 'ROLLBACK_CAS_FAILED') {
      return { outcome: 'NO_OP', reason: message };
    }
    throw err;
  }

  return { outcome: 'ROLLED_BACK' };
}
