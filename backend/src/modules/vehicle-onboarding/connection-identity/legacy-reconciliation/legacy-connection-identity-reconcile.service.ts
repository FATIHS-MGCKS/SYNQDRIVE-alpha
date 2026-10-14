import {
  Prisma,
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import type { PrismaClient, VehicleConnectionIdentityReconciliationAudit } from '@prisma/client';
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
  assertExactCohortPlanCoverage,
  assertUniqueNonemptyLinkIds,
  computeCohortApprovalManifestFingerprint,
  extractApprovalManifestEntryFromAudit,
} from './legacy-reconcile-cohort';
import { validateLegacyReconcileConsent } from './legacy-reconcile-consent';
import {
  assertLegacyReconcileExecuteAuthorization,
  assertLegacyReconcileRollbackAuthorization,
  type LegacyReconcileRollbackAuthorization,
} from './legacy-reconcile-authorization';
import { LegacyReconcileFailFastError } from './legacy-reconcile-fail-fast';
import { assertLegacyReconcileLinkGuards } from './legacy-reconcile-link-guards';
import {
  resolveLinkMetadataStorageState,
  fingerprintLinkMetadataStorage,
  auditJsonValueForPrismaWrite,
  mergeConnectionIdentityIntoMetadata,
  snapshotLinkMetadataForAudit,
  type LinkMetadataAuditSnapshot,
  type LinkMetadataStorageState,
} from './legacy-reconcile-metadata-snapshot';
import {
  LEGACY_RECONCILE_ELIGIBILITY,
  type LegacyReconcileAuthorization,
  type LegacyReconcilePlanRow,
} from './legacy-connection-identity-reconcile.types';

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
  consent: {
    id: string;
    vehicleId: string;
    organizationId: string;
    provider: string;
    grantType: VehicleProviderConsentGrantType;
    status: VehicleProviderConsentStatus;
    revokedAt: Date | null;
    expiresAt: Date | null;
    providerVehicleRef: string | null;
  } | null;
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
          select: {
            id: true,
            vehicleId: true,
            organizationId: true,
            provider: true,
            grantType: true,
            status: true,
            revokedAt: true,
            expiresAt: true,
            providerVehicleRef: true,
          },
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
    const metadataStorageState = await resolveLinkMetadataStorageState(prisma, link.id, link.metadata);
    const currentFingerprint = fingerprintLinkMetadataStorage(link.metadata, metadataStorageState);
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

    const consentVerdict = validateLegacyReconcileConsent({
      consent: link.consent,
      vehicleId: link.vehicleId,
      organizationId: link.vehicle.organizationId,
      dimoExternalId: link.dimoVehicle?.externalId,
      now,
    });
    if (!consentVerdict.ok) {
      reasonCodes.push(consentVerdict.reasonCode);
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

    const proposedEnvelope = mergeConnectionIdentityIntoMetadata(link.metadata, proposed);
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
  const merged = mergeConnectionIdentityIntoMetadata(
    existing,
    connectionIdentity as Prisma.InputJsonValue,
  );
  return merged as Record<string, unknown>;
}

export type LegacyReconcileApplyResult =
  | { outcome: 'NO_OP'; sourceLinkId: string; reason: string }
  | { outcome: 'APPLIED'; sourceLinkId: string; auditId: string; afterFingerprint: string }
  | { outcome: 'SKIPPED'; sourceLinkId: string; eligibility: string; reasonCodes: string[] };

function lastVerifiedAtEqual(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

async function loadAppliedAuditsByLink(
  prisma: PrismaClient,
  linkIds: string[],
): Promise<Map<string, VehicleConnectionIdentityReconciliationAudit>> {
  const keys = linkIds.map((id) => `legacy-ci-reconcile:${id}:v2`);
  const audits = await prisma.vehicleConnectionIdentityReconciliationAudit.findMany({
    where: { idempotencyKey: { in: keys }, outcome: 'APPLIED' },
  });
  const byLink = new Map<string, VehicleConnectionIdentityReconciliationAudit>();
  for (const audit of audits) {
    byLink.set(audit.sourceLinkId, audit);
  }
  return byLink;
}

function assertRepeatExecuteAuthorizationMatches(
  auth: LegacyReconcileAuthorization,
  audit: VehicleConnectionIdentityReconciliationAudit,
  manifestFingerprint: string,
): void {
  if (audit.authorizationReference !== auth.authorizationReference) {
    throw new Error('LEGACY_RECONCILE_REPEAT_AUTHORIZATION_MISMATCH');
  }
  if (audit.runId !== auth.runId) {
    throw new Error('LEGACY_RECONCILE_REPEAT_RUN_MISMATCH');
  }
  if ((audit.operatorReference ?? null) !== (auth.operatorReference ?? null)) {
    throw new Error('LEGACY_RECONCILE_REPEAT_OPERATOR_MISMATCH');
  }
  if ((audit.productionReleaseSha ?? null) !== (auth.productionReleaseSha ?? null)) {
    throw new Error('LEGACY_RECONCILE_REPEAT_RELEASE_MISMATCH');
  }
  const provenance = audit.evidenceProvenance as { approvedManifestFingerprint?: string };
  if (provenance.approvedManifestFingerprint !== manifestFingerprint) {
    throw new Error('LEGACY_RECONCILE_REPEAT_MANIFEST_MISMATCH');
  }
}

async function verifyIdempotentRepeatExecute(
  prisma: PrismaClient,
  auth: LegacyReconcileAuthorization,
  audit: VehicleConnectionIdentityReconciliationAudit,
  manifestFingerprint: string,
  linkId: string,
): Promise<LegacyReconcileApplyResult> {
  assertRepeatExecuteAuthorizationMatches(auth, audit, manifestFingerprint);
  const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
  if (!link) {
    throw new Error('LEGACY_RECONCILE_REPEAT_LINK_MISSING');
  }
  const currentFingerprint = fingerprintLinkMetadata(link.metadata);
  if (currentFingerprint !== audit.afterMetadataFingerprint) {
    throw new Error('LEGACY_RECONCILE_REPEAT_IDENTITY_DRIFT');
  }
  if (!lastVerifiedAtEqual(link.lastVerifiedAt, audit.afterLastVerifiedAt)) {
    throw new Error('LEGACY_RECONCILE_REPEAT_TIMESTAMP_DRIFT');
  }
  return { outcome: 'NO_OP', sourceLinkId: linkId, reason: 'IDEMPOTENT_AUDIT_EXISTS' };
}

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
    currentMetadataFingerprint: fingerprintLinkMetadataStorage(
      guards.metadata,
      guards.metadataStorageState,
    ),
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
  const linkIds = assertUniqueNonemptyLinkIds(input.linkIds);
  const now = input.now ?? new Date();

  const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
    organizationId: input.organizationId,
    linkIds,
    allowlistLinkIds: auth.allowlistedLinkIds,
    now,
  });
  assertExactCohortPlanCoverage(linkIds, plan, input.organizationId);

  const appliedAudits = await loadAppliedAuditsByLink(prisma, linkIds);
  const manifestFingerprint = computeCohortApprovalManifestFingerprint(linkIds, plan, appliedAudits);
  await assertLegacyReconcileExecuteAuthorization(
    prisma,
    auth,
    { organizationId: input.organizationId, linkIds },
    manifestFingerprint,
  );

  const planById = new Map(plan.map((row) => [row.sourceLinkId, row]));
  const results: LegacyReconcileApplyResult[] = [];

  for (const linkId of linkIds) {
    const existingAudit = appliedAudits.get(linkId);
    if (existingAudit) {
      results.push(await verifyIdempotentRepeatExecute(prisma, auth, existingAudit, manifestFingerprint, linkId));
      continue;
    }

    const row = planById.get(linkId)!;
    if (row.eligibility !== LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE || !row.proposedMetadataV2) {
      const reasonCodes = row.reasonCodes.length ? row.reasonCodes : ['INELIGIBLE'];
      results.push({
        outcome: 'SKIPPED',
        sourceLinkId: row.sourceLinkId,
        eligibility: row.eligibility,
        reasonCodes,
      });
      throw new LegacyReconcileFailFastError(row.sourceLinkId, reasonCodes, results);
    }

    const approvedEntry = row.approvalManifestEntry;
    if (!approvedEntry) {
      const reasonCodes = ['APPROVED_MANIFEST_ENTRY_MISSING'];
      results.push({
        outcome: 'SKIPPED',
        sourceLinkId: row.sourceLinkId,
        eligibility: LEGACY_RECONCILE_ELIGIBILITY.CONCURRENT_CHANGE_RISK,
        reasonCodes,
      });
      throw new LegacyReconcileFailFastError(row.sourceLinkId, reasonCodes, results);
    }

    const idempotencyKey = `legacy-ci-reconcile:${row.sourceLinkId}:v2`;
    const proposed = {
      ...row.proposedMetadataV2,
      reconciliationProvenance: {
        runId: auth.runId,
        authorizationReference: auth.authorizationReference,
        operatorReference: auth.operatorReference ?? null,
        evidenceCheckedAt: now.toISOString(),
        dryRunManifestFingerprint: manifestFingerprint,
        productionReleaseSha: auth.productionReleaseSha ?? null,
      },
    };

    try {
      const applied = await prisma.$transaction(async (tx) => {
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

        const beforeFingerprint = fingerprintLinkMetadataStorage(
          guards.metadata,
          guards.metadataStorageState,
        );
        if (beforeFingerprint !== row.currentMetadataFingerprint) {
          throw new Error('CONCURRENT_CHANGE_RISK');
        }

        const parsed = parseConnectionIdentityFromLinkMetadata(guards.metadata);
        if (parsed) {
          throw new Error('ALREADY_RECONCILED');
        }

        const beforeSnapshot = snapshotLinkMetadataForAudit(
          guards.metadata,
          guards.metadataStorageState,
        );
        const merged = mergeConnectionIdentityIntoMetadata(
          guards.metadata,
          proposed as Prisma.InputJsonValue,
        );
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
            beforeMetadataJson: beforeSnapshot.metadataJson,
            afterMetadataJson: merged as Prisma.InputJsonValue,
            beforeLastVerifiedAt: guards.lastVerifiedAt,
            afterLastVerifiedAt: now,
            evidenceProvenance: {
              telemetrySourceFamily: row.evidenceClassification,
              approvalManifestEntry: approvedEntry,
              approvedManifestFingerprint: manifestFingerprint,
              beforeMetadataStorageState: beforeSnapshot.storageState,
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
      const reasonCodes = [err instanceof Error ? err.message : 'UNKNOWN'];
      results.push({
        outcome: 'SKIPPED',
        sourceLinkId: row.sourceLinkId,
        eligibility: LEGACY_RECONCILE_ELIGIBILITY.CONCURRENT_CHANGE_RISK,
        reasonCodes,
      });
      throw new LegacyReconcileFailFastError(row.sourceLinkId, reasonCodes, results);
    }
  }

  return results;
}

export { LegacyReconcileFailFastError } from './legacy-reconcile-fail-fast';

function resolveRollbackBeforeSnapshot(audit: VehicleConnectionIdentityReconciliationAudit): LinkMetadataAuditSnapshot {
  const provenance = audit.evidenceProvenance as { beforeMetadataStorageState?: LinkMetadataStorageState };
  const storageState = provenance.beforeMetadataStorageState ?? 'OBJECT';
  if (storageState === 'SQL_ABSENT') {
    return { storageState };
  }
  if (storageState === 'JSON_NULL') {
    return { storageState, metadataJson: Prisma.JsonNull };
  }
  return { storageState, metadataJson: audit.beforeMetadataJson as Prisma.InputJsonValue };
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
      if (!lastVerifiedAtEqual(locked.lastVerifiedAt, audit.afterLastVerifiedAt)) {
        throw new Error('NEWER_LEGITIMATE_CHANGE');
      }

      const beforeSnapshot = resolveRollbackBeforeSnapshot(audit);

      let rollbackCount: number;
      if (beforeSnapshot.storageState === 'SQL_ABSENT') {
        rollbackCount = await tx.$executeRaw`
          UPDATE vehicle_data_source_links
          SET metadata = NULL,
              last_verified_at = ${audit.beforeLastVerifiedAt}
          WHERE id = ${audit.sourceLinkId}
            AND is_active = true
            AND last_verified_at IS NOT DISTINCT FROM ${audit.afterLastVerifiedAt}
        `;
      } else if (beforeSnapshot.storageState === 'JSON_NULL') {
        rollbackCount = await tx.$executeRaw`
          UPDATE vehicle_data_source_links
          SET metadata = 'null'::jsonb,
              last_verified_at = ${audit.beforeLastVerifiedAt}
          WHERE id = ${audit.sourceLinkId}
            AND is_active = true
            AND last_verified_at IS NOT DISTINCT FROM ${audit.afterLastVerifiedAt}
        `;
      } else {
        rollbackCount = await tx.$executeRaw`
          UPDATE vehicle_data_source_links
          SET metadata = ${JSON.stringify(beforeSnapshot.metadataJson)}::jsonb,
              last_verified_at = ${audit.beforeLastVerifiedAt}
          WHERE id = ${audit.sourceLinkId}
            AND is_active = true
            AND last_verified_at IS NOT DISTINCT FROM ${audit.afterLastVerifiedAt}
        `;
      }

      if (rollbackCount !== 1) {
        throw new Error('ROLLBACK_CAS_FAILED');
      }

      const afterRollbackFingerprint = fingerprintLinkMetadataStorage(
        beforeSnapshot.storageState === 'SQL_ABSENT' ? null : beforeSnapshot.metadataJson,
        beforeSnapshot.storageState,
      );

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
          afterMetadataJson: auditJsonValueForPrismaWrite(beforeSnapshot.metadataJson),
          beforeLastVerifiedAt: locked.lastVerifiedAt,
          afterLastVerifiedAt: audit.beforeLastVerifiedAt,
          evidenceProvenance: { rollbackOf: audit.id, runId: auth.runId, restoreValueKind: beforeSnapshot.storageState },
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
